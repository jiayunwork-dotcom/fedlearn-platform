import os
import torch
import numpy as np
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, transforms
from typing import Tuple, List, Dict, Optional

from app.config import settings
from app.core.non_iid_data import NonIIDDataPartitioner, NoisyDataset


def _infer_base_dataset(dataset_name: str, feature_dim: Optional[int] = None) -> str:
    name_lower = dataset_name.lower()
    if "mnist" in name_lower or dataset_name == "mnist":
        return "mnist"
    if "cifar" in name_lower or dataset_name == "cifar10":
        return "cifar10"
    if feature_dim is not None:
        if feature_dim == 784:
            return "mnist"
        if feature_dim == 3072:
            return "cifar10"
    return "mnist"


def get_mnist_transforms(train: bool = True):
    transform_list = [transforms.ToTensor()]
    if train:
        transform_list.insert(0, transforms.RandomRotation(10))
    transform_list.append(transforms.Normalize((0.1307,), (0.3081,)))
    return transforms.Compose(transform_list)


def get_cifar10_transforms(train: bool = True):
    transform_list = []
    if train:
        transform_list.extend([
            transforms.RandomCrop(32, padding=4),
            transforms.RandomHorizontalFlip(),
        ])
    transform_list.extend([
        transforms.ToTensor(),
        transforms.Normalize((0.4914, 0.4822, 0.4465), (0.2023, 0.1994, 0.2010)),
    ])
    return transforms.Compose(transform_list)


def load_dataset(
    dataset_name: str,
    data_dir: Optional[str] = None,
    feature_dim: Optional[int] = None
) -> Tuple[datasets.VisionDataset, datasets.VisionDataset]:
    if data_dir is None:
        data_dir = settings.DATA_DIR

    os.makedirs(data_dir, exist_ok=True)

    base_dataset = _infer_base_dataset(dataset_name, feature_dim)

    if base_dataset == "mnist":
        train_transform = get_mnist_transforms(train=True)
        test_transform = get_mnist_transforms(train=False)
        train_dataset = datasets.MNIST(
            root=data_dir, train=True, download=True, transform=train_transform
        )
        test_dataset = datasets.MNIST(
            root=data_dir, train=False, download=True, transform=test_transform
        )
    elif base_dataset == "cifar10":
        train_transform = get_cifar10_transforms(train=True)
        test_transform = get_cifar10_transforms(train=False)
        train_dataset = datasets.CIFAR10(
            root=data_dir, train=True, download=True, transform=train_transform
        )
        test_dataset = datasets.CIFAR10(
            root=data_dir, train=False, download=True, transform=test_transform
        )
    else:
        raise ValueError(f"Unknown dataset: {dataset_name}")

    return train_dataset, test_dataset


def create_client_dataloaders(
    train_dataset: datasets.VisionDataset,
    num_clients: int,
    non_iid_mode: str = "iid",
    non_iid_alpha: float = 0.5,
    batch_size: int = 64,
    seed: int = 42
) -> Tuple[Dict[int, DataLoader], Dict, NonIIDDataPartitioner]:
    torch.manual_seed(seed)
    import numpy as np
    np.random.seed(seed)

    partitioner = NonIIDDataPartitioner(num_clients, non_iid_mode, non_iid_alpha)
    split_result = partitioner.split(train_dataset)

    client_indices = split_result['client_indices']
    noise_scales = split_result.get('noise_scales')

    client_loaders = {}
    client_sizes = {}

    for client_id in range(num_clients):
        indices = client_indices[client_id]
        client_sizes[client_id] = len(indices)

        if noise_scales and non_iid_mode == "feature_skew":
            dataset = NoisyDataset(train_dataset, indices, noise_scales[client_id])
        else:
            dataset = Subset(train_dataset, indices)

        loader = DataLoader(
            dataset,
            batch_size=batch_size,
            shuffle=True,
            num_workers=0,
            drop_last=False
        )
        client_loaders[client_id] = loader

    dist_stats = partitioner.get_distribution_stats()
    return client_loaders, dist_stats, partitioner


def create_client_dataloaders_from_matrix(
    train_dataset: datasets.VisionDataset,
    distribution_matrix: List[List[int]],
    num_classes: int,
    batch_size: int = 64,
    seed: int = 42
) -> Tuple[Dict[int, DataLoader], Dict]:
    torch.manual_seed(seed)
    np.random.seed(seed)

    num_clients = len(distribution_matrix)

    try:
        labels = np.array([train_dataset[i][1] for i in range(len(train_dataset))])
    except Exception:
        labels = np.array(train_dataset.targets[:len(train_dataset)]) if hasattr(train_dataset, 'targets') else np.array([train_dataset[i][1] for i in range(len(train_dataset))])

    label_indices = [np.where(labels == c)[0] for c in range(num_classes)]
    for c in range(num_classes):
        np.random.shuffle(label_indices[c])

    client_indices = [[] for _ in range(num_clients)]
    label_pointers = [0] * num_classes

    for client_id in range(num_clients):
        for class_id in range(num_classes):
            count = distribution_matrix[client_id][class_id]
            if count <= 0:
                continue
            start = label_pointers[class_id]
            end = start + count
            if start < len(label_indices[class_id]) and end <= len(label_indices[class_id]):
                client_indices[client_id].extend(label_indices[class_id][start:end].tolist())
            label_pointers[class_id] = end

    client_loaders = {}
    client_sizes = {}
    client_label_dist = np.array(distribution_matrix, dtype=float)

    for client_id in range(num_clients):
        indices = client_indices[client_id]
        client_sizes[client_id] = len(indices)
        row_sum = client_label_dist[client_id].sum()
        if row_sum > 0:
            client_label_dist[client_id] = client_label_dist[client_id] / row_sum
        else:
            client_label_dist[client_id] = 0

        dataset = Subset(train_dataset, indices)
        loader = DataLoader(
            dataset,
            batch_size=batch_size,
            shuffle=True,
            num_workers=0,
            drop_last=False
        )
        client_loaders[client_id] = loader

    dist_stats = {
        "client_sizes": client_sizes,
        "client_label_distributions": {
            i: dist.tolist() for i, dist in enumerate(client_label_dist)
        }
    }

    return client_loaders, dist_stats


def create_test_loader(
    test_dataset: datasets.VisionDataset,
    batch_size: int = 128
) -> DataLoader:
    return DataLoader(
        test_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=0
    )
