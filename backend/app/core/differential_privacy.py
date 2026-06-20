import numpy as np
import torch
from torch import nn
from typing import Optional, Tuple


class DifferentialPrivacyEngine:
    def __init__(
        self,
        clip_norm: float = 1.0,
        noise_multiplier: float = 1.0,
        target_epsilon: float = 5.0,
        delta: float = 1e-5,
        batch_size: int = 64,
        dataset_size: int = 60000
    ):
        self.clip_norm = clip_norm
        self.noise_multiplier = noise_multiplier
        self.target_epsilon = target_epsilon
        self.delta = delta
        self.batch_size = batch_size
        self.dataset_size = dataset_size
        self.current_epsilon = 0.0
        self.total_noise_amplification = 0.0
        self.rdp_orders = list(range(2, 64))
        self.rdp_history = []

    def clip_gradients(self, model: nn.Module) -> float:
        total_norm = 0.0
        for p in model.parameters():
            if p.grad is not None:
                param_norm = p.grad.data.norm(2)
                total_norm += param_norm.item() ** 2
        total_norm = total_norm ** 0.5

        clip_coef = self.clip_norm / (total_norm + 1e-6)
        if clip_coef < 1:
            for p in model.parameters():
                if p.grad is not None:
                    p.grad.data.mul_(clip_coef)

        return min(total_norm, self.clip_norm)

    def add_noise(self, model: nn.Module, batch_size: int) -> None:
        sigma = self.noise_multiplier * self.clip_norm / batch_size
        for p in model.parameters():
            if p.grad is not None:
                noise = torch.randn_like(p.grad) * sigma
                p.grad.data.add_(noise)

    def _compute_rdp_single_step(self, q: float, sigma: float) -> np.ndarray:
        orders = np.array(self.rdp_orders, dtype=np.float64)
        lambda_sq = sigma ** 2

        if lambda_sq < 1e-6:
            return np.inf * np.ones_like(orders)

        rdp = orders * q ** 2 / lambda_sq / 2.0
        for idx, alpha in enumerate(orders):
            if alpha > 1:
                term1 = alpha * q ** 2 / (2 * lambda_sq)
                term2 = (q ** alpha) / (alpha * (lambda_sq ** (alpha - 1)))
                rdp[idx] = min(term1, term2)
            else:
                rdp[idx] = q ** 2 / (2 * lambda_sq)

        return rdp

    def update_privacy_budget(
        self,
        num_steps: int,
        sample_rate: Optional[float] = None
    ) -> Tuple[float, bool]:
        q = sample_rate if sample_rate else self.batch_size / self.dataset_size
        sigma = self.noise_multiplier

        rdp_step = self._compute_rdp_single_step(q, sigma)
        self.rdp_history.append((num_steps, rdp_step.copy()))

        total_rdp = np.zeros_like(rdp_step)
        for steps, rdp in self.rdp_history:
            total_rdp += steps * rdp

        eps = self._rdp_to_epsilon(total_rdp)
        self.current_epsilon = float(eps)

        budget_exceeded = self.current_epsilon > self.target_epsilon
        return self.current_epsilon, budget_exceeded

    def _rdp_to_epsilon(self, rdp: np.ndarray) -> float:
        orders = np.array(self.rdp_orders, dtype=np.float64)
        eps_vec = (rdp + np.log(1 / self.delta) * (orders - 1) ** (-1)) * (1 - 1 / orders) ** (-1)
        return float(np.min(eps_vec))

    def get_privacy_report(self) -> dict:
        return {
            'current_epsilon': self.current_epsilon,
            'target_epsilon': self.target_epsilon,
            'delta': self.delta,
            'clip_norm': self.clip_norm,
            'noise_multiplier': self.noise_multiplier,
            'budget_remaining': max(0, self.target_epsilon - self.current_epsilon),
            'budget_exceeded': self.current_epsilon > self.target_epsilon
        }


class PrivacyAccountant:
    def __init__(self, target_epsilon: float = 5.0, delta: float = 1e-5):
        self.target_epsilon = target_epsilon
        self.delta = delta
        self.epsilon_history = [0.0]
        self.total_epsilon = 0.0

    def add_round(self, epsilon_round: float) -> Tuple[float, bool]:
        self.total_epsilon += epsilon_round
        self.epsilon_history.append(self.total_epsilon)
        exceeded = self.total_epsilon > self.target_epsilon
        return self.total_epsilon, exceeded

    def simulate_round_cost(
        self,
        clip_norm: float,
        noise_multiplier: float,
        batch_size: int,
        dataset_size: int,
        local_epochs: int,
        sample_rate: float = 1.0
    ) -> float:
        q = batch_size / dataset_size
        sigma = noise_multiplier
        steps_per_epoch = int(np.ceil(dataset_size * sample_rate / batch_size))
        total_steps = steps_per_epoch * local_epochs

        orders = np.array(list(range(2, 64)), dtype=np.float64)
        lambda_sq = sigma ** 2 if sigma > 0 else 1e-10
        rdp = np.zeros_like(orders)

        for alpha in orders:
            if alpha > 1:
                rdp[int(alpha) - 2] = min(
                    alpha * q ** 2 / (2 * lambda_sq),
                    (q ** alpha) / (alpha * (lambda_sq ** (alpha - 1)))
                ) * total_steps
            else:
                rdp[int(alpha) - 2] = q ** 2 / (2 * lambda_sq) * total_steps

        eps_vec = (rdp + np.log(1 / self.delta) * (orders - 1) ** (-1)) * (1 - 1 / orders) ** (-1)
        return float(np.min(eps_vec))
