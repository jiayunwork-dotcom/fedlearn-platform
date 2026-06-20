from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import init_db
from app.api.routes import router as experiments_router
from app.api.websocket_routes import router as ws_router, start_redis_listener


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await start_redis_listener()
    yield


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

app.include_router(experiments_router)
app.include_router(ws_router)


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
