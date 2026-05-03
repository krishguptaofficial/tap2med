FROM python:3.11-slim

# Install system dependencies for PostgreSQL
RUN apt-get update && apt-get install -y libpq-dev gcc && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependencies first for faster rebuilding
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all your folders (app, static, qr, etc.)
COPY . .

# Launch using the structure you defined
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]