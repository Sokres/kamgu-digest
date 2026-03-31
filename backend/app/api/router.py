from fastapi import APIRouter

from app.api.routes import digests, health, trends

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(digests.router)
api_router.include_router(trends.router)
