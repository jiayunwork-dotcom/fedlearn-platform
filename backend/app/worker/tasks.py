import os
import json
import logging
from datetime import datetime

import redis

from app.worker.celery_app import celery_app
from app.config import settings
from app.database import SessionLocal
from app import models
from app.core.federated_server import FedServer

logger = logging.getLogger(__name__)

_redis_client = None


def get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = redis.from_url(
                settings.REDIS_URL,
                socket_timeout=5,
                socket_connect_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30
            )
            logger.info("Redis client initialized successfully")
        except Exception as e:
            logger.warning(f"Redis client initialization failed (will retry later): {e}")
    return _redis_client


def redis_publish(channel: str, data: dict):
    try:
        r = get_redis()
        if r is not None:
            r.publish(channel, json.dumps(data, default=str))
    except redis.ConnectionError as e:
        logger.warning(f"Redis connection lost, skipping publish to {channel}: {e}")
        global _redis_client
        _redis_client = None
    except Exception as e:
        logger.warning(f"Redis publish to {channel} failed: {e}")


@celery_app.task(bind=True, name="run_experiment", max_retries=0, acks_late=True)
def run_experiment_task(self, experiment_id: int, config: dict):
    task_id = self.request.id
    logger.info(f"[{task_id}] Starting experiment #{experiment_id}")

    db = SessionLocal()
    try:
        exp = db.query(models.Experiment).filter(
            models.Experiment.id == experiment_id
        ).first()
        if not exp:
            logger.error(f"[{task_id}] Experiment #{experiment_id} not found")
            return {"status": "error", "message": "Experiment not found"}

        exp.celery_task_id = task_id
        exp.status = "running"
        exp.started_at = datetime.utcnow()
        db.commit()
        db.refresh(exp)
        logger.info(f"[{task_id}] Experiment #{experiment_id} marked as running")
    except Exception as e:
        logger.error(f"[{task_id}] Failed to update experiment status: {e}", exc_info=True)
        db.close()
        return {"status": "error", "message": str(e)}
    finally:
        if db.is_active:
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

    success = False
    error_msg = None
    try:
        logger.info(f"[{task_id}] Creating FedServer for experiment #{experiment_id}")
        server = FedServer(
            experiment_id=experiment_id,
            config=config,
            websocket_callback=ws_callback,
            redis_callback=redis_callback
        )
        logger.info(f"[{task_id}] Running FedServer for experiment #{experiment_id}")
        success = server.run()
        logger.info(f"[{task_id}] FedServer completed for experiment #{experiment_id}, success={success}")
    except Exception as e:
        error_msg = str(e)
        logger.error(f"[{task_id}] Experiment #{experiment_id} failed with exception: {e}", exc_info=True)
        try:
            redis_publish(f"experiment:{experiment_id}:ws", {
                'type': 'experiment_error',
                'experiment_id': experiment_id,
                'error': error_msg,
                'timestamp': datetime.utcnow().isoformat()
            })
        except Exception:
            pass

    db = SessionLocal()
    try:
        exp = db.query(models.Experiment).filter(
            models.Experiment.id == experiment_id
        ).first()
        if exp:
            if success and exp.status in ["running", "pending", "queued"]:
                exp.status = "completed"
            elif not success and exp.status not in ["stopped", "stopping"]:
                exp.status = "error"
                if error_msg:
                    exp.error_message = error_msg[:1000] if len(error_msg) > 1000 else error_msg
            if exp.completed_at is None:
                exp.completed_at = datetime.utcnow()
        db.commit()
        logger.info(f"[{task_id}] Final status of experiment #{experiment_id}: {exp.status if exp else 'N/A'}")
    except Exception as e:
        logger.error(f"[{task_id}] Failed to finalize experiment #{experiment_id} status: {e}", exc_info=True)
    finally:
        if db.is_active:
            db.close()

    return {
        "status": "success" if success else "failed",
        "experiment_id": experiment_id,
        "task_id": task_id
    }


@celery_app.task(name="stop_experiment")
def stop_experiment_task(experiment_id: int):
    logger.info(f"Stopping experiment #{experiment_id}")

    db = SessionLocal()
    try:
        exp = db.query(models.Experiment).filter(
            models.Experiment.id == experiment_id
        ).first()
        if exp and exp.celery_task_id:
            try:
                celery_app.control.revoke(exp.celery_task_id, terminate=True, signal='SIGTERM')
                logger.info(f"Revoked task {exp.celery_task_id} for experiment #{experiment_id}")
            except Exception as e:
                logger.warning(f"Failed to revoke task for experiment #{experiment_id}: {e}")

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
        logger.info(f"Experiment #{experiment_id} stopped successfully")
    except Exception as e:
        logger.error(f"Failed to stop experiment #{experiment_id}: {e}", exc_info=True)
    finally:
        if db.is_active:
            db.close()

    return {"status": "stopped", "experiment_id": experiment_id}
