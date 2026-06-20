import numpy as np
import torch
from torchvision import datasets, transforms
from typing import List, Tuple, Dict, Optional
import random
from collections import Counter


class NonIIDDataPartitioner:
    def __init__(self, num_clients: int, mode: str = "iid", alpha: float = 0.5):
        self.num_clients = num_clients
        self.mode = mode
        self.alpha = alpha
        self.client_data_counts: Dict[int, int] = {}
        self.client_label_dist: Dict[int, np.ndarray] = {}

    def _dirichlet_split(self, num_samples: int, alpha: float) -> np.ndarray:
        proportions = np.random.dirichlet(np.repeat(alpha, self.num_clients))
        proportions = proportions / proportions.sum()
        counts = (proportions * num_samples).astype(int)
        counts[-1] = num_samples - counts[:-1].sum()
        return counts

    def split_label_skew(
        self,
        dataset: datasets.VisionDataset
    ) -> List[List[int]]:
        num_classes = len(dataset.classes) if hasattr(dataset, 'classes') else 10

        try:
            labels = np.array([dataset[i][1] for i in range(len(dataset))])
        except Exception:
            labels = np.array(dataset.targets[:len(dataset)]) if hasattr(dataset, 'targets') else np.array([dataset[i][1] for i in range(len(dataset))])

        label_indices = [np.where(labels == c)[0] for c in range(num_classes)]

        client_indices = [[] for _ in range(self.num_clients)]
        client_label_count = np.zeros((self.num_clients, num_classes))

        for c in range(num_classes):
            indices = label_indices[c].copy()
            np.random.shuffle(indices)
            counts = self._dirichlet_split(len(indices), self.alpha)
            start = 0
            for i in range(self.num_clients):
                end = start + counts[i]
                client_indices[i].extend(indices[start:end])
                client_label_count[i, c] = counts[i]
                start = end

        for i in range(self.num_clients):
            np.random.shuffle(client_indices[i])
            self.client_data_counts[i] = len(client_indices[i])
            self.client_label_dist[i] = client_label_count[i] / max(1, client_label_count[i].sum())

        return client_indices

    def split_quantity_skew(
        self,
        dataset: datasets.VisionDataset
    ) -> List[List[int]]:
        num_samples = len(dataset)
        total_ratio = 0.0
        ratios = []
        for i in range(self.num_clients):
            ratio = np.random.uniform(self.alpha / 10, self.alpha * 10)
            ratios.append(ratio)
            total_ratio += ratio

        ratios = [r / total_ratio for r in ratios]
        counts = [int(r * num_samples) for r in ratios]
        counts[-1] = num_samples - sum(counts[:-1])

        indices = np.arange(num_samples)
        np.random.shuffle(indices)

        client_indices = []
        start = 0
        for i, count in enumerate(counts):
            end = start + count
            client_indices.append(list(indices[start:end]))
            self.client_data_counts[i] = count
            start = end

        num_classes = len(dataset.classes) if hasattr(dataset, 'classes') else 10
        for i in range(self.num_clients):
            self.client_label_dist[i] = np.ones(num_classes) / num_classes

        return client_indices

    def split_feature_skew(
        self,
        dataset: datasets.VisionDataset
    ) -> Tuple[List[List[int]], Dict[int, float]]:
        num_samples = len(dataset)
        base_count = num_samples // self.num_clients
        remainder = num_samples % self.num_clients

        counts = [base_count + (1 if i < remainder else 0) for i in range(self.num_clients)]

        indices = np.arange(num_samples)
        np.random.shuffle(indices)

        client_indices = []
        client_noise_scales = {}
        start = 0
        for i, count in enumerate(counts):
            end = start + count
            client_indices.append(list(indices[start:end]))
            self.client_data_counts[i] = count
            client_noise_scales[i] = self.alpha * (0.5 + i / self.num_clients)
            start = end

        num_classes = len(dataset.classes) if hasattr(dataset, 'classes') else 10
        for i in range(self.num_clients):
            self.client_label_dist[i] = np.ones(num_classes) / num_classes

        return client_indices, client_noise_scales

    def split_iid(
        self,
        dataset: datasets.VisionDataset
    ) -> List[List[int]]:
        num_samples = len(dataset)
        base_count = num_samples // self.num_clients
        remainder = num_samples % self.num_clients

        counts = [base_count + (1 if i < remainder else 0) for i in range(self.num_clients)]

        indices = np.arange(num_samples)
        np.random.shuffle(indices)

        client_indices = []
        start = 0
        num_classes = len(dataset.classes) if hasattr(dataset, 'classes') else 10
        for i, count in enumerate(counts):
            end = start + count
            client_indices.append(list(indices[start:end]))
            self.client_data_counts[i] = count
            self.client_label_dist[i] = np.ones(num_classes) / num_classes
            start = end

        return client_indices

    def split(self, dataset: datasets.VisionDataset):
        result = {
            'client_indices': None,
            'noise_scales': None,
            'client_data_counts': self.client_data_counts,
            'client_label_dist': self.client_label_dist
        }

        if self.mode == "label_skew":
            result['client_indices'] = self.split_label_skew(dataset)
        elif self.mode == "quantity_skew":
            result['client_indices'] = self.split_quantity_skew(dataset)
        elif self.mode == "feature_skew":
            indices, noise_scales = self.split_feature_skew(dataset)
            result['client_indices'] = indices
            result['noise_scales'] = noise_scales
        else:
            result['client_indices'] = self.split_iid(dataset)

        result['client_data_counts'] = self.client_data_counts
        result['client_label_dist'] = self.client_label_dist

        return result

    def get_distribution_stats(self) -> dict:
        return {
            'num_clients': self.num_clients,
            'mode': self.mode,
            'alpha': self.alpha,
            'client_data_counts': {str(k): v for k, v in self.client_data_counts.items()},
            'client_label_dist': {
                str(k): v.tolist() if isinstance(v, np.ndarray) else v
                for k, v in self.client_label_dist.items()
            }
        }


class NoisyDataset(torch.utils.data.Dataset):
    def __init__(self, original_dataset, indices: List[int], noise_scale: float = 0.0):
        self.original = original_dataset
        self.indices = indices
        self.noise_scale = noise_scale

    def __len__(self):
        return len(self.indices)

    def __getitem__(self, idx):
        real_idx = self.indices[idx]
        data, label = self.original[real_idx]

        if self.noise_scale > 0:
            noise = torch.randn_like(data) * self.noise_scale
            data = data + noise
            data = torch.clamp(data, 0, 1)

        return data, label
