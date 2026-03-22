# Dockerfile
FROM python:3.11-slim

# Set working directory inside container
WORKDIR /app

# Copy requirements (if any)
COPY requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY ./app ./app
COPY ./storage ./storage

ENV PYTHONPATH=/app

# Expose port
EXPOSE 8000

# Default command to run
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]