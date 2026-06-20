from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
import logging

from app.database import get_db
from app import models, schemas

EXPERIMENT_TEMPLATES = [
    {
        "id": "fedavg_baseline",
        "name": "标准FedAvg基线对比",
        "description": "10客户端IID均匀分布，20轮，用于建立性能基准",
        "config": {
            "name": "FedAvg基线实验",
            "num_clients": 10,
            "num_rounds": 20,
            "client_sample_rate": 1.0,
            "local_epochs": 5,
            "batch_size": 64,
            "learning_rate": 0.01,
            "algorithm": "fedavg",
            "fedprox_mu": 0.01,
            "secure_aggregation": False,
            "secagg_threshold": 8,
            "secagg_dropout_rate": 0.1,
            "differential_privacy": False,
            "dp_clip_norm": 1.0,
            "dp_noise_multiplier": 1.0,
            "dp_target_epsilon": 5.0,
            "dp_delta": 1e-5,
            "non_iid_mode": "iid",
            "non_iid_alpha": 0.5,
            "num_byzantine": 0,
            "byzantine_attack": "random",
            "robust_aggregation": "none",
            "dataset_name": "mnist",
            "model_name": "mlp",
        },
        "key_params": {
            "客户端数": 10,
            "轮次": 20,
            "数据分布": "IID",
            "算法": "FedAvg",
        }
    },
    {
        "id": "privacy_protection",
        "name": "隐私保护实验",
        "description": "开启差分隐私+安全聚合，epsilon=3.0，用于观察隐私-精度权衡",
        "config": {
            "name": "隐私保护实验",
            "num_clients": 10,
            "num_rounds": 20,
            "client_sample_rate": 1.0,
            "local_epochs": 5,
            "batch_size": 64,
            "learning_rate": 0.01,
            "algorithm": "fedavg",
            "fedprox_mu": 0.01,
            "secure_aggregation": True,
            "secagg_threshold": 8,
            "secagg_dropout_rate": 0.1,
            "differential_privacy": True,
            "dp_clip_norm": 1.0,
            "dp_noise_multiplier": 1.1,
            "dp_target_epsilon": 3.0,
            "dp_delta": 1e-5,
            "non_iid_mode": "iid",
            "non_iid_alpha": 0.5,
            "num_byzantine": 0,
            "byzantine_attack": "random",
            "robust_aggregation": "none",
            "dataset_name": "mnist",
            "model_name": "mlp",
        },
        "key_params": {
            "差分隐私": "ε=3.0",
            "安全聚合": "Shamir (t=8)",
            "噪声倍率": "σ=1.1",
            "裁剪阈值": "C=1.0",
        }
    },
    {
        "id": "extreme_non_iid",
        "name": "极端非IID场景",
        "description": "Label Skew模式alpha=0.1，观察数据异质性对收敛的影响",
        "config": {
            "name": "极端非IID实验",
            "num_clients": 10,
            "num_rounds": 20,
            "client_sample_rate": 1.0,
            "local_epochs": 5,
            "batch_size": 64,
            "learning_rate": 0.01,
            "algorithm": "fedavg",
            "fedprox_mu": 0.01,
            "secure_aggregation": False,
            "secagg_threshold": 8,
            "secagg_dropout_rate": 0.1,
            "differential_privacy": False,
            "dp_clip_norm": 1.0,
            "dp_noise_multiplier": 1.0,
            "dp_target_epsilon": 5.0,
            "dp_delta": 1e-5,
            "non_iid_mode": "label_skew",
            "non_iid_alpha": 0.1,
            "num_byzantine": 0,
            "byzantine_attack": "random",
            "robust_aggregation": "none",
            "dataset_name": "mnist",
            "model_name": "mlp",
        },
        "key_params": {
            "非IID模式": "Label Skew",
            "偏斜程度": "α=0.1",
            "客户端数": 10,
            "算法": "FedAvg",
        }
    },
    {
        "id": "byzantine_defense",
        "name": "拜占庭攻击防御",
        "description": "20%恶意客户端+Krum鲁棒聚合，观察攻击与防御效果",
        "config": {
            "name": "拜占庭攻击防御实验",
            "num_clients": 20,
            "num_rounds": 20,
            "client_sample_rate": 1.0,
            "local_epochs": 5,
            "batch_size": 64,
            "learning_rate": 0.01,
            "algorithm": "fedavg",
            "fedprox_mu": 0.01,
            "secure_aggregation": False,
            "secagg_threshold": 16,
            "secagg_dropout_rate": 0.1,
            "differential_privacy": False,
            "dp_clip_norm": 1.0,
            "dp_noise_multiplier": 1.0,
            "dp_target_epsilon": 5.0,
            "dp_delta": 1e-5,
            "non_iid_mode": "iid",
            "non_iid_alpha": 0.5,
            "num_byzantine": 4,
            "byzantine_attack": "scale",
            "robust_aggregation": "krum",
            "dataset_name": "mnist",
            "model_name": "mlp",
        },
        "key_params": {
            "恶意客户端": "20% (4/20)",
            "攻击类型": "梯度放大",
            "防御算法": "Krum",
            "数据分布": "IID",
        }
    },
    {
        "id": "large_scale_simulation",
        "name": "大规模模拟",
        "description": "20客户端50%采样率，观察客户端采样对通信效率的影响",
        "config": {
            "name": "大规模模拟实验",
            "num_clients": 20,
            "num_rounds": 20,
            "client_sample_rate": 0.5,
            "local_epochs": 5,
            "batch_size": 64,
            "learning_rate": 0.01,
            "algorithm": "fedavg",
            "fedprox_mu": 0.01,
            "secure_aggregation": False,
            "secagg_threshold": 8,
            "secagg_dropout_rate": 0.1,
            "differential_privacy": False,
            "dp_clip_norm": 1.0,
            "dp_noise_multiplier": 1.0,
            "dp_target_epsilon": 5.0,
            "dp_delta": 1e-5,
            "non_iid_mode": "iid",
            "non_iid_alpha": 0.5,
            "num_byzantine": 0,
            "byzantine_attack": "random",
            "robust_aggregation": "none",
            "dataset_name": "mnist",
            "model_name": "mlp",
        },
        "key_params": {
            "客户端数": 20,
            "采样率": "50%",
            "每轮参与": "~10客户端",
            "算法": "FedAvg",
        }
    },
]

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


def _get_tasks():
    try:
        from app.worker.tasks import run_experiment_task, stop_experiment_task
        logger.info(f"Celery tasks loaded successfully: run_experiment={run_experiment_task is not None}, stop_experiment={stop_experiment_task is not None}")
        return run_experiment_task, stop_experiment_task
    except Exception as e:
        logger.error(f"Failed to load Celery tasks: {e}", exc_info=True)
        return None, None


def _partition_mode_to_non_iid_mode(mode: str) -> str:
    mode_map = {
        "iid": "iid",
        "dirichlet": "quantity_skew",
        "label_skew": "label_skew",
    }
    return mode_map.get(mode, "iid")


@router.post("", response_model=schemas.ExperimentResponse)
def create_experiment(
    config: schemas.ExperimentCreate,
    db: Session = Depends(get_db)
):
    try:
        partition = None
        num_clients = config.num_clients
        non_iid_mode = config.non_iid_mode
        non_iid_alpha = config.non_iid_alpha

        if config.partition_id is not None:
            partition = (
                db.query(models.Partition)
                .filter(models.Partition.id == config.partition_id)
                .first()
            )
            if not partition:
                raise HTTPException(status_code=404, detail="Partition not found")

            num_clients = partition.num_clients
            non_iid_mode = _partition_mode_to_non_iid_mode(partition.mode)
            non_iid_alpha = partition.alpha if partition.alpha is not None else config.non_iid_alpha

        exp = models.Experiment(
            name=config.name,
            description=config.description,
            status="pending",
            num_clients=num_clients,
            num_rounds=config.num_rounds,
            client_sample_rate=config.client_sample_rate,
            local_epochs=config.local_epochs,
            batch_size=config.batch_size,
            learning_rate=config.learning_rate,
            algorithm=config.algorithm,
            fedprox_mu=config.fedprox_mu,
            secure_aggregation=config.secure_aggregation,
            secagg_threshold=config.secagg_threshold,
            secagg_dropout_rate=config.secagg_dropout_rate,
            differential_privacy=config.differential_privacy,
            dp_clip_norm=config.dp_clip_norm,
            dp_noise_multiplier=config.dp_noise_multiplier,
            dp_target_epsilon=config.dp_target_epsilon,
            dp_delta=config.dp_delta,
            non_iid_mode=non_iid_mode,
            non_iid_alpha=non_iid_alpha,
            num_byzantine=config.num_byzantine,
            byzantine_attack=config.byzantine_attack,
            robust_aggregation=config.robust_aggregation,
            dataset_name=config.dataset_name,
            model_name=config.model_name,
            partition_id=config.partition_id,
            created_at=datetime.utcnow()
        )
        db.add(exp)
        db.commit()
        db.refresh(exp)
        return exp
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create experiment: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create experiment: {str(e)}")


@router.get("", response_model=schemas.ExperimentListResponse)
def list_experiments(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        query = db.query(models.Experiment)
        if status:
            query = query.filter(models.Experiment.status == status)

        total = query.count()
        experiments = (
            query.order_by(desc(models.Experiment.created_at))
            .offset(skip)
            .limit(limit)
            .all()
        )

        return {"total": total, "experiments": experiments}
    except Exception as e:
        logger.error(f"Failed to list experiments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list experiments: {str(e)}")


@router.get("/templates", response_model=List[schemas.ExperimentTemplateResponse])
def list_templates():
    return EXPERIMENT_TEMPLATES


@router.get("/compare")
def compare_experiments(
    ids: str = Query(..., description="Comma-separated experiment IDs"),
    db: Session = Depends(get_db)
):
    try:
        try:
            experiment_ids = [int(x.strip()) for x in ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid experiment IDs")

        if len(experiment_ids) < 1 or len(experiment_ids) > 10:
            raise HTTPException(status_code=400, detail="Provide 1-10 experiment IDs")

        results = []
        for exp_id in experiment_ids:
            exp = (
                db.query(models.Experiment)
                .filter(models.Experiment.id == exp_id)
                .first()
            )
            if not exp:
                continue

            rounds = (
                db.query(models.RoundResult)
                .filter(models.RoundResult.experiment_id == exp_id)
                .order_by(models.RoundResult.round_num)
                .all()
            )

            results.append({
                "experiment": {
                    "id": exp.id,
                    "name": exp.name,
                    "config": {
                        "algorithm": exp.algorithm,
                        "dataset": exp.dataset_name,
                        "model": exp.model_name,
                        "non_iid_mode": exp.non_iid_mode,
                        "non_iid_alpha": exp.non_iid_alpha,
                        "secure_agg": exp.secure_aggregation,
                        "dp": exp.differential_privacy,
                        "byzantine": exp.num_byzantine,
                        "robust_agg": exp.robust_aggregation
                    },
                    "final_accuracy": exp.final_accuracy,
                    "status": exp.status
                },
                "rounds": [
                    {
                        "round_num": r.round_num,
                        "accuracy": r.global_accuracy,
                        "loss": r.global_loss,
                        "epsilon": r.epsilon_consumed
                    }
                    for r in rounds
                ]
            })

        return {"comparison": results}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to compare experiments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to compare experiments: {str(e)}")


@router.get("/{experiment_id}", response_model=schemas.ExperimentDetailResponse)
def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    try:
        exp = (
            db.query(models.Experiment)
            .options(joinedload(models.Experiment.partition))
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")
        return exp
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get experiment: {str(e)}")


@router.post("/{experiment_id}/start", response_model=schemas.ExperimentResponse)
def start_experiment(experiment_id: int, db: Session = Depends(get_db)):
    run_experiment_task, _ = _get_tasks()

    try:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")

        if exp.status in ["running", "pending"] and exp.celery_task_id:
            raise HTTPException(status_code=400, detail="Experiment already running")

        config_dict = {
            "num_clients": exp.num_clients,
            "num_rounds": exp.num_rounds,
            "client_sample_rate": exp.client_sample_rate,
            "local_epochs": exp.local_epochs,
            "batch_size": exp.batch_size,
            "learning_rate": exp.learning_rate,
            "algorithm": exp.algorithm,
            "fedprox_mu": exp.fedprox_mu,
            "secure_aggregation": exp.secure_aggregation,
            "secagg_threshold": exp.secagg_threshold,
            "secagg_dropout_rate": exp.secagg_dropout_rate,
            "differential_privacy": exp.differential_privacy,
            "dp_clip_norm": exp.dp_clip_norm,
            "dp_noise_multiplier": exp.dp_noise_multiplier,
            "dp_target_epsilon": exp.dp_target_epsilon,
            "dp_delta": exp.dp_delta,
            "non_iid_mode": exp.non_iid_mode,
            "non_iid_alpha": exp.non_iid_alpha,
            "num_byzantine": exp.num_byzantine,
            "byzantine_attack": exp.byzantine_attack,
            "robust_aggregation": exp.robust_aggregation,
            "dataset_name": exp.dataset_name,
            "model_name": exp.model_name,
        }

        exp.status = "queued"
        db.commit()
        db.refresh(exp)

        if run_experiment_task is None:
            exp.status = "error"
            exp.error_message = "Celery worker is not available. Please check worker service."
            db.commit()
            db.refresh(exp)
            logger.error(f"Cannot start experiment {experiment_id}: Celery tasks not loaded")
            raise HTTPException(status_code=503, detail="Celery worker is not available")

        logger.info(f"Dispatching experiment {experiment_id} to Celery queue...")
        try:
            task = run_experiment_task.delay(experiment_id, config_dict)
            logger.info(f"Experiment {experiment_id} dispatched successfully, task_id={task.id}")
        except Exception as e:
            exp.status = "error"
            exp.error_message = f"Failed to dispatch task: {str(e)}"
            db.commit()
            db.refresh(exp)
            logger.error(f"Failed to dispatch experiment {experiment_id} to Celery: {e}", exc_info=True)
            raise HTTPException(status_code=503, detail=f"Failed to dispatch task: {str(e)}")

        exp.celery_task_id = task.id
        db.commit()
        db.refresh(exp)

        return exp
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to start experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start experiment: {str(e)}")


@router.post("/{experiment_id}/stop", response_model=schemas.ExperimentResponse)
def stop_experiment(experiment_id: int, db: Session = Depends(get_db)):
    _, stop_experiment_task = _get_tasks()

    try:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")

        if exp.status not in ["running", "queued"]:
            raise HTTPException(status_code=400, detail="Experiment not running")

        if exp.celery_task_id and stop_experiment_task is not None:
            try:
                stop_experiment_task.delay(experiment_id)
            except Exception as e:
                logger.warning(f"Failed to send stop task: {e}")

        exp.status = "stopping"
        db.commit()
        db.refresh(exp)

        return exp
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to stop experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to stop experiment: {str(e)}")


@router.post("/{experiment_id}/resume", response_model=schemas.ExperimentResponse)
def resume_experiment(
    experiment_id: int,
    resume_config: schemas.ExperimentResume = None,
    db: Session = Depends(get_db)
):
    run_experiment_task, _ = _get_tasks()

    try:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")

        if exp.status not in ["stopped", "error"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot resume experiment with status '{exp.status}'. Only 'stopped' or 'error' experiments can be resumed."
            )

        last_completed_round = 0
        last_round = (
            db.query(models.RoundResult)
            .filter(models.RoundResult.experiment_id == experiment_id)
            .order_by(desc(models.RoundResult.round_num))
            .first()
        )
        if last_round:
            last_completed_round = last_round.round_num

        if resume_config:
            if resume_config.num_rounds is not None:
                exp.num_rounds = resume_config.num_rounds
            if resume_config.learning_rate is not None:
                exp.learning_rate = resume_config.learning_rate
            if resume_config.local_epochs is not None:
                exp.local_epochs = resume_config.local_epochs
            if resume_config.batch_size is not None:
                exp.batch_size = resume_config.batch_size
            if resume_config.client_sample_rate is not None:
                exp.client_sample_rate = resume_config.client_sample_rate
            if resume_config.fedprox_mu is not None:
                exp.fedprox_mu = resume_config.fedprox_mu
            if resume_config.dp_target_epsilon is not None:
                exp.dp_target_epsilon = resume_config.dp_target_epsilon
            if resume_config.dp_noise_multiplier is not None:
                exp.dp_noise_multiplier = resume_config.dp_noise_multiplier
            if resume_config.dp_clip_norm is not None:
                exp.dp_clip_norm = resume_config.dp_clip_norm

        config_dict = {
            "num_clients": exp.num_clients,
            "num_rounds": exp.num_rounds,
            "client_sample_rate": exp.client_sample_rate,
            "local_epochs": exp.local_epochs,
            "batch_size": exp.batch_size,
            "learning_rate": exp.learning_rate,
            "algorithm": exp.algorithm,
            "fedprox_mu": exp.fedprox_mu,
            "secure_aggregation": exp.secure_aggregation,
            "secagg_threshold": exp.secagg_threshold,
            "secagg_dropout_rate": exp.secagg_dropout_rate,
            "differential_privacy": exp.differential_privacy,
            "dp_clip_norm": exp.dp_clip_norm,
            "dp_noise_multiplier": exp.dp_noise_multiplier,
            "dp_target_epsilon": exp.dp_target_epsilon,
            "dp_delta": exp.dp_delta,
            "non_iid_mode": exp.non_iid_mode,
            "non_iid_alpha": exp.non_iid_alpha,
            "num_byzantine": exp.num_byzantine,
            "byzantine_attack": exp.byzantine_attack,
            "robust_aggregation": exp.robust_aggregation,
            "dataset_name": exp.dataset_name,
            "model_name": exp.model_name,
            "resume_from_round": last_completed_round,
        }

        exp.status = "queued"
        exp.last_checkpoint_round = last_completed_round
        exp.celery_task_id = None
        exp.error_message = None
        db.commit()
        db.refresh(exp)

        if run_experiment_task is None:
            exp.status = "error"
            exp.error_message = "Celery worker is not available. Please check worker service."
            db.commit()
            db.refresh(exp)
            logger.error(f"Cannot resume experiment {experiment_id}: Celery tasks not loaded")
            raise HTTPException(status_code=503, detail="Celery worker is not available")

        logger.info(f"Dispatching resume for experiment {experiment_id} from round {last_completed_round}...")
        try:
            task = run_experiment_task.delay(experiment_id, config_dict)
            logger.info(f"Experiment {experiment_id} resume dispatched, task_id={task.id}")
        except Exception as e:
            exp.status = "error"
            exp.error_message = f"Failed to dispatch resume task: {str(e)}"
            db.commit()
            db.refresh(exp)
            logger.error(f"Failed to dispatch resume for experiment {experiment_id}: {e}", exc_info=True)
            raise HTTPException(status_code=503, detail=f"Failed to dispatch task: {str(e)}")

        exp.celery_task_id = task.id
        db.commit()
        db.refresh(exp)

        return exp
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to resume experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to resume experiment: {str(e)}")


@router.delete("/{experiment_id}")
def delete_experiment(experiment_id: int, db: Session = Depends(get_db)):
    _, stop_experiment_task = _get_tasks()

    try:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")

        if exp.status == "running" and exp.celery_task_id and stop_experiment_task is not None:
            try:
                stop_experiment_task.delay(experiment_id)
            except Exception as e:
                logger.warning(f"Failed to send stop task during delete: {e}")

        db.delete(exp)
        db.commit()

        return {"status": "deleted", "id": experiment_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete experiment: {str(e)}")


@router.get("/{experiment_id}/rounds")
def get_experiment_rounds(
    experiment_id: int,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000)
):
    try:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")

        rounds = (
            db.query(models.RoundResult)
            .filter(models.RoundResult.experiment_id == experiment_id)
            .order_by(models.RoundResult.round_num)
            .offset(skip)
            .limit(limit)
            .all()
        )

        return {
            "experiment_id": experiment_id,
            "total_rounds": len(rounds),
            "rounds": rounds
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get rounds for experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get rounds: {str(e)}")


@router.get("/{experiment_id}/client-metrics")
def get_experiment_client_metrics(
    experiment_id: int,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000)
):
    try:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")

        rounds = (
            db.query(models.RoundResult)
            .filter(models.RoundResult.experiment_id == experiment_id)
            .order_by(models.RoundResult.round_num)
            .offset(skip)
            .limit(limit)
            .all()
        )

        client_metrics_history = []
        for r in rounds:
            if r.client_metrics:
                client_metrics_history.append({
                    'round_num': r.round_num,
                    'client_metrics': r.client_metrics
                })

        return {
            "experiment_id": experiment_id,
            "num_clients": exp.num_clients,
            "total_rounds": len(rounds),
            "client_metrics_history": client_metrics_history
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get client metrics for experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get client metrics: {str(e)}")
