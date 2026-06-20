import torch
import torch.nn as nn
import numpy as np
from typing import Dict, List, Optional, Tuple, Callable
from torch.utils.data import DataLoader

from app.models.nn_models import get_model_params, set_model_params, compute_model_update
from app.core.differential_privacy import DifferentialPrivacyEngine


class FedClient:
    def __init__(
        self,
        client_id: int,
        model: nn.Module,
        dataloader: DataLoader,
        device: str = "cpu",
        data_size: int = 0
    ):
        self.client_id = client_id
        self.model = model
        self.dataloader = dataloader
        self.device = device
        self.data_size = data_size
        self.local_epochs = 5
        self.learning_rate = 0.01
        self.is_byzantine = False

    def train_fedavg(
        self,
        global_params: List[np.ndarray],
        local_epochs: int = 5,
        learning_rate: float = 0.01,
        dp_engine: Optional[DifferentialPrivacyEngine] = None,
        progress_callback: Optional[Callable] = None
    ) -> Tuple[List[np.ndarray], Dict]:
        set_model_params(self.model, global_params)
        self.model.to(self.device)
        self.model.train()

        optimizer = torch.optim.SGD(self.model.parameters(), lr=learning_rate, momentum=0.9)
        criterion = nn.CrossEntropyLoss()

        total_loss = 0.0
        total_correct = 0
        total_samples = 0

        old_params = get_model_params(self.model)

        for epoch in range(local_epochs):
            epoch_loss = 0.0
            epoch_correct = 0
            epoch_samples = 0

            for batch_idx, (data, target) in enumerate(self.dataloader):
                data, target = data.to(self.device), target.to(self.device)
                batch_size = data.size(0)

                optimizer.zero_grad()
                output = self.model(data)
                loss = criterion(output, target)
                loss.backward()

                if dp_engine is not None:
                    dp_engine.clip_gradients(self.model)
                    dp_engine.add_noise(self.model, batch_size)

                optimizer.step()

                epoch_loss += loss.item() * batch_size
                pred = output.argmax(dim=1, keepdim=True)
                epoch_correct += pred.eq(target.view_as(pred)).sum().item()
                epoch_samples += batch_size

            total_loss += epoch_loss
            total_correct += epoch_correct
            total_samples += epoch_samples

            if progress_callback:
                progress_callback(epoch, epoch_loss / max(1, epoch_samples), epoch_correct / max(1, epoch_samples))

        new_params = get_model_params(self.model)
        model_update = compute_model_update(old_params, new_params)

        avg_loss = total_loss / max(1, total_samples * local_epochs)
        accuracy = total_correct / max(1, total_samples * local_epochs)

        stats = {
            'client_id': self.client_id,
            'loss': avg_loss,
            'accuracy': accuracy,
            'data_size': self.data_size,
            'local_steps': len(self.dataloader) * local_epochs,
            'device': self.device
        }

        return model_update, stats

    def train_fedprox(
        self,
        global_params: List[np.ndarray],
        local_epochs: int = 5,
        learning_rate: float = 0.01,
        mu: float = 0.01,
        dp_engine: Optional[DifferentialPrivacyEngine] = None,
        progress_callback: Optional[Callable] = None
    ) -> Tuple[List[np.ndarray], Dict]:
        set_model_params(self.model, global_params)
        self.model.to(self.device)
        self.model.train()

        global_weights = [torch.from_numpy(p).to(self.device) for p in global_params]

        optimizer = torch.optim.SGD(self.model.parameters(), lr=learning_rate, momentum=0.9)
        criterion = nn.CrossEntropyLoss()

        total_loss = 0.0
        total_correct = 0
        total_samples = 0

        old_params = get_model_params(self.model)

        for epoch in range(local_epochs):
            epoch_loss = 0.0
            epoch_correct = 0
            epoch_samples = 0

            for batch_idx, (data, target) in enumerate(self.dataloader):
                data, target = data.to(self.device), target.to(self.device)
                batch_size = data.size(0)

                optimizer.zero_grad()
                output = self.model(data)
                loss = criterion(output, target)

                prox_term = 0.0
                for i, p in enumerate(self.model.parameters()):
                    if global_weights[i].shape == p.shape:
                        prox_term += (mu / 2.0) * torch.norm(p - global_weights[i], p=2) ** 2
                loss = loss + prox_term

                loss.backward()

                if dp_engine is not None:
                    dp_engine.clip_gradients(self.model)
                    dp_engine.add_noise(self.model, batch_size)

                optimizer.step()

                epoch_loss += loss.item() * batch_size
                pred = output.argmax(dim=1, keepdim=True)
                epoch_correct += pred.eq(target.view_as(pred)).sum().item()
                epoch_samples += batch_size

            total_loss += epoch_loss
            total_correct += epoch_correct
            total_samples += epoch_samples

            if progress_callback:
                progress_callback(epoch, epoch_loss / max(1, epoch_samples), epoch_correct / max(1, epoch_samples))

        new_params = get_model_params(self.model)
        model_update = compute_model_update(old_params, new_params)

        avg_loss = total_loss / max(1, total_samples * local_epochs)
        accuracy = total_correct / max(1, total_samples * local_epochs)

        stats = {
            'client_id': self.client_id,
            'loss': avg_loss,
            'accuracy': accuracy,
            'data_size': self.data_size,
            'local_steps': len(self.dataloader) * local_epochs,
            'device': self.device,
            'prox_mu': mu
        }

        return model_update, stats


def evaluate_model(
    model: nn.Module,
    test_loader: DataLoader,
    device: str = "cpu"
) -> Tuple[float, float]:
    model.to(device)
    model.eval()
    criterion = nn.CrossEntropyLoss()

    total_loss = 0.0
    total_correct = 0
    total_samples = 0

    with torch.no_grad():
        for data, target in test_loader:
            data, target = data.to(device), target.to(device)
            batch_size = data.size(0)

            output = model(data)
            loss = criterion(output, target)

            total_loss += loss.item() * batch_size
            pred = output.argmax(dim=1, keepdim=True)
            total_correct += pred.eq(target.view_as(pred)).sum().item()
            total_samples += batch_size

    avg_loss = total_loss / max(1, total_samples)
    accuracy = total_correct / max(1, total_samples)

    return accuracy, avg_loss
