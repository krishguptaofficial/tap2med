import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from sqlalchemy import text
from app.api import events, clinics, auth, consent, pharmacy
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
            try:
                models.Base.metadata.create_all(bind=conn)
            except Exception as table_err:
                logger.warning(f"Metadata create_all check note: {table_err}")
            try:
                if conn.dialect.name == "postgresql":
                    conn.execute(text("ALTER TABLE clinics ADD COLUMN IF NOT EXISTS hfr_id TEXT;"))
                    conn.execute(text("ALTER TABLE clinics ADD COLUMN IF NOT EXISTS uhi_node_uri TEXT;"))
                    conn.commit()
                else:
                    from sqlalchemy import inspect
                    inspector = inspect(conn)
                    if "clinics" in inspector.get_table_names():
                        cols = {c["name"] for c in inspector.get_columns("clinics")}
                        if "hfr_id" not in cols:
                            conn.execute(text("ALTER TABLE clinics ADD COLUMN hfr_id TEXT;"))
                        if "uhi_node_uri" not in cols:
                            conn.execute(text("ALTER TABLE clinics ADD COLUMN uhi_node_uri TEXT;"))
                        conn.commit()
            except Exception as mig_err:
                logger.warning(f"Startup schema check note: {mig_err}")

        logger.info("Database connection and schema checks successful.")

    except Exception as e:
        logger.error(f"Database connection failed: {e}")

        raise

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s"
)

logger = logging.getLogger(__name__)


app.include_router(events.router, prefix="/api/events") 
app.include_router(events.lab_router, prefix="/api")
app.include_router(events.patient_router, prefix="/api")
app.include_router(clinics.router, prefix="/api/clinics")
app.include_router(auth.router, prefix="/api/auth")
app.include_router(consent.router, prefix="/api/consent")
app.include_router(consent.health_router, prefix="/api")
app.include_router(pharmacy.router, prefix="/api/pharmacy")


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

@app.get("/staff-directory")
def serve_staff_directory():
    logger.info("Staff Directory Opened")
    return FileResponse("frontend/clinic/directory.html")

@app.get("/architecture")
def serve_architecture():
    logger.info("Architecture Page Opened")
    return FileResponse("frontend/clinic/architecture.html")

@app.get("/scan")
def serve_patient_scan():
    logger.info("Scan Page Opened")
    return FileResponse("frontend/patient/scan.html")


@app.get("/lab")
def serve_lab_portal():
    logger.info("Lab Portal Opened")
    return FileResponse("frontend/website/lab.html")

@app.get("/login")
def serve_login():
    logger.info("Clinic login opened")
    return FileResponse("frontend/clinic/login.html")

@app.get("/register")
def serve_register():
    logger.info("Clinic register opened")
    return FileResponse("frontend/clinic/register.html")

@app.get("/insurer")
def serve_insurer_portal():
    logger.info("Insurer Underwriting Portal Opened")
    return FileResponse("frontend/website/insurer.html")

@app.get("/pharmacy-portal")
def serve_pharmacy_portal():
    logger.info("Pharmacy Portal Opened")
    return FileResponse("frontend/clinic/pharmacy_portal.html")

@app.get("/pharmacy-login")
def serve_pharmacy_login():
    logger.info("Pharmacy Login Opened")
    return FileResponse("frontend/clinic/pharmacy_portal.html")

@app.get("/passport")
def serve_patient_passport():
    logger.info("Patient Health Passport Opened")
    return FileResponse("frontend/patient/passport.html")

@app.get("/health")
def health(): 
    logger.info("Health check endpoint accessed") 
    return {
        "status": "ok"
    }

app.mount("/", StaticFiles(directory="frontend/website", html=True), name="website")
