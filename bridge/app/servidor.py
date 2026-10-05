"""Aplicação servida pelo uvicorn: a API em /api e o HUD compilado (hud/dist) na raiz.

Uma origem só facilita o acesso pelo celular (Tailscale + HTTPS): o navegador fala com o
mesmo endereço para a página, a API e os WebSockets. No desenvolvimento, o Vite (porta 5173)
continua servindo o HUD e repassa /api para cá.
"""

import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import REPO_ROOT
from app.main import app as api
from app.main import lifespan as lifespan_api

DIST = REPO_ROOT / "hud" / "dist"


class _SemToken(logging.Filter):
    """Tira o token das URLs nos logs de acesso (WebSockets mandam ?token=...)."""

    _re = re.compile(r"(token=)[^&\s\"']+")

    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            record.args = tuple(self._re.sub(r"\1***", a) if isinstance(a, str) else a for a in record.args)
        if isinstance(record.msg, str):
            record.msg = self._re.sub(r"\1***", record.msg)
        return True


def proteger_logs() -> None:
    for nome in ("uvicorn.access", "uvicorn.error"):
        logging.getLogger(nome).addFilter(_SemToken())


class _HudSpa(StaticFiles):
    """Arquivos do build; rotas do React Router (/rotinas, /chat…) caem no index.html."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as e:
            if e.status_code != 404 or path.startswith("api/"):
                raise
            return await super().get_response("index.html", scope)


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # Sub-aplicações montadas não recebem o lifespan: repassamos o da API (agendador, voz).
    proteger_logs()
    async with lifespan_api(api):
        yield


def criar(dist: Path = DIST) -> FastAPI:
    raiz = FastAPI(title="Gandalf", docs_url=None, redoc_url=None, openapi_url=None, lifespan=_lifespan)
    raiz.mount("/api", api)
    if (dist / "index.html").is_file():
        raiz.mount("/", _HudSpa(directory=dist, html=True), name="hud")
    else:

        @raiz.get("/", response_class=HTMLResponse)
        def sem_build() -> str:
            return (
                "<h1>Gandalf</h1><p>O HUD ainda não foi compilado. Rode <code>cd hud &amp;&amp; npm run build</code> "
                "ou use o modo de desenvolvimento (porta 5173).</p>"
            )

    return raiz


aplicacao = criar()
