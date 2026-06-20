import numpy as np
from typing import List, Tuple, Dict, Optional
import random
from itertools import combinations


class ShamirSecretSharing:
    def __init__(self, modulus: int = 2**31 - 1):
        self.modulus = modulus

    def _modinv(self, a: int, m: int) -> int:
        g, x, _ = self._extended_gcd(a % m, m)
        if g != 1:
            raise Exception('Modular inverse does not exist')
        return x % m

    def _extended_gcd(self, a: int, b: int) -> Tuple[int, int, int]:
        if a == 0:
            return b, 0, 1
        g, x, y = self._extended_gcd(b % a, a)
        return g, y - (b // a) * x, x

    def _eval_poly(self, poly: List[int], x: int) -> int:
        result = 0
        for coeff in reversed(poly):
            result = (result * x + coeff) % self.modulus
        return result

    def split_secret(self, secret: float, n: int, t: int) -> List[Tuple[int, float]]:
        if t > n:
            raise ValueError("Threshold t cannot be greater than number of shares n")
        if t < 2:
            raise ValueError("Threshold t must be at least 2")

        secret_int = int(round(secret * 1e6)) % self.modulus

        poly = [secret_int]
        for _ in range(t - 1):
            poly.append(random.randint(1, self.modulus - 1))

        shares = []
        for i in range(1, n + 1):
            val = self._eval_poly(poly, i)
            shares.append((i, val / 1e6))

        return shares

    def reconstruct_secret(self, shares: List[Tuple[int, float]]) -> float:
        if len(shares) < 2:
            raise ValueError("Need at least 2 shares to reconstruct")

        x_s = [s[0] for s in shares]
        y_s = [int(round(s[1] * 1e6)) for s in shares]

        k = len(shares)
        secret = 0

        for i in range(k):
            num, den = 1, 1
            for j in range(k):
                if i != j:
                    num = (num * (-x_s[j])) % self.modulus
                    den = (den * (x_s[i] - x_s[j])) % self.modulus
            lagrange = (y_s[i] * num * self._modinv(den, self.modulus)) % self.modulus
            secret = (secret + lagrange) % self.modulus

        if secret > self.modulus // 2:
            secret -= self.modulus

        return secret / 1e6


class SecureAggregator:
    def __init__(self, num_clients: int, threshold: int, dropout_rate: float = 0.1):
        self.num_clients = num_clients
        self.threshold = threshold
        self.dropout_rate = dropout_rate
        self.sss = ShamirSecretSharing()

    def generate_masks(self, client_ids: List[int]) -> Dict[int, Dict[int, float]]:
        masks = {}
        for cid in client_ids:
            masks[cid] = {}
            for other_id in client_ids:
                if other_id != cid:
                    masks[cid][other_id] = np.random.normal(0, 1e-4)
        return masks

    def mask_updates(
        self,
        updates: Dict[int, List[np.ndarray]],
        masks: Dict[int, Dict[int, float]]
    ) -> Dict[int, List[np.ndarray]]:
        masked_updates = {}

        for cid, update_list in updates.items():
            masked_list = []
            for layer_idx, update in enumerate(update_list):
                masked = update.copy()
                for other_id, mask_val in masks.get(cid, {}).items():
                    if other_id < cid:
                        masked += mask_val / (layer_idx + 1)
                    else:
                        masked -= mask_val / (layer_idx + 1)
                masked_list.append(masked)
            masked_updates[cid] = masked_list

        return masked_updates

    def simulate_dropout(self, client_ids: List[int]) -> List[int]:
        min_survivors = max(self.threshold, int(len(client_ids) * (1 - self.dropout_rate)))
        num_drop = max(0, len(client_ids) - min_survivors)
        if num_drop > 0:
            drop_ids = random.sample(client_ids, num_drop)
            return [cid for cid in client_ids if cid not in drop_ids]
        return client_ids

    def aggregate_masked(
        self,
        masked_updates: Dict[int, List[np.ndarray]],
        weights: Optional[Dict[int, float]] = None
    ) -> List[np.ndarray]:
        surviving_ids = list(masked_updates.keys())
        if not surviving_ids:
            return []

        first_updates = masked_updates[surviving_ids[0]]
        aggregated = [np.zeros_like(u) for u in first_updates]

        total_weight = 0.0
        for cid in surviving_ids:
            w = weights.get(cid, 1.0) if weights else 1.0
            total_weight += w
            for layer_idx, update in enumerate(masked_updates[cid]):
                aggregated[layer_idx] += w * update

        if total_weight > 0:
            for layer_idx in range(len(aggregated)):
                aggregated[layer_idx] /= total_weight

        return aggregated

    def secure_aggregate(
        self,
        raw_updates: Dict[int, List[np.ndarray]],
        weights: Optional[Dict[int, float]] = None
    ) -> Tuple[List[np.ndarray], Dict]:
        client_ids = list(raw_updates.keys())

        masks = self.generate_masks(client_ids)
        masked = self.mask_updates(raw_updates, masks)
        surviving = self.simulate_dropout(client_ids)

        surviving_masked = {cid: masked[cid] for cid in surviving if cid in masked}
        aggregated = self.aggregate_masked(surviving_masked, weights)

        info = {
            'total_clients': len(client_ids),
            'surviving_clients': len(surviving),
            'dropped_clients': len(client_ids) - len(surviving),
            'threshold': self.threshold
        }

        return aggregated, info
