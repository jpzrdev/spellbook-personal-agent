"""Web Push notifications for the installed HUD (phone/PC), with no third-party service besides
the browser's own push (Apple/Google/Mozilla).

The VAPID keys are generated on first use and live in `bridge/data/push/` (outside the vault and git),
together with the device subscriptions. The notification body never carries sensitive content
(e.g. the email summary): only a short title; the rest stays in the HUD.
"""

import base64
import json
import logging
import threading
from dataclasses import dataclass
from pathlib import Path

from app import clock
from app.config import get_settings

log = logging.getLogger("gandalf.push")
_lock = threading.Lock()


def _folder() -> Path:
    folder = get_settings().data_path / "push"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _key_file() -> Path:
    return _folder() / "vapid_private.pem"


def _subscriptions_file() -> Path:
    return _folder() / "subscriptions.json"


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _vapid():
    from py_vapid import Vapid02

    with _lock:
        path = _key_file()
        if not path.is_file():
            v = Vapid02()
            v.generate_keys()
            v.save_key(str(path))
            log.info("VAPID keys created at %s", path)
        return Vapid02.from_file(str(path))


def public_key() -> str:
    """applicationServerKey for the browser's `pushManager.subscribe` (base64url, uncompressed point)."""
    from cryptography.hazmat.primitives import serialization

    pub = _vapid().public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64url(pub)


# ---------- subscriptions ----------

def _read() -> list[dict]:
    try:
        return json.loads(_subscriptions_file().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def _write(items: list[dict]) -> None:
    _subscriptions_file().write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")


def subscribe(subscription: dict, device: str) -> dict:
    """Stores (or updates) a device subscription. The key is the endpoint."""
    endpoint = subscription.get("endpoint")
    if not endpoint or not (subscription.get("keys") or {}).get("p256dh"):
        raise ValueError("subscription without endpoint/keys")
    item = {"endpoint": endpoint, "keys": subscription["keys"], "device": device[:80],
            "since": clock.now().isoformat(timespec="seconds")}
    with _lock:
        items = [i for i in _read() if i["endpoint"] != endpoint] + [item]
        _write(items)
    return {"device": item["device"], "since": item["since"]}


def unsubscribe(endpoint: str) -> bool:
    with _lock:
        items = _read()
        remaining = [i for i in items if i["endpoint"] != endpoint]
        _write(remaining)
    return len(remaining) != len(items)


def subscriptions() -> list[dict]:
    return [{"device": i.get("device", ""), "since": i.get("since"), "endpoint": i["endpoint"]} for i in _read()]


def is_subscribed(endpoint: str) -> bool:
    return any(i["endpoint"] == endpoint for i in _read())


# ---------- sending ----------

@dataclass
class Notification:
    title: str
    body: str = ""
    url: str = "/"
    tag: str | None = None  # the same tag replaces the previous notification
    reminder_id: str | None = None  # enables "Snooze" on the notification


def _contact() -> str:
    return get_settings().push_contact


def send(n: Notification) -> int:
    """Sends to every subscribed device. Returns how many accepted. Never raises."""
    items = _read()
    if not items:
        return 0
    try:
        from pywebpush import WebPushException, webpush

        vapid = _vapid()
    except Exception:
        log.exception("push unavailable")
        return 0
    data = json.dumps(
        {"title": n.title, "body": n.body, "url": n.url, "tag": n.tag, "reminder_id": n.reminder_id},
        ensure_ascii=False,
    )
    ok, dead = 0, []
    for i in items:
        try:
            webpush(
                {"endpoint": i["endpoint"], "keys": i["keys"]},
                data=data,
                vapid_private_key=vapid,
                vapid_claims={"sub": _contact()},
                ttl=6 * 3600,
                headers={"Urgency": "high"},
                timeout=15,
            )
            ok += 1
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):  # device uninstalled/unsubscribed
                dead.append(i["endpoint"])
            log.warning("push rejected (%s) for %s", status, i.get("device"))
        except Exception:
            log.exception("failed to send push to %s", i.get("device"))
    for endpoint in dead:
        unsubscribe(endpoint)
    return ok


def send_in_background(n: Notification) -> None:
    threading.Thread(target=send, args=(n,), name="push", daemon=True).start()
