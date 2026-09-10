from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase 
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("ERROR: DATABASE_URL not found in .env file!")


engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True     
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)



class Base(DeclarativeBase):
    """
    Every model (Clinic, Event) will inherit from this.
    Pylance now sees this as a real class.
    """
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() 


