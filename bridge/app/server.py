"""The application served by uvicorn: the API at /api and the built HUD (hud/dist) at the root.

A single origin makes access from the phone easier (Tailscale + HTTPS): the browser talks to the
same address for the page, the API and the WebSockets. In development, Vite (port 5173)
keeps serving the HUD and proxies /api here.
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
from app.main import lifespan as api_lifespan

DIST = REPO_ROOT / "hud" / "dist"


class _NoToken(logging.Filter):
    """Removes the token from URLs in the access logs (WebSockets send ?token=...)."""

    _re = re.compile(r"(token=)[^&\s\"']+")

    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            record.args = tuple(self._re.sub(r"\1***", a) if isinstance(a, str) else a for a in record.args)
        if isinstance(record.msg, str):
            record.msg = self._re.sub(r"\1***", record.msg)
        return True


def protect_logs() -> None:
    for name in ("uvicorn.access", "uvicorn.error"):
        logging.getLogger(name).addFilter(_NoToken())


class _HudSpa(StaticFiles):
    """Build files; React Router routes (/routines, /chat…) fall back to index.html."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as e:
            if e.status_code != 404 or path.startswith("api/"):
                raise
            return await super().get_response("index.html", scope)


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    # Mounted sub-applications don't get the lifespan: we pass on the API's (scheduler, voice).
    protect_logs()
    async with api_lifespan(api):
        yield


def create(dist: Path = DIST) -> FastAPI:
    root = FastAPI(title="Gandalf", docs_url=None, redoc_url=None, openapi_url=None, lifespan=_lifespan)
    root.mount("/api", api)
    if (dist / "index.html").is_file():
        root.mount("/", _HudSpa(directory=dist, html=True), name="hud")
    else:

        @root.get("/", response_class=HTMLResponse)
        def no_build() -> str:
            return (
                "<h1>Gandalf</h1><p>The HUD hasn't been built yet. Run <code>cd hud &amp;&amp; npm run build</code> "
                "or use development mode (port 5173).</p>"
            )

    return root


application = create()
