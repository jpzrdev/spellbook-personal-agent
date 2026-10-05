"""Saídas efêmeras: resultados de passagem (ex.: resumo de e-mails) que NÃO vão para o vault.

Ficam em `bridge/dados/efemeros/<id>.json` (fora do vault e do git) e expiram depois de
`GANDALF_EFEMERO_HORAS`. O usuário pode guardar um item no vault de propósito (raw/ ou tarefa).
"""

import json
import threading
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path

from app import clock
from app.config import get_settings

_lock = threading.Lock()


@dataclass
class Efemero:
    id: str
    titulo: str
    texto: str
    quando: str
    expira: str
    origem: str  # rotina | skill | hud
    rotina: str | None = None
    sessao_id: str | None = None
    chave: str | None = None  # skill/rotina de origem: um resumo novo substitui o anterior da mesma chave
    # Resultado de pesquisa web: {tema, tipo, pedido, slug} para o botão "Guardar no vault" organizar.
    pesquisa: dict | None = None


def _pasta() -> Path:
    pasta = get_settings().dados_path / "efemeros"
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta


def salvar(titulo: str, texto: str, origem: str, rotina: str | None = None, sessao_id: str | None = None,
           chave: str | None = None, pesquisa: dict | None = None, horas: float | None = None) -> Efemero:
    agora = clock.now()
    e = Efemero(
        id=uuid.uuid4().hex[:12],
        titulo=titulo,
        texto=texto.strip(),
        quando=agora.isoformat(timespec="seconds"),
        expira=(agora + timedelta(hours=horas or get_settings().efemero_horas)).isoformat(timespec="seconds"),
        origem=origem,
        rotina=rotina,
        sessao_id=sessao_id,
        chave=chave,
        pesquisa=pesquisa,
    )
    with _lock:
        if chave:  # "Resumos de hoje" mostra só a versão mais recente de cada resumo
            for arquivo in _pasta().glob("*.json"):
                try:
                    if json.loads(arquivo.read_text(encoding="utf-8")).get("chave") == chave:
                        arquivo.unlink()
                except (OSError, ValueError):
                    continue
        (_pasta() / f"{e.id}.json").write_text(json.dumps(asdict(e), ensure_ascii=False, indent=2), encoding="utf-8")
    return e


def listar() -> list[Efemero]:
    """Itens válidos, do mais novo para o mais antigo. Apaga os expirados no caminho."""
    agora = clock.now()
    itens: list[Efemero] = []
    with _lock:
        for arquivo in _pasta().glob("*.json"):
            try:
                e = Efemero(**json.loads(arquivo.read_text(encoding="utf-8")))
                expirado = datetime.fromisoformat(e.expira) <= agora
            except (ValueError, TypeError, json.JSONDecodeError):
                expirado, e = True, None
            if expirado:
                arquivo.unlink(missing_ok=True)
            elif e:
                itens.append(e)
    return sorted(itens, key=lambda x: x.quando, reverse=True)


def obter(efemero_id: str) -> Efemero | None:
    return next((e for e in listar() if e.id == efemero_id), None)


def remover(efemero_id: str) -> bool:
    if not efemero_id.isalnum():
        return False
    with _lock:
        arquivo = _pasta() / f"{efemero_id}.json"
        existia = arquivo.exists()
        arquivo.unlink(missing_ok=True)
    return existia
