from app.db.database import engine, Base
from app.db import models                               # This 'registers' the tables with Base

def setup_database():
    print("--- Tap2Med ---")
    try:
        print(f"Connecting to: {engine.url.database}...")
        Base.metadata.create_all(bind=engine)
        print(" SUCCESS: Tables 'clinics', 'events', and 'prescriptions' created.")
        print(" You can now see them in pgAdmin 4.")
    except Exception as e:
        print(f" ERROR: Could not connect to PostgreSQL. {e}")
        print("Check if your .env DATABASE_URL is correct and Postgres is running.")

if __name__ == "__main__":
    setup_database()