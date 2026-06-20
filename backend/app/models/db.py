from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="pending")

    num_clients = Column(Integer, default=10)
    num_rounds = Column(Integer, default=20)
    client_sample_rate = Column(Float, default=1.0)
    local_epochs = Column(Integer, default=5)
    batch_size = Column(Integer, default=64)
    learning_rate = Column(Float, default=0.01)

    algorithm = Column(String(50), default="fedavg")
    fedprox_mu = Column(Float, default=0.01)

    secure_aggregation = Column(Boolean, default=False)
    secagg_threshold = Column(Integer, default=8)
    secagg_dropout_rate = Column(Float, default=0.1)

    differential_privacy = Column(Boolean, default=False)
    dp_clip_norm = Column(Float, default=1.0)
    dp_noise_multiplier = Column(Float, default=1.0)
    dp_target_epsilon = Column(Float, default=5.0)
    dp_delta = Column(Float, default=1e-5)
    current_epsilon = Column(Float, default=0.0)

    non_iid_mode = Column(String(50), default="iid")
    non_iid_alpha = Column(Float, default=0.5)

    num_byzantine = Column(Integer, default=0)
    byzantine_attack = Column(String(50), default="random")
    robust_aggregation = Column(String(50), default="none")

    dataset_name = Column(String(50), default="mnist")
    model_name = Column(String(50), default="mlp")

    client_distribution = Column(JSON, nullable=True)
    final_accuracy = Column(Float, nullable=True)
    total_communication = Column(Float, default=0.0)

    partition_id = Column(Integer, ForeignKey("partitions.id"), nullable=True)

    celery_task_id = Column(String(255), nullable=True)
    error_message = Column(Text, nullable=True)
    last_checkpoint_round = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    rounds = relationship("RoundResult", back_populates="experiment", cascade="all, delete-orphan")
    partition = relationship("Partition")


class RoundResult(Base):
    __tablename__ = "round_results"

    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id"), nullable=False)
    round_num = Column(Integer, nullable=False)

    global_accuracy = Column(Float, nullable=True)
    global_loss = Column(Float, nullable=True)

    client_accuracies = Column(JSON, nullable=True)
    client_losses = Column(JSON, nullable=True)
    client_metrics = Column(JSON, nullable=True)

    num_participants = Column(Integer, nullable=True)
    communication_bytes = Column(Float, default=0.0)

    epsilon_consumed = Column(Float, default=0.0)
    byzantine_detected_count = Column(Integer, default=0)
    byzantine_total_count = Column(Integer, default=0)

    timestamps = Column(JSON, nullable=True)

    experiment = relationship("Experiment", back_populates="rounds")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    experiment_ids = Column(JSON, nullable=False)
    status = Column(String(50), default="generating")

    overview_table = Column(JSON, nullable=True)
    accuracy_chart_data = Column(JSON, nullable=True)
    communication_chart_data = Column(JSON, nullable=True)
    privacy_chart_data = Column(JSON, nullable=True)
    conclusion_summary = Column(Text, nullable=True)

    report_data = Column(JSON, nullable=True)
    pdf_size = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    num_samples = Column(Integer, nullable=False)
    num_classes = Column(Integer, nullable=False)
    feature_dim = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    partitions = relationship("Partition", back_populates="dataset", cascade="all, delete-orphan")


class Partition(Base):
    __tablename__ = "partitions"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    num_clients = Column(Integer, nullable=False)
    mode = Column(String(50), nullable=False)
    alpha = Column(Float, nullable=True)
    labels_per_client = Column(Integer, nullable=True)
    distribution_matrix = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dataset = relationship("Dataset", back_populates="partitions")
