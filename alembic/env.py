import os
import sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context #type:ignore
from dotenv import load_dotenv


sys.path.append(os.getcwd())

load_dotenv()

from app.db.database import Base 
from app.db.models import Clinic, Event, Prescription, CrossClinicConsent           

_ = [Clinic, Event, Prescription, CrossClinicConsent]


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)



target_metadata = Base.metadata

def run_migrations_offline() -> None:
    url = os.getenv("DATABASE_URL")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    
    db_url = os.getenv("DATABASE_URL")
    
   
    configuration = config.get_section(config.config_ini_section, {})
    
    connectable = engine_from_config(
        configuration,
        url=db_url,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()