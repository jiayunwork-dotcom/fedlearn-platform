import json
import asyncio
import logging
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self._redis = None

    async def get_redis(self):
        if self._redis is None:
            try:
                import redis.asyncio as aioredis
                self._redis = aioredis.from_url(
                    settings.REDIS_URL,
                    socket_timeout=5,
                    socket_connect_timeout=5,
                    health_check_interval=30
                )
                logger.info("Async Redis client initialized for WebSocket")
            except ImportError:
                logger.warning("redis.asyncio not available, WebSocket push may be limited")
                self._redis = None
            except Exception as e:
                logger.warning(f"Async Redis initialization failed: {e}")
                self._redis = None
        return self._redis

    async def connect(self, experiment_id: int, websocket: WebSocket):
        await websocket.accept()
        if experiment_id not in self.active_connections:
            self.active_connections[experiment_id] = set()
        self.active_connections[experiment_id].add(websocket)
        logger.info(f"WebSocket client connected for experiment #{experiment_id}")

    def disconnect(self, experiment_id: int, websocket: WebSocket):
        if experiment_id in self.active_connections:
            self.active_connections[experiment_id].discard(websocket)
            if not self.active_connections[experiment_id]:
                del self.active_connections[experiment_id]
        logger.info(f"WebSocket client disconnected for experiment #{experiment_id}")

    async def send_to_experiment(self, experiment_id: int, message: dict):
        if experiment_id in self.active_connections:
            for connection in list(self.active_connections[experiment_id]):
                try:
                    await connection.send_json(message)
                except Exception:
                    self.disconnect(experiment_id, connection)

    async def broadcast(self, message: dict):
        for exp_id in list(self.active_connections.keys()):
            await self.send_to_experiment(exp_id, message)

    async def redis_listener(self):
        try:
            redis_client = await self.get_redis()
            if redis_client is None:
                logger.warning("Redis not available, WebSocket listener disabled")
                return

            pubsub = redis_client.pubsub()
            await pubsub.psubscribe("experiment:*:ws")
            logger.info("WebSocket Redis listener started")

            async for message in pubsub.listen():
                if message.get("type") == "pmessage":
                    try:
                        channel = message["channel"].decode() if isinstance(message.get("channel"), bytes) else str(message.get("channel"))
                        data_raw = message.get("data")
                        if isinstance(data_raw, bytes):
                            data_str = data_raw.decode()
                        else:
                            data_str = str(data_raw)
                        data = json.loads(data_str)
                        parts = channel.split(":")
                        if len(parts) >= 3:
                            exp_id = int(parts[1])
                            await self.send_to_experiment(exp_id, data)
                    except (json.JSONDecodeError, ValueError, KeyError) as e:
                        logger.debug(f"Redis message parse error: {e}")
                    except Exception as e:
                        logger.warning(f"Redis message processing error: {e}")
        except asyncio.CancelledError:
            logger.info("Redis listener cancelled")
        except Exception as e:
            logger.warning(f"Redis listener exited with error: {e}", exc_info=True)


manager = ConnectionManager()


@router.websocket("/experiment/{experiment_id}")
async def websocket_experiment(
    websocket: WebSocket,
    experiment_id: int
):
    await manager.connect(experiment_id, websocket)

    try:
        await websocket.send_json({
            "type": "connected",
            "experiment_id": experiment_id,
            "message": "WebSocket connection established"
        })

        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type", "ping")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": msg.get("timestamp")})
                elif msg_type == "subscribe":
                    exp_ids = msg.get("experiment_ids", [])
                    for eid in exp_ids:
                        if isinstance(eid, int) and eid != experiment_id:
                            await manager.connect(eid, websocket)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning(f"WebSocket error for exp {experiment_id}: {e}")
    finally:
        manager.disconnect(experiment_id, websocket)


async def start_redis_listener():
    try:
        asyncio.create_task(manager.redis_listener())
        logger.info("Redis listener task created")
    except Exception as e:
        logger.warning(f"Failed to start Redis listener task: {e}")
