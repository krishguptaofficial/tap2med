FROM python:3.11-slim

RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

WORKDIR /app


COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


COPY ./app ./app
COPY ./frontend ./frontend
COPY ./static ./static
COPY ./alembic ./alembic
COPY ./alembic.ini ./alembic.ini


CMD alembic stamp head && uvicorn app.main:app --host 0.0.0.0 --port 10000