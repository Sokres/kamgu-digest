import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from digest.config import settings
from app.api.router import api_router
from app.middleware.request_id import RequestIdFilter, RequestIdMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    if not (settings.openalex_mailto or "").strip() and not (settings.http_user_agent or "").strip():
        logger.warning(
            "Рекомендуется OPENALEX_MAILTO или HTTP_USER_AGENT в .env (вежливый пул OpenAlex и меньше 403 у источников)."
        )
    yield


def _configure_logging() -> None:
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s")
    )
    handler.addFilter(RequestIdFilter())
    root.addHandler(handler)
    root.setLevel(level)


_configure_logging()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Research digest agent",
        lifespan=_lifespan,
        description=(
            "Рецензируемый корпус: OpenAlex (фильтры type/article, годы, concept, source), "
            "опционально Semantic Scholar; отдельно веб-обзор по сниппетам (Tavily). "
            "Двуязычный дайджест через LLM. "
            "Периодический режим со снимками: POST /digests/periodic (алиас /digests/monthly)."
        ),
    )
    app.add_middleware(RequestIdMiddleware)
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
