import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple


class MLP(nn.Module):
    def __init__(self, input_dim: int = 784, hidden_dim: int = 256, num_classes: int = 10):
        super(MLP, self).__init__()
        self.flatten = nn.Flatten()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, hidden_dim)
        self.fc3 = nn.Linear(hidden_dim, num_classes)
        self.relu = nn.ReLU()
        self.dropout = nn.Dropout(0.2)

    def forward(self, x):
        x = self.flatten(x)
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.relu(self.fc2(x))
        x = self.dropout(x)
        x = self.fc3(x)
        return x


class SimpleCNN(nn.Module):
    def __init__(self, in_channels: int = 1, num_classes: int = 10):
        super(SimpleCNN, self).__init__()
        self.conv1 = nn.Conv2d(in_channels, 32, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(32, 64, kernel_size=3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        self.dropout1 = nn.Dropout(0.25)
        self.dropout2 = nn.Dropout(0.5)

        self._feature_dim = self._get_feature_dim(in_channels)
        self.fc1 = nn.Linear(self._feature_dim, 128)
        self.fc2 = nn.Linear(128, num_classes)
        self.relu = nn.ReLU()

    def _get_feature_dim(self, in_channels: int) -> int:
        x = torch.randn(1, in_channels, 28, 28) if in_channels == 1 else torch.randn(1, in_channels, 32, 32)
        with torch.no_grad():
            x = self.pool(self.relu(self.conv1(x)))
            x = self.pool(self.relu(self.conv2(x)))
        return x.view(1, -1).size(1)

    def forward(self, x):
        x = self.pool(self.relu(self.conv1(x)))
        x = self.pool(self.relu(self.conv2(x)))
        x = self.dropout1(x)
        x = x.view(x.size(0), -1)
        x = self.relu(self.fc1(x))
        x = self.dropout2(x)
        x = self.fc2(x)
        return x


class BasicBlock(nn.Module):
    def __init__(self, in_channels: int, out_channels: int, stride: int = 1):
        super(BasicBlock, self).__init__()
        self.conv1 = nn.Conv2d(in_channels, out_channels, kernel_size=3, stride=stride, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(out_channels)
        self.conv2 = nn.Conv2d(out_channels, out_channels, kernel_size=3, stride=1, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_channels)
        self.relu = nn.ReLU(inplace=True)

        self.shortcut = nn.Sequential()
        if stride != 1 or in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, kernel_size=1, stride=stride, bias=False),
                nn.BatchNorm2d(out_channels)
            )

    def forward(self, x):
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out += self.shortcut(x)
        out = self.relu(out)
        return out


class SimpleResNet(nn.Module):
    def __init__(self, in_channels: int = 1, num_classes: int = 10):
        super(SimpleResNet, self).__init__()
        self.in_channels = 64
        self.conv1 = nn.Conv2d(in_channels, 64, kernel_size=3, stride=1, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(64)
        self.relu = nn.ReLU(inplace=True)

        self.layer1 = self._make_layer(64, 1, stride=1)
        self.layer2 = self._make_layer(128, 1, stride=2)
        self.layer3 = self._make_layer(256, 1, stride=2)

        self.avg_pool = nn.AdaptiveAvgPool2d((1, 1))
        self.fc = nn.Linear(256, num_classes)

    def _make_layer(self, out_channels: int, num_blocks: int, stride: int):
        strides = [stride] + [1] * (num_blocks - 1)
        layers = []
        for s in strides:
            layers.append(BasicBlock(self.in_channels, out_channels, s))
            self.in_channels = out_channels
        return nn.Sequential(*layers)

    def forward(self, x):
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.layer1(out)
        out = self.layer2(out)
        out = self.layer3(out)
        out = self.avg_pool(out)
        out = out.view(out.size(0), -1)
        out = self.fc(out)
        return out


def create_model(model_name: str, dataset_name: str, num_classes: int = 10):
    in_channels = 3 if dataset_name == "cifar10" else 1
    input_dim = 32 * 32 * 3 if dataset_name == "cifar10" else 28 * 28

    if model_name == "mlp":
        return MLP(input_dim=input_dim, num_classes=num_classes)
    elif model_name == "cnn":
        return SimpleCNN(in_channels=in_channels, num_classes=num_classes)
    elif model_name == "resnet":
        return SimpleResNet(in_channels=in_channels, num_classes=num_classes)
    else:
        raise ValueError(f"Unknown model: {model_name}")


def get_model_params(model: nn.Module) -> list:
    return [p.data.clone().cpu().numpy() for p in model.parameters()]


def set_model_params(model: nn.Module, params: list):
    with torch.no_grad():
        for i, p in enumerate(model.parameters()):
            p.data.copy_(torch.from_numpy(params[i].astype(p.data.numpy().dtype)))


def compute_model_update(old_params: list, new_params: list) -> list:
    return [new_p - old_p for old_p, new_p in zip(old_params, new_params)]


def get_model_size_bytes(model: nn.Module) -> int:
    total_size = 0
    for p in model.parameters():
        total_size += p.data.numel() * p.data.element_size()
    return total_size
