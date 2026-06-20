import os
import json
import redis
from celery import Celery
from datetime import datetime

from app.config import settings
from app.database import SessionLocal
from app import models
from app.core.federated_server import FedServer

celery_app = Celery(
    "fedlearn_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)

_redis_client = None


def get_redis():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.REDIS_URL)
    return _redis_client


def redis_publish(channel: str, data: dict):
    try:
        r = get_redis()
        r.publish(channel, json.dumps(data, default=str))
    except Exception as e:
        print(f"Redis publish error: {e}", flush=True)


@celery_app.task(bind=True, name="run_experiment", max_retries=0)
def run_experiment_task(self, experiment_id: int, config: dict):
    task_id = self.request.id

    db = SessionLocal()
    try:
        exp = db.query(models.Experiment).filter(
            models.Experiment.id == experiment_id
        ).first()
        if not exp:
            return {"status": "error", "message": "Experiment not found"}

        exp.celery_task_id = task_id
        exp.status = "running"
        exp.started_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()

    def ws_callback(data: dict):
        redis_publish(f"experiment:{experiment_id}:ws", data)

    def redis_callback(channel: str, data: dict):
        redis_publish(channel, data)

    redis_publish(f"experiment:{experiment_id}:ws", {
        'type': 'task_started',
        'experiment_id': experiment_id,
        'task_id': task_id,
        'timestamp': datetime.utcnow().isoformat()
    })

    server = FedServer(
        experiment_id=experiment_id,
        config=config,
        websocket_callback=ws_callback,
        redis_callback=redis_callback
    )

    success = server.run()

    db = SessionLocal()
    try:
        exp = db.query(models.Experiment).filter(
            models.Experiment.id == experiment_id
        ).first()
        if exp and exp.status in ["running", "pending"]:
            if exp.completed_at is None:
                exp.completed_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()

    return {
        "status": "success" if success else "failed",
        "experiment_id": experiment_id,
        "task_id": task_id
    }


@celery_app.task(name="stop_experiment")
def stop_experiment_task(experiment_id: int):
    db = SessionLocal()
    try:
        exp = db.query(models.Experiment).filter(
            models.Experiment.id == experiment_id
        ).first()
        if exp and exp.celery_task_id:
            celery_app.control.revoke(exp.celery_task_id, terminate=True)
        if exp:
            exp.status = "stopped"
            if exp.completed_at is None:
                exp.completed_at = datetime.utcnow()
        db.commit()

        redis_publish(f"experiment:{experiment_id}:ws", {
            'type': 'experiment_stopped',
            'experiment_id': experiment_id,
            'timestamp': datetime.utcnow().isoformat()
        })
    finally:
        db.close()

    return {"status": "stopped", "experiment_id": experiment_id}
