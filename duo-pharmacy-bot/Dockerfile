# George bot backend — deploy to AWS EC2 / Lightsail (or any Docker host).
FROM python:3.12-slim

WORKDIR /srv/george

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY config ./config

# Non-root user
RUN useradd --create-home george
USER george

EXPOSE 8000
# Single worker ON PURPOSE: rate-limit + budget counters are in-memory (v1).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
