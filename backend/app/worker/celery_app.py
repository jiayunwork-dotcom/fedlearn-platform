import os
import json
import logging
from datetime import datetime

from celery import Celery
from celery.signals import after_setup_logger

from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "fedlearn_tasks",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.worker.tasks"]
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
    task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=30,
    task_default_queue="celery",
    task_routes={
        "run_experiment": {"queue": "celery"},
        "stop_experiment": {"queue": "celery"},
    },
    broker_transport_options={
        "visibility_timeout": 3600,
        "max_retries": 30,
        "interval_start": 0,
        "interval_step": 0.5,
        "interval_max": 5,
    },
    result_backend_transport_options={
        "visibility_timeout": 3600,
    },
)


@after_setup_logger.connect
def setup_loggers(logger, *args, **kwargs):
    import sys
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        '[%(asctime)s: %(levelname)s/%(processName)s] %(message)s'
    ))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


import app.worker.tasks

try:
    registered = celery_app.tasks
    task_names = [
        name for name in registered.keys()
        if not name.startswith("celery.")
    ]
    logger.info("=" * 60)
    logger.info(f"Celery Worker Task Registry ({len(task_names)} tasks):")
    for t in sorted(task_names):
        logger.info(f"  - {t}")
    logger.info("=" * 60)
except Exception as e:
    logger.warning(f"Could not list tasks at import time: {e}")


__all__ = ['celery_app']
