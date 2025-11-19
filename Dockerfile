# Use Python base image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Copy backend first
COPY backend/ /app/backend/

# Install backend dependencies
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Expose the port Railway will use
ENV PORT=5000
EXPOSE 5000

# Start the server
CMD ["gunicorn", "backend.app:app", "--bind", "0.0.0.0:5000"]
