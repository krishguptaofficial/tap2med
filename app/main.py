import logging
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from sqlalchemy import text
from app.api import events, clinics
from app.db.database import engine
from app.db import models



app = FastAPI(title="Tap2Med OPD")

@app.on_event("startup")
def startup_check():

    logger.info("Running startup checks...")

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        logger.info("Database connection successful.")

    except Exception as e:
        logger.error(f"Database connection failed: {e}")

        raise

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
)

logger = logging.getLogger(__name__)


app.include_router(events.router, prefix="/api/events")
app.include_router(clinics.router, prefix="/api/clinics")


app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/dashboard")
def serve_doctor_dashboard():
    logger.info("Dashboard Opened")
    return FileResponse("frontend/clinic/dashboard.html")

@app.get("/scan")
def serve_patient_scan():
    logger.info("Scan Page Opened")
    return FileResponse("frontend/patient/scan.html")

@app.get("/")
def read_root():
    logger.info("Root Endpoint Accessed")
    return {
        "status": "online",
        "project": "Tap2Med V0 Gateway",
        "message": "Visit /dashboard or /scan to access the UI."
    }

@app.get("/health")
def health():
    logger.info("Health check endpoint accessed")

    return {
        "status": "ok"
    }