import time
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError

from app.config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=30,
    pool_recycle=3600,
    connect_args={"connect_timeout": 10} if "postgresql" in settings.DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _wait_for_db(max_retries: int = 30, retry_interval: int = 2):
    """Wait for database to be available with retry"""
    for attempt in range(1, max_retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info(f"Database connection established on attempt {attempt}")
            return True
        except OperationalError as e:
            if attempt == max_retries:
                logger.error(f"Failed to connect to database after {max_retries} attempts: {e}")
                raise
            logger.warning(f"Database not ready (attempt {attempt}/{max_retries}): {e}. Retrying in {retry_interval}s...")
            time.sleep(retry_interval)
    return False


def init_db():
    from app import models

    _wait_for_db()

    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully")

        with SessionLocal() as db:
            try:
                result = db.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name='experiments' AND column_name='last_checkpoint_round'"
                ))
                if result.fetchone() is None:
                    db.execute(text(
                        "ALTER TABLE experiments ADD COLUMN last_checkpoint_round INTEGER DEFAULT 0"
                    ))
                    db.commit()
                    logger.info("Added last_checkpoint_round column to experiments table")
            except Exception as e:
                logger.warning(f"Migration check for last_checkpoint_round: {e}")
                db.rollback()

            try:
                exp_count = db.query(models.Experiment).count()
                logger.info(f"Database check: {exp_count} experiments found")
            except Exception as e:
                logger.warning(f"Could not verify tables (may be first run): {e}")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}", exc_info=True)
        raise
