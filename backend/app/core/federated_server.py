import torch
import torch.nn as nn
import numpy as np
from typing import Dict, List, Optional, Tuple, Callable
import random
import time
import traceback
import os

from app.models.nn_models import (
    create_model, get_model_params, set_model_params, get_model_size_bytes
)
from app.core.dataset_loader import load_dataset, create_client_dataloaders, create_test_loader
from app.core.federated_client import FedClient, evaluate_model
from app.core.secure_aggregation import SecureAggregator
from app.core.byzantine import ByzantineAttack, RobustAggregator
from app.core.differential_privacy import DifferentialPrivacyEngine, PrivacyAccountant
from app.database import SessionLocal
from app import models
from app.config import settings


class FedServer:
    def __init__(
        self,
        experiment_id: int,
        config: dict,
        websocket_callback: Optional[Callable] = None,
        redis_callback: Optional[Callable] = None
    ):
        self.experiment_id = experiment_id
        self.config = config
        self.ws_callback = websocket_callback
        self.redis_callback = redis_callback

        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        self.dataset_name = config['dataset_name']
        self.model_name = config['model_name']
        self.num_clients = config['num_clients']
        self.num_rounds = config['num_rounds']
        self.client_sample_rate = config.get('client_sample_rate', 1.0)
        self.local_epochs = config.get('local_epochs', 5)
        self.batch_size = config.get('batch_size', 64)
        self.learning_rate = config.get('learning_rate', 0.01)

        self.algorithm = config.get('algorithm', 'fedavg')
        self.fedprox_mu = config.get('fedprox_mu', 0.01)

        self.secure_agg = config.get('secure_aggregation', False)
        self.secagg_threshold = config.get('secagg_threshold', max(2, self.num_clients // 2))
        self.secagg_dropout_rate = config.get('secagg_dropout_rate', 0.1)

        self.use_dp = config.get('differential_privacy', False)
        self.dp_clip_norm = config.get('dp_clip_norm', 1.0)
        self.dp_noise_multiplier = config.get('dp_noise_multiplier', 1.0)
        self.dp_target_epsilon = config.get('dp_target_epsilon', 5.0)
        self.dp_delta = config.get('dp_delta', 1e-5)

        self.non_iid_mode = config.get('non_iid_mode', 'iid')
        self.non_iid_alpha = config.get('non_iid_alpha', 0.5)

        self.num_byzantine = config.get('num_byzantine', 0)
        self.byzantine_attack_type = config.get('byzantine_attack', 'random')
        self.robust_agg_method = config.get('robust_aggregation', 'none')

        self.clients: Dict[int, FedClient] = {}
        self.global_model: Optional[nn.Module] = None
        self.global_params: Optional[List[np.ndarray]] = None
        self.test_loader = None
        self.train_dataset = None
        self.client_sizes: Dict[int, int] = {}
        self.client_dist_stats = None

        self.secure_aggregator = None
        self.byzantine_attacker = None
        self.robust_aggregator = None
        self.dp_engine = None
        self.privacy_accountant = None

        self.byzantine_client_ids: List[int] = []

        self.current_round = 0
        self.total_communication = 0.0
        self.is_running = False
        self.stop_requested = False

        self.resume_from_round = config.get('resume_from_round', 0)
        self._checkpoint_base_dir = os.path.join(
            settings.DATA_DIR, "checkpoints", f"experiment_{experiment_id}"
        )

    def _save_checkpoint(self, round_num: int):
        try:
            os.makedirs(self._checkpoint_base_dir, exist_ok=True)
            checkpoint_path = os.path.join(
                self._checkpoint_base_dir, f"round_{round_num}.pt"
            )
            checkpoint = {
                'round_num': round_num,
                'global_params': [p.tolist() for p in self.global_params],
                'total_communication': self.total_communication,
            }
            if self.use_dp and self.privacy_accountant is not None:
                checkpoint['current_epsilon'] = self.privacy_accountant.total_epsilon
            torch.save(checkpoint, checkpoint_path)
            self._log(f"Checkpoint saved: {checkpoint_path}")
        except Exception as e:
            self._log(f"Failed to save checkpoint for round {round_num}: {e}", "error")

    def _load_checkpoint(self, round_num: int) -> bool:
        try:
            checkpoint_path = os.path.join(
                self._checkpoint_base_dir, f"round_{round_num}.pt"
            )
            if not os.path.exists(checkpoint_path):
                self._log(f"Checkpoint file not found: {checkpoint_path}", "error")
                return False
            checkpoint = torch.load(checkpoint_path, map_location='cpu', weights_only=False)
            self.global_params = [np.array(p, dtype=np.float32) for p in checkpoint['global_params']]
            set_model_params(self.global_model, self.global_params)
            self.total_communication = checkpoint.get('total_communication', 0.0)
            if self.use_dp and self.privacy_accountant is not None:
                saved_epsilon = checkpoint.get('current_epsilon', 0.0)
                self.privacy_accountant.total_epsilon = saved_epsilon
            self._log(f"Checkpoint loaded from round {round_num}")
            return True
        except Exception as e:
            self._log(f"Failed to load checkpoint from round {round_num}: {e}", "error")
            return False

    def _log(self, message: str, level: str = "info"):
        print(f"[Experiment {self.experiment_id}] [{level.upper()}] {message}", flush=True)
        if self.ws_callback:
            try:
                self.ws_callback({
                    'type': 'log',
                    'experiment_id': self.experiment_id,
                    'round': self.current_round,
                    'message': message,
                    'level': level
                })
            except Exception:
                pass

    def _send_progress(self, status: str, **kwargs):
        msg_type = status if status in ['round_complete', 'completed', 'error', 'initializing', 'training_round'] else 'progress'
        data = {
            'type': msg_type,
            'experiment_id': self.experiment_id,
            'round': self.current_round,
            'status': status,
            **kwargs
        }
        if self.ws_callback:
            try:
                self.ws_callback(data)
            except Exception:
                pass
        if self.redis_callback:
            try:
                self.redis_callback(f"experiment:{self.experiment_id}:ws", data)
            except Exception:
                pass

    def _update_db_status(self, status: str, **fields):
        db = SessionLocal()
        try:
            exp = db.query(models.Experiment).filter(
                models.Experiment.id == self.experiment_id
            ).first()
            if exp:
                exp.status = status
                for key, value in fields.items():
                    if hasattr(exp, key):
                        setattr(exp, key, value)
                db.commit()
        except Exception as e:
            self._log(f"DB update error: {e}", "error")
        finally:
            db.close()

    def _save_round_result(self, round_num: int, data: dict):
        db = SessionLocal()
        try:
            rr = models.RoundResult(
                experiment_id=self.experiment_id,
                round_num=round_num,
                **data
            )
            db.add(rr)

            exp = db.query(models.Experiment).filter(
                models.Experiment.id == self.experiment_id
            ).first()
            if exp:
                if 'epsilon_consumed' in data:
                    exp.current_epsilon += data['epsilon_consumed']
                if 'communication_bytes' in data:
                    exp.total_communication += data['communication_bytes']
                if data.get('global_accuracy') is not None:
                    exp.final_accuracy = data['global_accuracy']
            db.commit()
        except Exception as e:
            self._log(f"Save round result error: {e}", "error")
        finally:
            db.close()

    def initialize(self) -> Tuple[bool, str]:
        try:
            self._log("Initializing federated learning experiment...")
            self._send_progress("initializing")

            self._log(f"Loading {self.dataset_name} dataset...")
            self.train_dataset, test_dataset = load_dataset(self.dataset_name)

            num_classes = 10
            self.global_model = create_model(self.model_name, self.dataset_name, num_classes)
            self.global_params = get_model_params(self.global_model)
            self.test_loader = create_test_loader(test_dataset)

            self._log(f"Creating {self.num_clients} clients with mode={self.non_iid_mode}...")
            client_loaders, self.client_dist_stats, _ = create_client_dataloaders(
                self.train_dataset,
                self.num_clients,
                self.non_iid_mode,
                self.non_iid_alpha,
                self.batch_size
            )

            for cid, loader in client_loaders.items():
                client_model = create_model(self.model_name, self.dataset_name, num_classes)
                data_size = len(loader.dataset)
                self.client_sizes[cid] = data_size
                self.clients[cid] = FedClient(
                    client_id=cid,
                    model=client_model,
                    dataloader=loader,
                    device=self.device,
                    data_size=data_size
                )

            self._update_db_status(
                "running",
                client_distribution=self.client_dist_stats
            )

            if self.num_byzantine > 0:
                all_ids = list(range(self.num_clients))
                self.byzantine_client_ids = random.sample(all_ids, self.num_byzantine)
                self._log(f"Byzantine clients: {self.byzantine_client_ids}")
                self.byzantine_attacker = ByzantineAttack(self.byzantine_attack_type)
                for cid in self.byzantine_client_ids:
                    self.clients[cid].is_byzantine = True

                if self.robust_agg_method != "none":
                    self.robust_aggregator = RobustAggregator(
                        self.robust_agg_method, self.num_byzantine
                    )
                    self._log(f"Robust aggregation enabled: {self.robust_agg_method}")

            if self.secure_agg:
                self.secure_aggregator = SecureAggregator(
                    self.num_clients, self.secagg_threshold, self.secagg_dropout_rate
                )
                self._log(f"Secure aggregation enabled (threshold={self.secagg_threshold}, dropout={self.secagg_dropout_rate})")

                test_updates = {}
                for cid in range(min(5, self.num_clients)):
                    test_updates[cid] = [
                        np.random.randn(20, 20).astype(np.float32) * 0.1,
                        np.random.randn(10).astype(np.float32) * 0.05
                    ]
                verify_result = self.secure_aggregator.verify_cancellation(test_updates)
                self._log(f"SecAgg mask cancellation verification: {verify_result}")

                agg_test_result, agg_test_info = self.secure_aggregator.secure_aggregate(test_updates)
                self._log(f"SecAgg full aggregation test: survived={agg_test_info['surviving_clients']}, "
                         f"dropped={agg_test_info['dropped_clients']}, "
                         f"rel_error={agg_test_info['aggregation_error_rel']:.6f}, "
                         f"within_tolerance={agg_test_info['error_within_tolerance']}")

            if self.use_dp:
                dataset_size = len(self.train_dataset)
                self.dp_engine = DifferentialPrivacyEngine(
                    clip_norm=self.dp_clip_norm,
                    noise_multiplier=self.dp_noise_multiplier,
                    target_epsilon=self.dp_target_epsilon,
                    delta=self.dp_delta,
                    batch_size=self.batch_size,
                    dataset_size=dataset_size
                )
                self.privacy_accountant = PrivacyAccountant(
                    self.dp_target_epsilon, self.dp_delta
                )
                self._log(f"Differential privacy enabled (epsilon={self.dp_target_epsilon})")

            self.is_running = True
            self._log("Initialization complete. Starting training...")
            return True, "OK"

        except Exception as e:
            error_msg = f"Initialization failed: {str(e)}\n{traceback.format_exc()}"
            self._log(error_msg, "error")
            self._update_db_status("error", error_message=error_msg)
            return False, error_msg

    def _sample_clients(self) -> List[int]:
        all_ids = list(range(self.num_clients))
        num_sample = max(1, int(len(all_ids) * self.client_sample_rate))
        if num_sample >= len(all_ids):
            return all_ids
        return random.sample(all_ids, num_sample)

    def _local_training(
        self,
        client_ids: List[int]
    ) -> Tuple[Dict[int, List[np.ndarray]], Dict[int, Dict]]:
        client_updates = {}
        client_stats = {}

        for cid in client_ids:
            client = self.clients[cid]

            try:
                if self.algorithm == "fedprox":
                    update, stats = client.train_fedprox(
                        self.global_params,
                        local_epochs=self.local_epochs,
                        learning_rate=self.learning_rate,
                        mu=self.fedprox_mu,
                        dp_engine=self.dp_engine if self.use_dp else None
                    )
                else:
                    update, stats = client.train_fedavg(
                        self.global_params,
                        local_epochs=self.local_epochs,
                        learning_rate=self.learning_rate,
                        dp_engine=self.dp_engine if self.use_dp else None
                    )

                client_updates[cid] = update
                client_stats[cid] = stats

            except Exception as e:
                self._log(f"Client {cid} training failed: {e}", "error")

        return client_updates, client_stats

    def _aggregate_updates(
        self,
        client_updates: Dict[int, List[np.ndarray]],
        client_ids: List[int]
    ) -> Tuple[List[np.ndarray], Dict]:
        weights = {}
        total_size = sum(self.client_sizes[cid] for cid in client_ids if cid in self.client_sizes)
        for cid in client_ids:
            if cid in self.client_sizes:
                weights[cid] = self.client_sizes[cid] / max(1, total_size)

        agg_info = {}

        if self.num_byzantine > 0 and self.byzantine_attacker is not None:
            client_updates = self.byzantine_attacker.apply_to_client_updates(
                client_updates, self.byzantine_client_ids
            )

        if self.robust_aggregator is not None and self.robust_agg_method != "none":
            aggregated_update, agg_info = self.robust_aggregator.aggregate(
                client_updates, weights, self.byzantine_client_ids
            )
        else:
            if self.secure_agg and self.secure_aggregator is not None:
                self._log(f"Running SECURE AGGREGATION with Shamir secret sharing (threshold={self.secagg_threshold})")
                aggregated_update, secagg_info = self.secure_aggregator.secure_aggregate(
                    client_updates, weights
                )
                agg_info.update(secagg_info)
                self._log(
                    f"  - Shamir threshold: {secagg_info.get('shamir_threshold')}\n"
                    f"  - Clients: {secagg_info.get('total_clients')} total, "
                    f"{secagg_info.get('surviving_clients')} survived, "
                    f"{secagg_info.get('dropped_clients')} dropped\n"
                    f"  - Dropped IDs: {secagg_info.get('dropped_ids')}\n"
                    f"  - Aggregation relative error: {secagg_info.get('aggregation_error_rel', 0):.6f}\n"
                    f"  - Within tolerance: {secagg_info.get('error_within_tolerance')}"
                )
            else:
                template = list(client_updates.values())[0] if client_updates else []
                aggregated_update = [np.zeros_like(t) for t in template]
                total_w = 0.0
                for cid in client_ids:
                    if cid in client_updates:
                        w = weights.get(cid, 1.0)
                        total_w += w
                        for i, u in enumerate(client_updates[cid]):
                            aggregated_update[i] += w * u
                if total_w > 0:
                    for i in range(len(aggregated_update)):
                        aggregated_update[i] /= total_w

                agg_info = {'method': 'fedavg_weighted'}

        return aggregated_update, agg_info

    def _apply_update(self, aggregated_update: List[np.ndarray]):
        for i in range(len(self.global_params)):
            self.global_params[i] += aggregated_update[i]
        set_model_params(self.global_model, self.global_params)

    def run(self) -> bool:
        if not self.is_running:
            success, msg = self.initialize()
            if not success:
                return False

        try:
            start_round = 1
            if self.resume_from_round > 0:
                self._log(f"Resuming from checkpoint at round {self.resume_from_round}...")
                if self._load_checkpoint(self.resume_from_round):
                    start_round = self.resume_from_round + 1
                    self._log(f"Resuming training from round {start_round}")
                else:
                    self._log("Checkpoint load failed, starting from round 1", "warning")

            for round_num in range(start_round, self.num_rounds + 1):
                if self.stop_requested:
                    self._log("Training stopped by user request")
                    self._update_db_status("stopped")
                    return False

                self.current_round = round_num
                round_start = time.time()
                self._log(f"\n=== Round {round_num}/{self.num_rounds} ===")
                self._send_progress("training_round", message=f"Starting round {round_num}")

                client_ids = self._sample_clients()
                self._log(f"Sampled {len(client_ids)} clients: {client_ids}")

                client_updates, client_stats = self._local_training(client_ids)
                self._log(f"Local training complete. Got updates from {len(client_updates)} clients")

                if not client_updates:
                    self._log("No client updates received, skipping round", "warning")
                    continue

                aggregated_update, agg_info = self._aggregate_updates(client_updates, client_ids)
                self._log(f"Aggregation: {agg_info.get('method', 'unknown')}")

                self._apply_update(aggregated_update)

                model_size = get_model_size_bytes(self.global_model)
                comm_bytes = len(client_updates) * model_size * 2 + model_size

                self._log("Evaluating global model...")
                set_model_params(self.global_model, self.global_params)
                global_acc, global_loss = evaluate_model(
                    self.global_model, self.test_loader, self.device
                )
                self._log(f"Global accuracy: {global_acc:.4f}, loss: {global_loss:.4f}")

                client_accs = [s.get('accuracy', 0) for s in client_stats.values()]
                client_losses = [s.get('loss', 0) for s in client_stats.values()]

                epsilon_round = 0.0
                if self.use_dp and self.privacy_accountant is not None:
                    steps_per_client = self.local_epochs
                    epsilon_round = self.privacy_accountant.simulate_round_cost(
                        clip_norm=self.dp_clip_norm,
                        noise_multiplier=self.dp_noise_multiplier,
                        batch_size=self.batch_size,
                        dataset_size=len(self.train_dataset),
                        local_epochs=steps_per_client,
                        sample_rate=self.client_sample_rate
                    )
                    total_eps, exceeded = self.privacy_accountant.add_round(epsilon_round)
                    self._log(f"Privacy budget used: {total_eps:.4f}/{self.dp_target_epsilon:.4f}")
                    if exceeded:
                        self._log("Privacy budget exceeded! Stopping training.", "warning")
                        self._save_round(
                            round_num, global_acc, global_loss, client_accs, client_losses,
                            client_ids, comm_bytes, epsilon_round, agg_info, round_start
                        )
                        self._save_checkpoint(round_num)
                        self._update_db_status(
                            "privacy_exceeded",
                            final_accuracy=global_acc,
                            current_epsilon=total_eps
                        )
                        self._send_progress(
                            "completed",
                            final_accuracy=global_acc,
                            message="Privacy budget exceeded"
                        )
                        return True

                detected = agg_info.get('detected_byzantine', 0)
                self._save_round(
                    round_num, global_acc, global_loss, client_accs, client_losses,
                    client_ids, comm_bytes, epsilon_round, agg_info, round_start
                )

                self._save_checkpoint(round_num)

                self._send_progress(
                    "round_complete",
                    round_num=round_num,
                    global_accuracy=global_acc,
                    global_loss=global_loss,
                    client_accuracies=client_accs,
                    communication_bytes=comm_bytes,
                    epsilon_consumed=epsilon_round,
                    byzantine_detected=detected,
                    byzantine_total=self.num_byzantine
                )

            self._log(f"\n=== Training Complete ===")
            final_acc = 0.0
            db = SessionLocal()
            try:
                exp = db.query(models.Experiment).filter(
                    models.Experiment.id == self.experiment_id
                ).first()
                if exp:
                    final_acc = exp.final_accuracy or 0.0
            finally:
                db.close()

            self._update_db_status("completed")
            self._send_progress("completed", final_accuracy=final_acc)
            return True

        except Exception as e:
            error_msg = f"Training failed: {str(e)}\n{traceback.format_exc()}"
            self._log(error_msg, "error")
            self._update_db_status("error", error_message=error_msg)
            self._send_progress("error", message=error_msg)
            return False

    def _save_round(
        self,
        round_num: int,
        global_acc: float,
        global_loss: float,
        client_accs: List[float],
        client_losses: List[float],
        client_ids: List[int],
        comm_bytes: float,
        epsilon_round: float,
        agg_info: dict,
        round_start: float
    ):
        round_time = time.time() - round_start
        data = {
            'global_accuracy': global_acc,
            'global_loss': global_loss,
            'client_accuracies': client_accs,
            'client_losses': client_losses,
            'num_participants': len(client_ids),
            'communication_bytes': comm_bytes,
            'epsilon_consumed': epsilon_round,
            'byzantine_detected_count': agg_info.get('detected_byzantine', 0),
            'byzantine_total_count': self.num_byzantine,
            'timestamps': {
                'round_time_seconds': round_time,
                'aggregation_method': agg_info.get('method', 'unknown')
            }
        }
        self._save_round_result(round_num, data)
        self.total_communication += comm_bytes

    def stop(self):
        self.stop_requested = True
        self._log("Stop requested")
