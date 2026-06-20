from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class ExperimentConfigBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None

    num_clients: int = Field(10, ge=4, le=20)
    num_rounds: int = Field(20, ge=1, le=200)
    client_sample_rate: float = Field(1.0, ge=0.1, le=1.0)
    local_epochs: int = Field(5, ge=1, le=50)
    batch_size: int = Field(64, ge=1, le=512)
    learning_rate: float = Field(0.01, gt=0)

    algorithm: str = Field("fedavg", pattern="^(fedavg|fedprox)$")
    fedprox_mu: float = Field(0.01, ge=0)

    secure_aggregation: bool = False
    secagg_threshold: int = Field(8, ge=2)
    secagg_dropout_rate: float = Field(0.1, ge=0, le=0.5)

    differential_privacy: bool = False
    dp_clip_norm: float = Field(1.0, ge=0.01)
    dp_noise_multiplier: float = Field(1.0, ge=0)
    dp_target_epsilon: float = Field(5.0, ge=0.1)
    dp_delta: float = Field(1e-5, ge=0, le=1)

    non_iid_mode: str = Field("iid", pattern="^(iid|label_skew|quantity_skew|feature_skew)$")
    non_iid_alpha: float = Field(0.5, gt=0)

    num_byzantine: int = Field(0, ge=0, le=10)
    byzantine_attack: str = Field("random", pattern="^(random|scale|zero)$")
    robust_aggregation: str = Field("none", pattern="^(none|krum|trimmed_mean|median)$")

    dataset_name: str = Field("mnist", pattern="^(mnist|cifar10)$")
    model_name: str = Field("mlp", pattern="^(mlp|cnn|resnet)$")


class ExperimentCreate(ExperimentConfigBase):
    pass


class ExperimentResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    status: str

    num_clients: int
    num_rounds: int
    algorithm: str
    dataset_name: str
    model_name: str

    secure_aggregation: bool
    differential_privacy: bool
    non_iid_mode: str
    robust_aggregation: str
    num_byzantine: int

    final_accuracy: Optional[float]
    current_epsilon: Optional[float]
    total_communication: Optional[float]

    celery_task_id: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class RoundResultResponse(BaseModel):
    id: int
    experiment_id: int
    round_num: int
    global_accuracy: Optional[float]
    global_loss: Optional[float]
    client_accuracies: Optional[List[float]]
    client_losses: Optional[List[float]]
    num_participants: Optional[int]
    communication_bytes: float
    epsilon_consumed: float
    byzantine_detected_count: int
    byzantine_total_count: int

    class Config:
        from_attributes = True


class ExperimentDetailResponse(ExperimentResponse):
    rounds: List[RoundResultResponse] = []
    client_distribution: Optional[Dict[str, Any]] = None


class ExperimentListResponse(BaseModel):
    total: int
    experiments: List[ExperimentResponse]


class ProgressUpdate(BaseModel):
    experiment_id: int
    round_num: int
    status: str
    global_accuracy: Optional[float]
    global_loss: Optional[float]
    epsilon_consumed: float
    message: Optional[str] = None
