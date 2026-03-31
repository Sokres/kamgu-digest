import logging

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from digest.config import settings
from app.api.router import api_router

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))


def create_app() -> FastAPI:
    app = FastAPI(
        title="Research digest agent",
        description=(
            "Рецензируемый корпус: OpenAlex (фильтры type/article, годы, concept, source), "
            "опционально Semantic Scholar; отдельно веб-обзор по сниппетам (Tavily). "
            "Двуязычный дайджест через LLM."
        ),
    )
    _origins = settings.cors_origins_list()
    if _origins:
        _cred = _origins != ["*"]
        app.add_middleware(
            CORSMiddleware,
            allow_origins=_origins,
            allow_credentials=_cred,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    app.include_router(api_router)
    return app


app = create_app()
