import json
import asyncio
import logging
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])

LISTENER_RECONNECT_DELAY = 2
LISTENER_MAX_RECONNECT_DELAY = 30


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self._redis = None
        self._listener_running = False
        self._listener_task = None

    async def get_redis(self):
        if self._redis is not None:
            try:
                await self._redis.ping()
                return self._redis
            except Exception:
                logger.warning("Redis ping failed, reconnecting...")
                self._redis = None

        try:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(
                settings.REDIS_URL,
                socket_connect_timeout=10,
                socket_timeout=None,
                decode_responses=False,
            )
            await self._redis.ping()
            logger.info("Async Redis client initialized for WebSocket listener")
            return self._redis
        except ImportError:
            logger.warning("redis.asyncio not available, WebSocket push disabled")
            self._redis = None
            return None
        except Exception as e:
            logger.warning(f"Async Redis initialization failed: {e}")
            self._redis = None
            return None

    async def connect(self, experiment_id: int, websocket: WebSocket):
        await websocket.accept()
        if experiment_id not in self.active_connections:
            self.active_connections[experiment_id] = set()
        self.active_connections[experiment_id].add(websocket)
        logger.info(f"WebSocket client connected for experiment #{experiment_id}, total connections: {sum(len(s) for s in self.active_connections.values())}")

    def disconnect(self, experiment_id: int, websocket: WebSocket):
        if experiment_id in self.active_connections:
            self.active_connections[experiment_id].discard(websocket)
            if not self.active_connections[experiment_id]:
                del self.active_connections[experiment_id]
        logger.info(f"WebSocket client disconnected for experiment #{experiment_id}")

    async def send_to_experiment(self, experiment_id: int, message: dict):
        if experiment_id not in self.active_connections:
            return
        for connection in list(self.active_connections[experiment_id]):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(experiment_id, connection)

    async def broadcast(self, message: dict):
        for exp_id in list(self.active_connections.keys()):
            await self.send_to_experiment(exp_id, message)

    def _parse_channel(self, channel_raw) -> str:
        if isinstance(channel_raw, bytes):
            return channel_raw.decode("utf-8")
        return str(channel_raw)

    def _parse_data(self, data_raw):
        if isinstance(data_raw, bytes):
            return json.loads(data_raw.decode("utf-8"))
        if isinstance(data_raw, str):
            return json.loads(data_raw)
        return data_raw

    async def _handle_message(self, message):
        msg_type = message.get("type", "")
        if msg_type not in ("pmessage", "message"):
            return

        try:
            if msg_type == "pmessage":
                channel = self._parse_channel(message.get("channel", ""))
            else:
                channel = self._parse_channel(message.get("channel", ""))

            data_raw = message.get("data")
            if data_raw is None:
                return

            data = self._parse_data(data_raw)
            if not isinstance(data, dict):
                return

            parts = channel.split(":")
            if len(parts) >= 2:
                try:
                    exp_id = int(parts[1])
                    await self.send_to_experiment(exp_id, data)
                    logger.debug(f"WS forwarded to exp #{exp_id}: type={data.get('type')} from channel={channel}")
                except (ValueError, IndexError):
                    logger.warning(f"Cannot parse experiment id from channel: {channel}")
        except (json.JSONDecodeError, ValueError) as e:
            logger.debug(f"Redis message parse error: {e}")
        except Exception as e:
            logger.warning(f"Redis message handling error: {e}", exc_info=True)

    async def redis_listener(self):
        self._listener_running = True
        reconnect_delay = LISTENER_RECONNECT_DELAY

        while self._listener_running:
            try:
                redis_client = await self.get_redis()
                if redis_client is None:
                    logger.warning(f"Redis not available, retrying in {reconnect_delay}s...")
                    await asyncio.sleep(reconnect_delay)
                    reconnect_delay = min(reconnect_delay * 2, LISTENER_MAX_RECONNECT_DELAY)
                    continue

                pubsub = redis_client.pubsub()
                await pubsub.psubscribe("experiment:*:ws")
                logger.info("WebSocket Redis listener started (subscribed to experiment:*:ws)")

                reconnect_delay = LISTENER_RECONNECT_DELAY

                while self._listener_running:
                    try:
                        message = await asyncio.wait_for(
                            pubsub.get_message(
                                ignore_subscribe_messages=True,
                                timeout=60.0
                            ),
                            timeout=70.0
                        )
                        if message is not None:
                            await self._handle_message(message)
                    except asyncio.TimeoutError:
                        logger.debug("Redis listener timeout, sending keepalive ping...")
                        try:
                            await redis_client.ping()
                        except Exception:
                            logger.warning("Redis ping failed during keepalive, reconnecting...")
                            break
                    except asyncio.CancelledError:
                        logger.info("Redis listener cancelled")
                        try:
                            await pubsub.punsubscribe()
                            await pubsub.aclose()
                        except Exception:
                            pass
                        return
                    except Exception as e:
                        logger.warning(f"Redis listener message loop error: {e}")
                        await asyncio.sleep(1)

                try:
                    await pubsub.punsubscribe()
                    await pubsub.aclose()
                except Exception:
                    pass

            except asyncio.CancelledError:
                logger.info("Redis listener task cancelled")
                self._listener_running = False
                return
            except Exception as e:
                logger.warning(f"Redis listener outer error: {e}, reconnecting in {reconnect_delay}s...")
                self._redis = None

            if self._listener_running:
                await asyncio.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, LISTENER_MAX_RECONNECT_DELAY)

        logger.info("Redis listener stopped")

    async def stop_listener(self):
        self._listener_running = False
        if self._listener_task is not None:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None


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
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=120)
            except asyncio.TimeoutError:
                continue

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
        logger.debug(f"WebSocket closed for exp {experiment_id}: {e}")
    finally:
        manager.disconnect(experiment_id, websocket)


async def start_redis_listener():
    try:
        manager._listener_task = asyncio.create_task(manager.redis_listener())
        logger.info("Redis listener background task created")
    except Exception as e:
        logger.warning(f"Failed to start Redis listener task: {e}")
