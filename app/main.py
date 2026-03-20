from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import database, models, crud
import uuid

app = FastAPI(title= "Tap2Med V0")

def get_db():
   # Real-World Failure: If we don't 'yield', the API gets nothing

   db = database.SessionLocal()

   try:
      yield db

   finally:
      db.close()


@app.get("/")
def read_root():
   return {
      "status": "online",
      "project": "Tap2Med",
      "version": "0.1.0"
   }

@app.post("/clinics/")
def onboard_clinic(
   doctor_name : str,
   clinic_name: str,
   db : Session= Depends(get_db)
):
 try:
        new_clinic = crud.create_clinic(db=db, doctor_name=doctor_name, clinic_name=clinic_name)
        return {
            "status": "success",
            "clinic_id": new_clinic.clinic_id,
            "doctor": new_clinic.doctor_name
        }
 except Exception as e:
        
        raise HTTPException(status_code=500, detail=str(e))