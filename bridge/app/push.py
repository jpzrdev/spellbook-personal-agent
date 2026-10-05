"""Notificações Web Push para o HUD instalado (celular/PC), sem serviço de terceiros além do
push do próprio navegador (Apple/Google/Mozilla).

As chaves VAPID são geradas no primeiro uso e ficam em `bridge/dados/push/` (fora do vault e do git),
junto com as inscrições dos aparelhos. O corpo da notificação nunca leva conteúdo sensível
(ex.: o resumo dos e-mails): só um título curto; o resto fica no HUD.
"""

import base64
import json
import logging
import threading
from dataclasses import dataclass
from pathlib import Path

from app import clock
from app.config import get_settings

log = logging.getLogger("lifeos.push")
_lock = threading.Lock()


def _pasta() -> Path:
    pasta = get_settings().dados_path / "push"
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta


def _arquivo_chave() -> Path:
    return _pasta() / "vapid_privada.pem"


def _arquivo_inscricoes() -> Path:
    return _pasta() / "inscricoes.json"


def _b64url(dados: bytes) -> str:
    return base64.urlsafe_b64encode(dados).decode().rstrip("=")


def _vapid():
    from py_vapid import Vapid02

    with _lock:
        arquivo = _arquivo_chave()
        if not arquivo.is_file():
            v = Vapid02()
            v.generate_keys()
            v.save_key(str(arquivo))
            log.info("chaves VAPID criadas em %s", arquivo)
        return Vapid02.from_file(str(arquivo))


def chave_publica() -> str:
    """applicationServerKey para o `pushManager.subscribe` do navegador (base64url, ponto não comprimido)."""
    from cryptography.hazmat.primitives import serialization

    pub = _vapid().public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return _b64url(pub)


# ---------- inscrições ----------

def _ler() -> list[dict]:
    try:
        return json.loads(_arquivo_inscricoes().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def _gravar(itens: list[dict]) -> None:
    _arquivo_inscricoes().write_text(json.dumps(itens, ensure_ascii=False, indent=1), encoding="utf-8")


def inscrever(inscricao: dict, aparelho: str) -> dict:
    """Guarda (ou atualiza) a inscrição de um aparelho. A chave é o endpoint."""
    endpoint = inscricao.get("endpoint")
    if not endpoint or not (inscricao.get("keys") or {}).get("p256dh"):
        raise ValueError("inscrição sem endpoint/chaves")
    item = {"endpoint": endpoint, "keys": inscricao["keys"], "aparelho": aparelho[:80],
            "desde": clock.now().isoformat(timespec="seconds")}
    with _lock:
        itens = [i for i in _ler() if i["endpoint"] != endpoint] + [item]
        _gravar(itens)
    return {"aparelho": item["aparelho"], "desde": item["desde"]}


def cancelar(endpoint: str) -> bool:
    with _lock:
        itens = _ler()
        restantes = [i for i in itens if i["endpoint"] != endpoint]
        _gravar(restantes)
    return len(restantes) != len(itens)


def inscricoes() -> list[dict]:
    return [{"aparelho": i.get("aparelho", ""), "desde": i.get("desde"), "endpoint": i["endpoint"]} for i in _ler()]


def inscrito(endpoint: str) -> bool:
    return any(i["endpoint"] == endpoint for i in _ler())


# ---------- envio ----------

@dataclass
class Notificacao:
    titulo: str
    corpo: str = ""
    url: str = "/"
    tag: str | None = None  # mesma tag substitui a notificação anterior
    lembrete_id: str | None = None  # habilita "Adiar" na notificação


def _contato() -> str:
    return get_settings().push_contato


def enviar(n: Notificacao) -> int:
    """Envia para todos os aparelhos inscritos. Devolve quantos aceitaram. Nunca levanta exceção."""
    itens = _ler()
    if not itens:
        return 0
    try:
        from pywebpush import WebPushException, webpush

        vapid = _vapid()
    except Exception:
        log.exception("push indisponível")
        return 0
    dados = json.dumps(
        {"titulo": n.titulo, "corpo": n.corpo, "url": n.url, "tag": n.tag, "lembrete_id": n.lembrete_id},
        ensure_ascii=False,
    )
    ok, mortos = 0, []
    for i in itens:
        try:
            webpush(
                {"endpoint": i["endpoint"], "keys": i["keys"]},
                data=dados,
                vapid_private_key=vapid,
                vapid_claims={"sub": _contato()},
                ttl=6 * 3600,
                headers={"Urgency": "high"},
                timeout=15,
            )
            ok += 1
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):  # aparelho desinstalou/desinscreveu
                mortos.append(i["endpoint"])
            log.warning("push recusado (%s) para %s", status, i.get("aparelho"))
        except Exception:
            log.exception("falha ao enviar push para %s", i.get("aparelho"))
    for endpoint in mortos:
        cancelar(endpoint)
    return ok


def enviar_em_segundo_plano(n: Notificacao) -> None:
    threading.Thread(target=enviar, args=(n,), name="push", daemon=True).start()
