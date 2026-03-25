# Use official Python base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements (we'll assume you have requirements.txt)
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the app
COPY . .

# Module discovery
ENV PYTHONPATH=/app

# Expose FastAPI default port
EXPOSE 8000

# Set entry point
CMD ["python", "app/main.py"]