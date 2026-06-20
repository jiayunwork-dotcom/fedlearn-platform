from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
import logging

from app.database import get_db
from app import models, schemas
from app.services.partition_service import create_partition

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.post("", response_model=schemas.DatasetResponse)
def create_dataset(
    dataset: schemas.DatasetCreate,
    db: Session = Depends(get_db)
):
    try:
        db_dataset = models.Dataset(
            name=dataset.name,
            description=dataset.description,
            num_samples=dataset.num_samples,
            num_classes=dataset.num_classes,
            feature_dim=dataset.feature_dim,
        )
        db.add(db_dataset)
        db.commit()
        db.refresh(db_dataset)
        return db_dataset
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create dataset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create dataset: {str(e)}")


@router.get("", response_model=schemas.DatasetListResponse)
def list_datasets(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    try:
        query = db.query(models.Dataset)
        total = query.count()
        datasets = (
            query.order_by(desc(models.Dataset.created_at))
            .offset(skip)
            .limit(limit)
            .all()
        )
        return {"total": total, "datasets": datasets}
    except Exception as e:
        logger.error(f"Failed to list datasets: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list datasets: {str(e)}")


@router.get("/{dataset_id}", response_model=schemas.DatasetResponse)
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    try:
        dataset = (
            db.query(models.Dataset)
            .filter(models.Dataset.id == dataset_id)
            .first()
        )
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        return dataset
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get dataset {dataset_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get dataset: {str(e)}")


@router.put("/{dataset_id}", response_model=schemas.DatasetResponse)
def update_dataset(
    dataset_id: int,
    dataset_update: schemas.DatasetUpdate,
    db: Session = Depends(get_db)
):
    try:
        dataset = (
            db.query(models.Dataset)
            .filter(models.Dataset.id == dataset_id)
            .first()
        )
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")

        if dataset_update.name is not None:
            dataset.name = dataset_update.name
        if dataset_update.description is not None:
            dataset.description = dataset_update.description
        if dataset_update.num_samples is not None:
            dataset.num_samples = dataset_update.num_samples
        if dataset_update.num_classes is not None:
            dataset.num_classes = dataset_update.num_classes
        if dataset_update.feature_dim is not None:
            dataset.feature_dim = dataset_update.feature_dim

        db.commit()
        db.refresh(dataset)
        return dataset
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update dataset {dataset_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update dataset: {str(e)}")


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    try:
        dataset = (
            db.query(models.Dataset)
            .filter(models.Dataset.id == dataset_id)
            .first()
        )
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")

        db.delete(dataset)
        db.commit()

        return {"status": "deleted", "id": dataset_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete dataset {dataset_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete dataset: {str(e)}")


@router.post("/{dataset_id}/partitions", response_model=schemas.PartitionResponse)
def create_partition_endpoint(
    dataset_id: int,
    request: schemas.PartitionCreateRequest,
    db: Session = Depends(get_db)
):
    try:
        dataset = (
            db.query(models.Dataset)
            .filter(models.Dataset.id == dataset_id)
            .first()
        )
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")

        if request.mode == "label_skew" and request.labels_per_client is None:
            raise HTTPException(
                status_code=400,
                detail="labels_per_client is required for label_skew mode"
            )

        if request.mode == "dirichlet" and request.alpha is None:
            raise HTTPException(
                status_code=400,
                detail="alpha is required for dirichlet mode"
            )

        if request.mode == "label_skew" and request.labels_per_client > dataset.num_classes:
            raise HTTPException(
                status_code=400,
                detail=f"labels_per_client cannot exceed num_classes"
            )

        distribution_matrix = create_partition(
            num_samples=dataset.num_samples,
            num_classes=dataset.num_classes,
            num_clients=request.num_clients,
            mode=request.mode,
            alpha=request.alpha,
            labels_per_client=request.labels_per_client,
        )

        db_partition = models.Partition(
            dataset_id=dataset_id,
            num_clients=request.num_clients,
            mode=request.mode,
            alpha=request.alpha,
            labels_per_client=request.labels_per_client,
            distribution_matrix=distribution_matrix,
        )
        db.add(db_partition)
        db.commit()
        db.refresh(db_partition)

        return db_partition
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create partition for dataset {dataset_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create partition: {str(e)}")


@router.get("/{dataset_id}/partitions", response_model=schemas.PartitionListResponse)
def list_partitions(
    dataset_id: int,
    db: Session = Depends(get_db)
):
    try:
        dataset = (
            db.query(models.Dataset)
            .filter(models.Dataset.id == dataset_id)
            .first()
        )
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")

        partitions = (
            db.query(models.Partition)
            .filter(models.Partition.dataset_id == dataset_id)
            .order_by(desc(models.Partition.created_at))
            .all()
        )

        return {"total": len(partitions), "partitions": partitions}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to list partitions for dataset {dataset_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list partitions: {str(e)}")


@router.get("/{dataset_id}/partitions/{partition_id}", response_model=schemas.PartitionResponse)
def get_partition(
    dataset_id: int,
    partition_id: int,
    db: Session = Depends(get_db)
):
    try:
        partition = (
            db.query(models.Partition)
            .filter(
                models.Partition.id == partition_id,
                models.Partition.dataset_id == dataset_id,
            )
            .first()
        )
        if not partition:
            raise HTTPException(status_code=404, detail="Partition not found")
        return partition
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get partition {partition_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get partition: {str(e)}")


@router.delete("/{dataset_id}/partitions/{partition_id}")
def delete_partition(
    dataset_id: int,
    partition_id: int,
    db: Session = Depends(get_db)
):
    try:
        partition = (
            db.query(models.Partition)
            .filter(
                models.Partition.id == partition_id,
                models.Partition.dataset_id == dataset_id,
            )
            .first()
        )
        if not partition:
            raise HTTPException(status_code=404, detail="Partition not found")

        db.delete(partition)
        db.commit()

        return {"status": "deleted", "id": partition_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete partition {partition_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete partition: {str(e)}")
