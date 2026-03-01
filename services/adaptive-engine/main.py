"""Adaptive engine placeholder. Sprint 3 builds the full BKT service."""

from fastapi import FastAPI

app = FastAPI(title="The Primer - Adaptive Engine", version="0.1.0")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "adaptive-engine"}
