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

    dataset_name: str = Field("mnist", max_length=100)
    model_name: str = Field("mlp", pattern="^(mlp|cnn|resnet)$")


class ExperimentCreate(ExperimentConfigBase):
    partition_id: Optional[int] = Field(None, description="关联的分片方案ID")


class PartitionInfo(BaseModel):
    id: int
    mode: str
    num_clients: int
    alpha: Optional[float]
    labels_per_client: Optional[int]

    class Config:
        from_attributes = True


class ExperimentResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    status: str

    num_clients: int
    num_rounds: int
    client_sample_rate: float = 1.0
    local_epochs: int = 5
    batch_size: int = 64
    learning_rate: float = 0.01
    algorithm: str
    fedprox_mu: float = 0.01
    dataset_name: str
    model_name: str

    secure_aggregation: bool
    secagg_threshold: int = 8
    secagg_dropout_rate: float = 0.1
    differential_privacy: bool
    dp_clip_norm: float = 1.0
    dp_noise_multiplier: float = 1.0
    dp_target_epsilon: float = 5.0
    non_iid_mode: str
    non_iid_alpha: float = 0.5
    robust_aggregation: str
    num_byzantine: int
    byzantine_attack: str = "random"

    final_accuracy: Optional[float]
    current_epsilon: Optional[float]
    total_communication: Optional[float]

    celery_task_id: Optional[str]
    last_checkpoint_round: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    partition: Optional[PartitionInfo] = None

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


class ExperimentResume(BaseModel):
    num_rounds: Optional[int] = None
    learning_rate: Optional[float] = None
    local_epochs: Optional[int] = None
    batch_size: Optional[int] = None
    client_sample_rate: Optional[float] = None
    fedprox_mu: Optional[float] = None
    dp_target_epsilon: Optional[float] = None
    dp_noise_multiplier: Optional[float] = None
    dp_clip_norm: Optional[float] = None


class ExperimentTemplateResponse(BaseModel):
    id: str
    name: str
    description: str
    config: dict
    key_params: Dict[str, Any]


class ProgressUpdate(BaseModel):
    experiment_id: int
    round_num: int
    status: str
    global_accuracy: Optional[float]
    global_loss: Optional[float]
    epsilon_consumed: float
    message: Optional[str] = None


class GenerateReportRequest(BaseModel):
    experiment_ids: List[int]

    class Config:
        json_schema_extra = {
            "example": {
                "experiment_ids": [1, 2, 3]
            }
        }


class ReportOverviewItem(BaseModel):
    experiment_id: int
    experiment_name: str
    algorithm: str
    dataset: str
    num_clients: int
    num_rounds: int
    final_accuracy: Optional[float]
    total_communication: float
    duration_seconds: Optional[float]
    avg_round_accuracy_improvement: Optional[float]
    accuracy_variance: Optional[float]
    convergence_round: Optional[int]


class ReportAccuracyChartData(BaseModel):
    rounds: List[int]
    experiments: List[dict]


class ReportCommunicationChartData(BaseModel):
    experiment_names: List[str]
    avg_communication_per_round: List[float]
    total_communication: List[float]


class ReportPrivacyChartData(BaseModel):
    rounds: List[int]
    experiments: List[dict]


class ReportResponse(BaseModel):
    id: int
    title: str
    experiment_ids: List[int]
    status: str
    overview_table: List[ReportOverviewItem]
    accuracy_chart_data: ReportAccuracyChartData
    communication_chart_data: ReportCommunicationChartData
    privacy_chart_data: Optional[ReportPrivacyChartData] = None
    conclusion_summary: str
    pdf_size: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReportListItem(BaseModel):
    id: int
    title: str
    experiment_ids: List[int]
    status: str
    pdf_size: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReportListResponse(BaseModel):
    total: int
    reports: List[ReportListItem]


class DatasetBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    num_samples: int = Field(..., ge=1)
    num_classes: int = Field(..., ge=1)
    feature_dim: int = Field(..., ge=1)


class DatasetCreate(DatasetBase):
    pass


class DatasetUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    num_samples: Optional[int] = Field(None, ge=1)
    num_classes: Optional[int] = Field(None, ge=1)
    feature_dim: Optional[int] = Field(None, ge=1)


class DatasetResponse(DatasetBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class DatasetListResponse(BaseModel):
    total: int
    datasets: List[DatasetResponse]


class PartitionCreateRequest(BaseModel):
    num_clients: int = Field(..., ge=2, le=20)
    mode: str = Field(..., pattern="^(iid|dirichlet|label_skew)$")
    alpha: Optional[float] = Field(None, ge=0.01, le=100)
    labels_per_client: Optional[int] = Field(None, ge=1)


class PartitionResponse(BaseModel):
    id: int
    dataset_id: int
    num_clients: int
    mode: str
    alpha: Optional[float]
    labels_per_client: Optional[int]
    distribution_matrix: List[List[float]]
    created_at: datetime

    class Config:
        from_attributes = True


class PartitionListItem(BaseModel):
    id: int
    dataset_id: int
    num_clients: int
    mode: str
    alpha: Optional[float]
    labels_per_client: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class PartitionListResponse(BaseModel):
    total: int
    partitions: List[PartitionListItem]
