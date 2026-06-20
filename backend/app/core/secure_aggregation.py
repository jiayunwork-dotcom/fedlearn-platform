import numpy as np
from typing import List, Tuple, Dict, Optional
import random


class ShamirSecretSharing:
    def __init__(self, prime: int = None):
        if prime is None:
            self.prime = 2**61 - 1
        else:
            self.prime = prime
        self.scale = 10**6
        self.offset = self.prime // 4

    def _modinv(self, a: int, m: int) -> int:
        a = a % m
        if a < 0:
            a += m
        g, x, _ = self._extended_gcd(a, m)
        if g != 1:
            raise ValueError('Modular inverse does not exist')
        return x % m

    def _extended_gcd(self, a: int, b: int) -> Tuple[int, int, int]:
        if a == 0:
            return b, 0, 1
        g, x, y = self._extended_gcd(b % a, a)
        return g, y - (b // a) * x, x

    def _eval_poly(self, coeffs: List[int], x: int) -> int:
        result = 0
        for c in reversed(coeffs):
            result = (result * x + c) % self.prime
        return result

    def split(self, secret: float, n: int, t: int) -> List[Tuple[int, float]]:
        if t > n:
            raise ValueError("Threshold t cannot be greater than n")
        if t < 2:
            raise ValueError("Threshold t must be at least 2")

        s_int = int(round(secret * self.scale))
        s_pos = s_int + self.offset
        if s_pos < 0:
            s_pos = 0
        if s_pos >= self.prime:
            s_pos = self.prime - 1

        coeffs = [s_pos]
        for _ in range(t - 1):
            coeffs.append(random.randint(1, self.prime - 1))

        shares = []
        for i in range(1, n + 1):
            y = self._eval_poly(coeffs, i)
            shares.append((i, y))

        return shares

    def reconstruct(self, shares: List[Tuple[int, float]]) -> float:
        if len(shares) < 2:
            raise ValueError("Need at least 2 shares to reconstruct")

        k = len(shares)
        secret_int = 0

        for i in range(k):
            xi = shares[i][0]
            yi = int(shares[i][1])
            if yi < 0:
                yi = yi % self.prime

            numerator = 1
            denominator = 1
            for j in range(k):
                if i != j:
                    xj = shares[j][0]
                    numerator = (numerator * (-xj)) % self.prime
                    denom = (xi - xj) % self.prime
                    denominator = (denominator * denom) % self.prime

            den_inv = self._modinv(denominator, self.prime)
            lagrange = (yi * numerator) % self.prime
            lagrange = (lagrange * den_inv) % self.prime
            secret_int = (secret_int + lagrange) % self.prime

        s_pos = secret_int
        s_int = s_pos - self.offset
        secret = s_int / self.scale

        return secret


class SecureAggregator:
    """
    基于Shamir秘密共享的安全聚合实现

    协议流程：
    1. 每对客户端(i,j)共享一个掩码种子 s_ij (由Shamir分发给所有客户端)
    2. 客户端i的掩码: m_i = Σ_{j>i} s_ij向量 - Σ_{j<i} s_ij向量
    3. 客户端上传: masked_u_i = u_i + m_i
    4. Server求和: Σ masked_u_i = Σ u_i + Σ m_i
       由于 m_ij = -m_ji, 所以 Σ m_i = 0
       因此 Σ masked_u_i = Σ u_i (掩码完美抵消)
    5. 掉线处理: 用Shamir恢复掉线客户端的种子, 重建其掩码向量, 从总和中修正
    """

    def __init__(self, num_clients: int, threshold: int, dropout_rate: float = 0.1,
                 mask_scale: float = 1e-5):
        self.num_clients = num_clients
        self.threshold = max(2, threshold)
        self.dropout_rate = dropout_rate
        self.mask_scale = mask_scale
        self.sss = ShamirSecretSharing()

    def _pair_key(self, i: int, j: int) -> Tuple[int, int]:
        return (min(i, j), max(i, j))

    def _generate_pairwise_seeds(
        self, client_ids: List[int]
    ) -> Dict[Tuple[int, int], float]:
        seeds = {}
        n = len(client_ids)

        for i_idx in range(n):
            for j_idx in range(i_idx + 1, n):
                ci, cj = client_ids[i_idx], client_ids[j_idx]
                pair = self._pair_key(ci, cj)
                random.seed(f"seed_{ci}_{cj}_{self.mask_scale}")
                seed_val = random.random() * 1000.0
                seeds[pair] = seed_val

        return seeds

    def _split_secrets_with_shamir(
        self,
        pairwise_seeds: Dict[Tuple[int, int], float],
        client_ids: List[int]
    ) -> Dict[int, Dict[int, float]]:
        n = len(client_ids)
        t = min(self.threshold, n - 1)
        if t < 2:
            t = 2

        shares_by_client = {cid: {} for cid in client_ids}

        for pair, seed_val in pairwise_seeds.items():
            ci, cj = pair
            shares = self.sss.split(seed_val, n, t)

            for idx, (share_idx, share_val) in enumerate(shares):
                holder_id = client_ids[idx]
                pair_key = f"{ci}_{cj}"
                shares_by_client[holder_id][pair_key] = share_val

        return shares_by_client

    def _generate_mask_vector(
        self,
        seed: float,
        template: List[np.ndarray]
    ) -> List[np.ndarray]:
        seed_int = int(abs(seed) * 1e7) % (2**32 - 1)
        rng = np.random.RandomState(seed_int)

        mask = []
        for layer_idx, t in enumerate(template):
            layer_seed = seed_int + layer_idx * 7919
            layer_rng = np.random.RandomState(layer_seed)
            noise = layer_rng.normal(0, self.mask_scale, size=t.shape).astype(np.float32)
            mask.append(noise)

        return mask

    def _add_mask(
        self,
        update: List[np.ndarray],
        mask: List[np.ndarray],
        sign: int = 1
    ) -> List[np.ndarray]:
        result = []
        for u, m in zip(update, mask):
            result.append(u + sign * m)
        return result

    def _sum_updates(
        self,
        updates_list: List[List[np.ndarray]],
        weights: Optional[List[float]] = None
    ) -> List[np.ndarray]:
        if not updates_list:
            return []

        n = len(updates_list)
        if weights is None:
            weights = [1.0] * n

        total_weight = sum(weights)
        result = [np.zeros_like(u) for u in updates_list[0]]

        for i, updates in enumerate(updates_list):
            w = weights[i]
            for layer_idx in range(len(result)):
                result[layer_idx] += w * updates[layer_idx]

        if total_weight != 1.0 and total_weight != 0:
            for layer_idx in range(len(result)):
                result[layer_idx] /= total_weight

        return result

    def compute_client_mask(
        self,
        client_id: int,
        client_ids: List[int],
        pairwise_seeds: Dict[Tuple[int, int], float],
        template: List[np.ndarray]
    ) -> List[np.ndarray]:
        mask = [np.zeros_like(t) for t in template]

        for other_id in client_ids:
            if other_id == client_id:
                continue
            pair = self._pair_key(client_id, other_id)
            if pair in pairwise_seeds:
                seed_val = pairwise_seeds[pair]
                pair_mask = self._generate_mask_vector(seed_val, template)

                if client_id > other_id:
                    sign = 1
                else:
                    sign = -1

                for layer_idx in range(len(mask)):
                    mask[layer_idx] += sign * pair_mask[layer_idx]

        return mask

    def recover_seed_from_shares(
        self,
        pair_key_str: str,
        shares_from_survivors: Dict[int, Dict[str, float]],
        surviving_indices: List[int]
    ) -> Optional[float]:
        shares_for_pair = []
        for idx, cid in enumerate(surviving_indices):
            if pair_key_str in shares_from_survivors.get(cid, {}):
                share_index = idx + 1
                share_val = shares_from_survivors[cid][pair_key_str]
                shares_for_pair.append((share_index, share_val))

        if len(shares_for_pair) < max(2, self.threshold - 1):
            return None

        try:
            recovered = self.sss.reconstruct(shares_for_pair)
            return recovered
        except Exception:
            return None

    def secure_aggregate(
        self,
        raw_updates: Dict[int, List[np.ndarray]],
        weights: Optional[Dict[int, float]] = None
    ) -> Tuple[List[np.ndarray], Dict]:
        client_ids = sorted(raw_updates.keys())
        n_clients = len(client_ids)

        if n_clients < 2:
            template = list(raw_updates.values())[0] if raw_updates else []
            return [np.zeros_like(t) for t in template], {'method': 'single_client'}

        template = list(raw_updates.values())[0]

        pairwise_seeds = self._generate_pairwise_seeds(client_ids)
        shamir_shares_by_client = self._split_secrets_with_shamir(pairwise_seeds, client_ids)

        masked_updates = {}
        for cid in client_ids:
            mask = self.compute_client_mask(cid, client_ids, pairwise_seeds, template)
            masked = self._add_mask(raw_updates[cid], mask, sign=1)
            masked_updates[cid] = masked

        surviving_ids = self._simulate_dropout(client_ids)
        dropped_ids = [cid for cid in client_ids if cid not in surviving_ids]

        if weights is None:
            weights_dict = {cid: 1.0 for cid in surviving_ids}
        else:
            weights_dict = {cid: weights.get(cid, 1.0) for cid in surviving_ids}

        total_weight = sum(weights_dict.values())
        weight_list = [weights_dict[cid] / max(1e-10, total_weight) for cid in surviving_ids]
        surviving_masked_list = [masked_updates[cid] for cid in surviving_ids]

        aggregated_masked = self._sum_updates(surviving_masked_list, weight_list)

        drop_correction_mask = [np.zeros_like(t) for t in template]
        shamir_used = False

        if dropped_ids and len(surviving_ids) >= self.threshold:
            shamir_used = True
            for did in dropped_ids:
                recovered_seeds = self._recover_dropped_seeds_via_shamir(
                    did, surviving_ids, client_ids, shamir_shares_by_client
                )

                dropped_mask = self._build_mask_from_recovered_seeds(
                    did, surviving_ids, recovered_seeds, template
                )

                if weights is None:
                    drop_w = 1.0 / total_weight if total_weight > 0 else 1.0 / len(surviving_ids)
                else:
                    drop_w = weights.get(did, 0) / max(1e-10, total_weight)

                for layer_idx in range(len(drop_correction_mask)):
                    drop_correction_mask[layer_idx] += drop_w * dropped_mask[layer_idx]

        final_aggregated = []
        for layer_idx in range(len(aggregated_masked)):
            final_aggregated.append(
                aggregated_masked[layer_idx] + drop_correction_mask[layer_idx]
            )

        raw_list = [raw_updates[cid] for cid in surviving_ids]
        raw_aggregated = self._sum_updates(raw_list, weight_list)

        diff_norm = 0
        raw_norm = 0
        for layer_idx in range(len(final_aggregated)):
            diff_norm += np.linalg.norm(final_aggregated[layer_idx] - raw_aggregated[layer_idx]) ** 2
            raw_norm += np.linalg.norm(raw_aggregated[layer_idx]) ** 2
        diff_norm = np.sqrt(diff_norm)
        raw_norm = np.sqrt(raw_norm)
        rel_error = diff_norm / max(raw_norm, 1e-10)

        info = {
            'method': 'secure_aggregation_shamir',
            'total_clients': n_clients,
            'surviving_clients': len(surviving_ids),
            'dropped_clients': len(dropped_ids),
            'threshold': self.threshold,
            'dropped_ids': dropped_ids,
            'surviving_ids': surviving_ids,
            'shamir_threshold': min(self.threshold, n_clients - 1),
            'shamir_used_for_recovery': shamir_used,
            'mask_scale': self.mask_scale,
            'aggregation_error_abs': float(diff_norm),
            'aggregation_error_rel': float(rel_error),
            'error_within_tolerance': bool(rel_error < 0.05)
        }

        return final_aggregated, info

    def _recover_dropped_seeds_via_shamir(
        self,
        dropped_id: int,
        surviving_ids: List[int],
        all_client_ids: List[int],
        shares_by_client: Dict[int, Dict[str, float]]
    ) -> Dict[str, float]:
        recovered_seeds = {}

        for other_id in surviving_ids:
            if other_id == dropped_id:
                continue
            pair = self._pair_key(dropped_id, other_id)
            pair_key_str = f"{pair[0]}_{pair[1]}"

            if pair_key_str in recovered_seeds:
                continue

            shares_for_pair = []
            for sid in surviving_ids:
                if pair_key_str in shares_by_client.get(sid, {}):
                    share_index = all_client_ids.index(sid) + 1
                    share_val = shares_by_client[sid][pair_key_str]
                    shares_for_pair.append((share_index, share_val))

            if len(shares_for_pair) >= max(2, self.threshold - 1):
                try:
                    recovered = self.sss.reconstruct(shares_for_pair)
                    recovered_seeds[pair_key_str] = recovered
                except Exception:
                    pass

        return recovered_seeds

    def _build_mask_from_recovered_seeds(
        self,
        dropped_id: int,
        surviving_ids: List[int],
        recovered_seeds: Dict[str, float],
        template: List[np.ndarray]
    ) -> List[np.ndarray]:
        mask = [np.zeros_like(t) for t in template]

        for sid in surviving_ids:
            pair = self._pair_key(dropped_id, sid)
            pair_key_str = f"{pair[0]}_{pair[1]}"

            if pair_key_str in recovered_seeds:
                seed_val = recovered_seeds[pair_key_str]
                pair_mask = self._generate_mask_vector(seed_val, template)

                if dropped_id > sid:
                    sign = 1
                else:
                    sign = -1

                for layer_idx in range(len(mask)):
                    mask[layer_idx] += sign * pair_mask[layer_idx]

        return mask

    def _recover_dropped_mask(
        self,
        dropped_id: int,
        surviving_ids: List[int],
        pairwise_seeds: Dict[Tuple[int, int], float],
        template: List[np.ndarray]
    ) -> List[np.ndarray]:
        mask = [np.zeros_like(t) for t in template]

        for sid in surviving_ids:
            pair = self._pair_key(dropped_id, sid)
            if pair in pairwise_seeds:
                seed_val = pairwise_seeds[pair]
                pair_mask = self._generate_mask_vector(seed_val, template)

                if dropped_id > sid:
                    sign = 1
                else:
                    sign = -1

                for layer_idx in range(len(mask)):
                    mask[layer_idx] += sign * pair_mask[layer_idx]

        return mask

    def _simulate_dropout(self, client_ids: List[int]) -> List[int]:
        if self.dropout_rate <= 0:
            return list(client_ids)

        n = len(client_ids)
        expected_survivors = int(n * (1 - self.dropout_rate))
        min_survivors = max(self.threshold + 1, expected_survivors)
        min_survivors = min(min_survivors, n)

        num_drop = max(0, n - min_survivors)

        if num_drop > 0:
            drop_indices = random.sample(range(n), num_drop)
            return [cid for i, cid in enumerate(client_ids) if i not in drop_indices]

        return list(client_ids)

    def verify_cancellation(
        self, raw_updates: Dict[int, List[np.ndarray]]
    ) -> dict:
        client_ids = sorted(raw_updates.keys())
        if len(client_ids) < 2:
            return {'error': 'need at least 2 clients'}

        template = list(raw_updates.values())[0]
        pairwise_seeds = self._generate_pairwise_seeds(client_ids)

        total_mask = [np.zeros_like(t) for t in template]
        for cid in client_ids:
            mask = self.compute_client_mask(cid, client_ids, pairwise_seeds, template)
            for layer_idx in range(len(total_mask)):
                total_mask[layer_idx] += mask[layer_idx]

        mask_norm = 0
        for layer in total_mask:
            mask_norm += np.linalg.norm(layer) ** 2
        mask_norm = np.sqrt(mask_norm)

        avg_update_norm = 0
        for u in raw_updates.values():
            for layer in u:
                avg_update_norm += np.linalg.norm(layer) ** 2
        avg_update_norm = np.sqrt(avg_update_norm) / max(1, len(client_ids))

        rel_error = mask_norm / max(avg_update_norm, 1e-10)

        return {
            'num_clients': len(client_ids),
            'total_mask_norm': float(mask_norm),
            'avg_update_norm': float(avg_update_norm),
            'relative_mask_cancellation_error': float(rel_error),
            'mask_scale': self.mask_scale,
            'cancellation_verified': bool(rel_error < 1e-6)
        }
