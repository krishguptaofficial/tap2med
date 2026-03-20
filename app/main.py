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