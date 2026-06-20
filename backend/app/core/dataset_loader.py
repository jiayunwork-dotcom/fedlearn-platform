import os
import torch
from torch.utils.data import DataLoader, Subset
from torchvision import datasets, transforms
from typing import Tuple, List, Dict, Optional

from app.config import settings
from app.core.non_iid_data import NonIIDDataPartitioner, NoisyDataset


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
    data_dir: Optional[str] = None
) -> Tuple[datasets.VisionDataset, datasets.VisionDataset]:
    if data_dir is None:
        data_dir = settings.DATA_DIR

    os.makedirs(data_dir, exist_ok=True)

    if dataset_name == "mnist":
        train_transform = get_mnist_transforms(train=True)
        test_transform = get_mnist_transforms(train=False)
        train_dataset = datasets.MNIST(
            root=data_dir, train=True, download=True, transform=train_transform
        )
        test_dataset = datasets.MNIST(
            root=data_dir, train=False, download=True, transform=test_transform
        )
    elif dataset_name == "cifar10":
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
