import numpy as np
import torch
from typing import List, Dict, Tuple, Optional
from collections import Counter


class ByzantineAttack:
    def __init__(self, attack_type: str = "random", scale_factor: float = 10.0):
        self.attack_type = attack_type
        self.scale_factor = scale_factor

    def apply_attack(self, model_updates: List[np.ndarray]) -> List[np.ndarray]:
        attacked_updates = []
        for update in model_updates:
            if self.attack_type == "random":
                attacked = np.random.randn(*update.shape).astype(np.float32)
                attacked = attacked * (np.linalg.norm(update) / (np.linalg.norm(attacked) + 1e-8))
            elif self.attack_type == "scale":
                attacked = update * self.scale_factor
            elif self.attack_type == "zero":
                attacked = np.zeros_like(update)
            else:
                attacked = update.copy()

            attacked_updates.append(attacked.astype(np.float32))

        return attacked_updates

    def apply_to_client_updates(
        self,
        client_updates: Dict[int, List[np.ndarray]],
        byzantine_ids: List[int]
    ) -> Dict[int, List[np.ndarray]]:
        result = {}
        for cid, updates in client_updates.items():
            if cid in byzantine_ids:
                result[cid] = self.apply_attack(updates)
            else:
                result[cid] = updates
        return result


class RobustAggregator:
    def __init__(self, method: str = "none", num_byzantine: int = 0):
        self.method = method
        self.num_byzantine = num_byzantine

    def _flatten_updates(self, updates_list: List[List[np.ndarray]]) -> np.ndarray:
        flat_updates = []
        for updates in updates_list:
            flat = np.concatenate([u.flatten() for u in updates])
            flat_updates.append(flat)
        return np.array(flat_updates)

    def _unflatten_updates(
        self,
        flat_aggregated: np.ndarray,
        template: List[np.ndarray]
    ) -> List[np.ndarray]:
        result = []
        offset = 0
        for t in template:
            size = t.size
            shape = t.shape
            result.append(flat_aggregated[offset:offset + size].reshape(shape))
            offset += size
        return result

    def _krum(
        self,
        flat_updates: np.ndarray,
        client_ids: List[int]
    ) -> Tuple[int, List[int]]:
        n = len(flat_updates)
        f = self.num_byzantine
        m = n - f - 2

        if m < 1:
            return 0, client_ids

        scores = np.zeros(n)
        for i in range(n):
            distances = []
            for j in range(n):
                if i != j:
                    dist = np.linalg.norm(flat_updates[i] - flat_updates[j]) ** 2
                    distances.append(dist)
            distances.sort()
            scores[i] = sum(distances[:m])

        best_idx = int(np.argmin(scores))
        sorted_indices = list(np.argsort(scores))

        return best_idx, [client_ids[i] for i in sorted_indices]

    def _trimmed_mean(self, flat_updates: np.ndarray) -> np.ndarray:
        n = flat_updates.shape[0]
        f = max(1, self.num_byzantine)
        trim_count = min(f, n // 4)

        sorted_updates = np.sort(flat_updates, axis=0)
        if trim_count > 0:
            trimmed = sorted_updates[trim_count:n - trim_count, :]
        else:
            trimmed = sorted_updates

        return np.mean(trimmed, axis=0)

    def _coordinate_median(self, flat_updates: np.ndarray) -> np.ndarray:
        return np.median(flat_updates, axis=0)

    def _weighted_average(
        self,
        updates_list: List[List[np.ndarray]],
        weights: Dict[int, float]
    ) -> List[np.ndarray]:
        total_weight = sum(weights.values())
        if total_weight <= 0:
            template = updates_list[0] if updates_list else []
            return [np.zeros_like(t) for t in template]

        aggregated = None
        for i, updates in enumerate(updates_list):
            w = list(weights.values())[i] / total_weight if i < len(weights) else 0
            if aggregated is None:
                aggregated = [u * w for u in updates]
            else:
                for j in range(len(aggregated)):
                    aggregated[j] += updates[j] * w

        return aggregated if aggregated is not None else [np.zeros_like(u) for u in updates_list[0]]

    def aggregate(
        self,
        client_updates: Dict[int, List[np.ndarray]],
        weights: Optional[Dict[int, float]] = None,
        byzantine_ids: Optional[List[int]] = None
    ) -> Tuple[List[np.ndarray], Dict]:
        info = {
            'method': self.method,
            'total_clients': len(client_updates),
            'detected_byzantine': 0,
            'total_byzantine': len(byzantine_ids) if byzantine_ids else 0,
            'selected_ids': list(client_updates.keys())
        }

        if not client_updates:
            return [], info

        client_ids = list(client_updates.keys())
        updates_list = [client_updates[cid] for cid in client_ids]
        template = updates_list[0]

        if self.method == "none":
            result = self._weighted_average(updates_list, weights or {cid: 1.0 for cid in client_ids})
            return result, info

        flat_updates = self._flatten_updates(updates_list)

        if self.method == "krum":
            best_idx, sorted_ids = self._krum(flat_updates, client_ids)
            info['selected_ids'] = sorted_ids

            if byzantine_ids:
                detected = sum(1 for i in sorted_ids[-self.num_byzantine:] if i in byzantine_ids)
                info['detected_byzantine'] = detected

            flat_result = flat_updates[best_idx]
            result = self._unflatten_updates(flat_result, template)

        elif self.method == "trimmed_mean":
            flat_result = self._trimmed_mean(flat_updates)
            result = self._unflatten_updates(flat_result, template)

            if byzantine_ids and weights:
                sorted_by_weight = sorted(weights.items(), key=lambda x: abs(x[1]))
                info['detected_byzantine'] = sum(1 for cid, _ in sorted_by_weight[:self.num_byzantine] if cid in byzantine_ids)

        elif self.method == "median":
            flat_result = self._coordinate_median(flat_updates)
            result = self._unflatten_updates(flat_result, template)

            if byzantine_ids:
                deviations = []
                for i in range(len(client_ids)):
                    dev = np.linalg.norm(flat_updates[i] - flat_result)
                    deviations.append((client_ids[i], dev))
                deviations.sort(key=lambda x: x[1], reverse=True)
                info['detected_byzantine'] = sum(1 for cid, _ in deviations[:self.num_byzantine] if cid in byzantine_ids)
        else:
            result = self._weighted_average(updates_list, weights or {cid: 1.0 for cid in client_ids})

        return result, info
