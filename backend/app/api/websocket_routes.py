import json
import asyncio
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
import redis.asyncio as aioredis

from app.config import settings

router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self._redis = None

    async def get_redis(self):
        if self._redis is None:
            self._redis = aioredis.from_url(settings.REDIS_URL)
        return self._redis

    async def connect(self, experiment_id: int, websocket: WebSocket):
        await websocket.accept()
        if experiment_id not in self.active_connections:
            self.active_connections[experiment_id] = set()
        self.active_connections[experiment_id].add(websocket)

    def disconnect(self, experiment_id: int, websocket: WebSocket):
        if experiment_id in self.active_connections:
            self.active_connections[experiment_id].discard(websocket)
            if not self.active_connections[experiment_id]:
                del self.active_connections[experiment_id]

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
            pubsub = redis_client.pubsub()
            await pubsub.psubscribe("experiment:*:ws")

            async for message in pubsub.listen():
                if message["type"] == "pmessage":
                    channel = message["channel"].decode()
                    try:
                        data = json.loads(message["data"].decode())
                        parts = channel.split(":")
                        if len(parts) >= 3:
                            exp_id = int(parts[1])
                            await self.send_to_experiment(exp_id, data)
                    except (json.JSONDecodeError, ValueError):
                        pass
        except Exception as e:
            print(f"Redis listener error: {e}", flush=True)


manager = ConnectionManager()


@router.websocket("/experiment/{experiment_id}")
async def websocket_experiment(
    websocket: WebSocket,
    experiment_id: int
):
    await manager.connect(experiment_id, websocket)

    await websocket.send_json({
        "type": "connected",
        "experiment_id": experiment_id,
        "message": "WebSocket connection established"
    })

    try:
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
                        if isinstance(eid, int):
                            await manager.connect(eid, websocket)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(experiment_id, websocket)
    except Exception as e:
        print(f"WebSocket error for exp {experiment_id}: {e}", flush=True)
        manager.disconnect(experiment_id, websocket)


async def start_redis_listener():
    asyncio.create_task(manager.redis_listener())
