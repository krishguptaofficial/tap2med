import sys 
import os
from alembic import context      #type: ignore
from sqlalchemy import engine_from_config, pool
from logging.config import fileConfig

from app.db.database import Base
import app.db.models

sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), '..')))

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata




