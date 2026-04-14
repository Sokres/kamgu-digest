from fastapi import APIRouter

from app.api.routes import auth, digest_schedules, digests, documents, health, trends

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(digest_schedules.router)
api_router.include_router(digests.router)
api_router.include_router(documents.router)
api_router.include_router(trends.router)
