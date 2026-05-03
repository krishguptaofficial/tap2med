# tap2med/app/main.py

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api import events, clinics
from app.db.database import engine
from app.db import models



app = FastAPI(title="Tap2Med OPD")


app.include_router(events.router, prefix="/api/events")
app.include_router(clinics.router, prefix="/api/clinics")


app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/dashboard")
def serve_doctor_dashboard():
    return FileResponse("frontend/clinic/dashboard.html")

@app.get("/scan")
def serve_patient_scan():
    return FileResponse("frontend/patient/scan.html")

@app.get("/")
def read_root():
    return {
        "status": "online",
        "project": "Tap2Med V0 Gateway",
        "message": "Visit /dashboard or /scan to access the UI."
    }