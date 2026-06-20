import logging
import sys
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.config import settings
from app.database import init_db
from app.api.routes import router as experiments_router
from app.api.websocket_routes import router as ws_router, start_redis_listener
from app.api.report_routes import router as reports_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting FedLearn Platform...")
    try:
        init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization FAILED: {e}", exc_info=True)

    try:
        await start_redis_listener()
    except Exception as e:
        logger.warning(f"Redis listener failed to start (non-critical): {e}")

    logger.info("FedLearn Platform startup complete")
    yield
    logger.info("FedLearn Platform shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    description="联邦学习安全聚合与模型训练实验平台 API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Internal server error: {str(exc)}",
            "type": type(exc).__name__
        }
    )


app.include_router(experiments_router)
app.include_router(ws_router)
app.include_router(reports_router)


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/api/health")
async def api_health_check():
    import importlib
    celery_ok = True
    celery_tasks = []
    try:
        from app.worker.celery_app import celery_app
        registered = celery_app.tasks
        celery_tasks = [
            name for name in registered.keys()
            if not name.startswith("celery.")
        ]
    except Exception as e:
        celery_ok = False
        celery_tasks = [f"error: {str(e)}"]

    db_ok = True
    try:
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            from sqlalchemy import text
            db.execute(text("SELECT 1"))
        finally:
            db.close()
    except Exception as e:
        db_ok = False

    return {
        "status": "healthy" if (db_ok and celery_ok) else "degraded",
        "database": "ok" if db_ok else "FAILED",
        "celery": "ok" if celery_ok else "FAILED",
        "registered_tasks": celery_tasks,
        "debug": settings.DEBUG
    }
