from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
import logging

from app.database import get_db
from app import models, schemas

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


def _get_tasks():
    try:
        from app.worker.tasks import run_experiment_task, stop_experiment_task
        return run_experiment_task, stop_experiment_task
    except Exception as e:
        logger.warning(f"Celery tasks not available: {e}")
        return None, None


@router.post("", response_model=schemas.ExperimentResponse)
def create_experiment(
    config: schemas.ExperimentCreate,
    db: Session = Depends(get_db)
):
    try:
        exp = models.Experiment(
            name=config.name,
            description=config.description,
            status="pending",
            num_clients=config.num_clients,
            num_rounds=config.num_rounds,
            client_sample_rate=config.client_sample_rate,
            local_epochs=config.local_epochs,
            batch_size=config.batch_size,
            learning_rate=config.learning_rate,
            algorithm=config.algorithm,
            fedprox_mu=config.fedprox_mu,
            secure_aggregation=config.secure_aggregation,
            secagg_threshold=config.secagg_threshold,
            secagg_dropout_rate=config.secagg_dropout_rate,
            differential_privacy=config.differential_privacy,
            dp_clip_norm=config.dp_clip_norm,
            dp_noise_multiplier=config.dp_noise_multiplier,
            dp_target_epsilon=config.dp_target_epsilon,
            dp_delta=config.dp_delta,
            non_iid_mode=config.non_iid_mode,
            non_iid_alpha=config.non_iid_alpha,
            num_byzantine=config.num_byzantine,
            byzantine_attack=config.byzantine_attack,
            robust_aggregation=config.robust_aggregation,
            dataset_name=config.dataset_name,
            model_name=config.model_name,
            created_at=datetime.utcnow()
        )
        db.add(exp)
        db.commit()
        db.refresh(exp)
        return exp
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create experiment: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create experiment: {str(e)}")


@router.get("", response_model=schemas.ExperimentListResponse)
def list_experiments(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    try:
        query = db.query(models.Experiment)
        if status:
            query = query.filter(models.Experiment.status == status)

        total = query.count()
        experiments = (
            query.order_by(desc(models.Experiment.created_at))
            .offset(skip)
            .limit(limit)
            .all()
        )

        return {"total": total, "experiments": experiments}
    except Exception as e:
        logger.error(f"Failed to list experiments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list experiments: {str(e)}")


@router.get("/{experiment_id}", response_model=schemas.ExperimentDetailResponse)
def get_experiment(experiment_id: int, db: Session = Depends(get_db)):
    try:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")
        return exp
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get experiment: {str(e)}")


@router.post("/{experiment_id}/start", response_model=schemas.ExperimentResponse)
def start_experiment(experiment_id: int, db: Session = Depends(get_db)):
    run_experiment_task, _ = _get_tasks()

    try:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")

        if exp.status in ["running", "pending"] and exp.celery_task_id:
            raise HTTPException(status_code=400, detail="Experiment already running")

        config_dict = {
            "num_clients": exp.num_clients,
            "num_rounds": exp.num_rounds,
            "client_sample_rate": exp.client_sample_rate,
            "local_epochs": exp.local_epochs,
            "batch_size": exp.batch_size,
            "learning_rate": exp.learning_rate,
            "algorithm": exp.algorithm,
            "fedprox_mu": exp.fedprox_mu,
            "secure_aggregation": exp.secure_aggregation,
            "secagg_threshold": exp.secagg_threshold,
            "secagg_dropout_rate": exp.secagg_dropout_rate,
            "differential_privacy": exp.differential_privacy,
            "dp_clip_norm": exp.dp_clip_norm,
            "dp_noise_multiplier": exp.dp_noise_multiplier,
            "dp_target_epsilon": exp.dp_target_epsilon,
            "dp_delta": exp.dp_delta,
            "non_iid_mode": exp.non_iid_mode,
            "non_iid_alpha": exp.non_iid_alpha,
            "num_byzantine": exp.num_byzantine,
            "byzantine_attack": exp.byzantine_attack,
            "robust_aggregation": exp.robust_aggregation,
            "dataset_name": exp.dataset_name,
            "model_name": exp.model_name,
        }

        exp.status = "queued"
        db.commit()
        db.refresh(exp)

        if run_experiment_task is None:
            exp.status = "error"
            exp.error_message = "Celery worker is not available. Please check worker service."
            db.commit()
            db.refresh(exp)
            raise HTTPException(status_code=503, detail="Celery worker is not available")

        task = run_experiment_task.delay(experiment_id, config_dict)

        exp.celery_task_id = task.id
        db.commit()
        db.refresh(exp)

        return exp
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to start experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start experiment: {str(e)}")


@router.post("/{experiment_id}/stop", response_model=schemas.ExperimentResponse)
def stop_experiment(experiment_id: int, db: Session = Depends(get_db)):
    _, stop_experiment_task = _get_tasks()

    try:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")

        if exp.status not in ["running", "queued"]:
            raise HTTPException(status_code=400, detail="Experiment not running")

        if exp.celery_task_id and stop_experiment_task is not None:
            try:
                stop_experiment_task.delay(experiment_id)
            except Exception as e:
                logger.warning(f"Failed to send stop task: {e}")

        exp.status = "stopping"
        db.commit()
        db.refresh(exp)

        return exp
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to stop experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to stop experiment: {str(e)}")


@router.delete("/{experiment_id}")
def delete_experiment(experiment_id: int, db: Session = Depends(get_db)):
    _, stop_experiment_task = _get_tasks()

    try:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")

        if exp.status == "running" and exp.celery_task_id and stop_experiment_task is not None:
            try:
                stop_experiment_task.delay(experiment_id)
            except Exception as e:
                logger.warning(f"Failed to send stop task during delete: {e}")

        db.delete(exp)
        db.commit()

        return {"status": "deleted", "id": experiment_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete experiment: {str(e)}")


@router.get("/{experiment_id}/rounds")
def get_experiment_rounds(
    experiment_id: int,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000)
):
    try:
        exp = (
            db.query(models.Experiment)
            .filter(models.Experiment.id == experiment_id)
            .first()
        )
        if not exp:
            raise HTTPException(status_code=404, detail="Experiment not found")

        rounds = (
            db.query(models.RoundResult)
            .filter(models.RoundResult.experiment_id == experiment_id)
            .order_by(models.RoundResult.round_num)
            .offset(skip)
            .limit(limit)
            .all()
        )

        return {
            "experiment_id": experiment_id,
            "total_rounds": len(rounds),
            "rounds": rounds
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get rounds for experiment {experiment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get rounds: {str(e)}")


@router.get("/compare")
def compare_experiments(
    ids: str = Query(..., description="Comma-separated experiment IDs"),
    db: Session = Depends(get_db)
):
    try:
        try:
            experiment_ids = [int(x.strip()) for x in ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid experiment IDs")

        if len(experiment_ids) < 1 or len(experiment_ids) > 10:
            raise HTTPException(status_code=400, detail="Provide 1-10 experiment IDs")

        results = []
        for exp_id in experiment_ids:
            exp = (
                db.query(models.Experiment)
                .filter(models.Experiment.id == exp_id)
                .first()
            )
            if not exp:
                continue

            rounds = (
                db.query(models.RoundResult)
                .filter(models.RoundResult.experiment_id == exp_id)
                .order_by(models.RoundResult.round_num)
                .all()
            )

            results.append({
                "experiment": {
                    "id": exp.id,
                    "name": exp.name,
                    "config": {
                        "algorithm": exp.algorithm,
                        "dataset": exp.dataset_name,
                        "model": exp.model_name,
                        "non_iid_mode": exp.non_iid_mode,
                        "non_iid_alpha": exp.non_iid_alpha,
                        "secure_agg": exp.secure_aggregation,
                        "dp": exp.differential_privacy,
                        "byzantine": exp.num_byzantine,
                        "robust_agg": exp.robust_aggregation
                    },
                    "final_accuracy": exp.final_accuracy,
                    "status": exp.status
                },
                "rounds": [
                    {
                        "round_num": r.round_num,
                        "accuracy": r.global_accuracy,
                        "loss": r.global_loss,
                        "epsilon": r.epsilon_consumed
                    }
                    for r in rounds
                ]
            })

        return {"comparison": results}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to compare experiments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to compare experiments: {str(e)}")
