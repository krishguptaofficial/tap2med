import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from sqlalchemy import text
from app.api import events, clinics, auth
from app.db.database import engine
from app.db import models



app = FastAPI(title="Tap2Med OPD")

# Enable CORS for local development and simple deployments. Restrict in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/assets",
    StaticFiles(directory="frontend/assets"),
    name="assets"
)

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
app.include_router(auth.router, prefix="/api/auth")


app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/dashboard")
def serve_doctor_dashboard(): 
    logger.info("Dashboard Opened")   
    return FileResponse("frontend/clinic/dashboard.html")

@app.get("/settings")
def serve_settings():
    logger.info("Settings Opened")
    return FileResponse("frontend/clinic/settings.html")

@app.get("/staff-login")
def serve_staff_login():
    logger.info("Staff Login Opened")
    return FileResponse("frontend/clinic/staff_login.html")

@app.get("/staff-dashboard")
def serve_staff_dashboard():
    logger.info("Staff Dashboard Opened")
    return FileResponse("frontend/clinic/staff_dashboard.html")

@app.get("/pharmacy")
def serve_pharmacy_dashboard():
    logger.info("Pharmacy Dashboard Opened")
    return FileResponse("frontend/clinic/pharmacy.html")

@app.get("/directory")
def serve_directory():
    logger.info("Directory Opened")
    return FileResponse("frontend/clinic/directory.html")

@app.get("/scan")
def serve_patient_scan():
    logger.info("Scan Page Opened")
    return FileResponse("frontend/patient/scan.html")


@app.get("/login")
def serve_login():
    logger.info("Clinic login opened")
    return FileResponse("frontend/clinic/login.html")

@app.get("/register")
def serve_register():
    logger.info("Clinic register opened")
    return FileResponse("frontend/clinic/register.html")

app.mount("/", StaticFiles(directory="frontend/website", html=True), name="website")

@app.get("/health")
def health(): 
    logger.info("Health check endpoint accessed") 
    return {
        "status": "ok"
    }   
