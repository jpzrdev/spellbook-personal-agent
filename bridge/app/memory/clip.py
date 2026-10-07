"""Web clipper: downloads a page, keeps the main text as Markdown and saves it in raw/ (no AI).

The source of the wiki: compile-raw later turns the clip into notes. Only public http(s) addresses: the Bridge
won't fetch localhost or private network addresses (it runs on the user's machine).
"""

import ipaddress
import socket
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

import trafilatura

from app.memory.writer import slugify, write_atomic

MAX_BYTES = 5 * 1024 * 1024
TIMEOUT_S = 20
USER_AGENT = "Mozilla/5.0 (compatible; GandalfClipper/1.0)"


class ClipError(Exception):
    pass


def _check_public(url: str) -> None:
    parts = urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ClipError("only http(s) addresses")
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80))
    except socket.gaierror as e:
        raise ClipError(f"address not found: {parts.hostname}") from e
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise ClipError("local or private network addresses are not allowed")


class _CheckedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _check_public(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url: str) -> tuple[str, str]:
    """(final url, html)."""
    _check_public(url)
    opener = urllib.request.build_opener(_CheckedRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.5"})
    try:
        with opener.open(req, timeout=TIMEOUT_S) as resp:
            kind = resp.headers.get_content_type()
            if kind not in ("text/html", "application/xhtml+xml", "text/plain"):
                raise ClipError(f"not a web page ({kind})")
            data = resp.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise ClipError("page larger than 5 MB")
            charset = resp.headers.get_content_charset() or "utf-8"
            return resp.geturl(), data.decode(charset, errors="replace")
    except urllib.error.HTTPError as e:
        raise ClipError(f"the site answered {e.code}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ClipError(f"could not open the page: {getattr(e, 'reason', e)}") from e


def to_markdown(html: str, url: str) -> tuple[str, str]:
    """(title, markdown of the main content)."""
    text = trafilatura.extract(html, url=url, output_format="markdown", include_links=True, include_tables=True,
                               favor_recall=True)
    if not text or not text.strip():
        raise ClipError("no readable text on the page")
    meta = trafilatura.extract_metadata(html, default_url=url)
    title = (meta.title if meta and meta.title else urlparse(url).hostname or "page").strip()
    return title, text.strip()


def _yaml(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def clip(memory: Path, url: str, now: datetime, note: str = "") -> Path:
    final_url, html = fetch(url.strip())
    title, body = to_markdown(html, final_url)
    folder = memory / "raw"
    base = f"{now:%Y-%m-%d-%H%M%S}-{slugify(title)}"
    path = folder / f"{base}.md"
    n = 2
    while path.exists():
        path = folder / f"{base}-{n}.md"
        n += 1
    comment = f"> {note.strip()}\n\n" if note.strip() else ""
    content = (
        "---\n"
        "type: clip\n"
        f"title: {_yaml(title)}\n"
        f"url: {_yaml(final_url)}\n"
        f"created: {now.isoformat(timespec='seconds')}\n"
        "source: hud\n"
        "---\n"
        f"# {title}\n\n{comment}{body}\n"
    )
    write_atomic(path, content)
    return path
