import numpy as np
from typing import List


def calculate_samples_per_class(num_samples: int, num_classes: int) -> List[int]:
    base = num_samples // num_classes
    remainder = num_samples % num_classes
    return [base + (1 if i < remainder else 0) for i in range(num_classes)]


def partition_iid(num_samples: int, num_classes: int, num_clients: int) -> List[List[int]]:
    samples_per_class = calculate_samples_per_class(num_samples, num_classes)
    distribution_matrix = np.zeros((num_clients, num_classes), dtype=int)

    for c in range(num_classes):
        class_samples = samples_per_class[c]
        base = class_samples // num_clients
        remainder = class_samples % num_clients
        for i in range(num_clients):
            distribution_matrix[i, c] = base + (1 if i < remainder else 0)

    return distribution_matrix.tolist()


def partition_dirichlet(
    num_samples: int,
    num_classes: int,
    num_clients: int,
    alpha: float
) -> List[List[int]]:
    samples_per_class = calculate_samples_per_class(num_samples, num_classes)
    distribution_matrix = np.zeros((num_clients, num_classes), dtype=int)

    for c in range(num_classes):
        proportions = np.random.dirichlet(np.repeat(alpha, num_clients))
        proportions = proportions / proportions.sum()
        class_samples = samples_per_class[c]
        counts = (proportions * class_samples).astype(int)
        counts[-1] = class_samples - counts[:-1].sum()
        for i in range(num_clients):
            distribution_matrix[i, c] = max(0, counts[i])

    return distribution_matrix.tolist()


def partition_label_skew(
    num_samples: int,
    num_classes: int,
    num_clients: int,
    labels_per_client: int
) -> List[List[int]]:
    if labels_per_client > num_classes:
        labels_per_client = num_classes

    samples_per_class = calculate_samples_per_class(num_samples, num_classes)
    distribution_matrix = np.zeros((num_clients, num_classes), dtype=int)

    client_labels = []
    all_labels = list(range(num_classes))
    labels_per_client = min(labels_per_client, num_classes)

    for i in range(num_clients):
        start_idx = (i * labels_per_client) % num_classes
        labels = []
        for j in range(labels_per_client):
            labels.append(all_labels[(start_idx + j) % num_classes])
        client_labels.append(labels)

    for c in range(num_classes):
        clients_with_class = [i for i in range(num_clients) if c in client_labels[i]]
        if not clients_with_class:
            continue
        class_samples = samples_per_class[c]
        num_clients_with = len(clients_with_class)
        base = class_samples // num_clients_with
        remainder = class_samples % num_clients_with
        for idx, client_idx in enumerate(clients_with_class):
            distribution_matrix[client_idx, c] = base + (1 if idx < remainder else 0)

    return distribution_matrix.tolist()


def create_partition(
    num_samples: int,
    num_classes: int,
    num_clients: int,
    mode: str,
    alpha: float = None,
    labels_per_client: int = None
) -> List[List[int]]:
    if mode == "iid":
        return partition_iid(num_samples, num_classes, num_clients)
    elif mode == "dirichlet":
        if alpha is None:
            alpha = 0.5
        return partition_dirichlet(num_samples, num_classes, num_clients, alpha)
    elif mode == "label_skew":
        if labels_per_client is None:
            labels_per_client = max(1, num_classes // 2)
        return partition_label_skew(num_samples, num_classes, num_clients, labels_per_client)
    else:
        raise ValueError(f"Unknown partition mode: {mode}")
