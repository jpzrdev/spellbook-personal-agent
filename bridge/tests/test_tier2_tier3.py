import time
from pathlib import Path

import frontmatter
import pytest

from app.gandalf import claude_cli, tier3

def esperar_fim(client, sessao_id: str, timeout: float = 15) -> dict:
    fim = time.monotonic() + timeout
    while time.monotonic() < fim:
        s = client.get(f"/sessoes/{sessao_id}").json()
        if s["status"] not in ("fila", "rodando"):
            return s
        time.sleep(0.1)
    raise AssertionError(f"sessão {sessao_id} não terminou")


def recibos(vault: Path) -> list[frontmatter.Post]:
    return [frontmatter.load(p) for p in sorted((vault / "recibos").rglob("*.md"))]


def test_tier1_continua_primeiro(client):
    r = client.post("/ask", json={"texto": "minhas prioridades"}).json()
    assert r["tier"] == 1


def test_tier2_responde_e_grava_recibo_com_tokens(client, vault):
    r = client.post("/ask", json={"texto": "o que é uma derivada?"}).json()
    assert r["tier"] == 2 and r["intent"] == "responder"
    assert "taxa de variação" in r["resposta"]
    [rec] = recibos(vault)
    assert rec["tier"] == 2 and rec["modelo"] == "claude-haiku-4-5"
    assert rec["tokens_entrada"] == 150 and rec["tokens_saida"] == 20
    assert rec["custo_estimado_usd"] == pytest.approx(0.0011)


def test_tier2_json_invalido_tenta_de_novo_e_usa_texto(client, vault):
    r = client.post("/ask", json={"texto": "INVALIDO por favor"}).json()
    assert r["tier"] == 2 and r["resposta"] == "Olá! Não sei JSON."
    [rec] = recibos(vault)
    assert rec["tokens_entrada"] == 300  # duas tentativas somadas


def test_escala_para_tier3_com_stream_arquivo_e_recibo(client, vault):
    r = client.post("/ask", json={"texto": "ESCALAR: organize meu raw"}).json()
    assert r["tier"] == 3 and r["sessao_id"]
    s = esperar_fim(client, r["sessao_id"])
    assert s["status"] == "ok"
    assert s["arquivos"] == ["output/relatorio-teste.md"]
    assert (vault / "output" / "relatorio-teste.md").read_text(encoding="utf-8").startswith("# Relatório")
    assert s["claude_session_id"] and s["modelo"] == "claude-sonnet-5-5"

    [rec] = recibos(vault)  # um recibo só por pedido
    assert rec["tier"] == 3 and rec["sessao_claude_code"] == s["claude_session_id"]
    assert rec["tokens_entrada"] == 300  # Tier 2 (150) + Tier 3 (150)
    assert "## Pedido\nESCALAR: organize meu raw" in rec.content
    assert "`output/relatorio-teste.md`" in rec.content


def test_ws_stream_entrega_buffer_e_fim(client):
    sid = client.post("/ask", json={"texto": "faça algo", "forcar_tier": 3}).json()["sessao_id"]
    esperar_fim(client, sid)
    from tests.conftest import TOKEN

    with client.websocket_connect(f"/ws/stream/{sid}?token={TOKEN}", headers={"Authorization": ""}) as ws:
        tipos = []
        while True:
            ev = ws.receive_json()
            tipos.append(ev["type"])
            if ev["type"] == "lifeos_fim":
                break
    assert tipos[0] == "lifeos_status"
    assert {"system", "assistant", "result", "lifeos_texto"} <= set(tipos)


def test_ws_exige_token(client):
    sid = client.post("/ask", json={"texto": "x", "forcar_tier": 3}).json()["sessao_id"]
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/stream/{sid}?token=errado", headers={"Authorization": ""}) as ws:
            ws.receive_json()
    esperar_fim(client, sid)


def test_cancelar_sessao(client, vault):
    sid = client.post("/ask", json={"texto": "DEMORA bastante", "forcar_tier": 3}).json()["sessao_id"]
    time.sleep(0.8)
    assert client.delete(f"/sessoes/{sid}").json()["id"] == sid
    s = esperar_fim(client, sid)
    assert s["status"] == "cancelada"
    assert recibos(vault)[0]["tier"] == 3


def test_fila_respeita_limite(client, monkeypatch):
    from app import config

    monkeypatch.setenv("GANDALF_TIER3_MAX_SIMULTANEAS", "1")
    config.get_settings.cache_clear()
    a = client.post("/ask", json={"texto": "DEMORA 1", "forcar_tier": 3}).json()["sessao_id"]
    b = client.post("/ask", json={"texto": "segunda", "forcar_tier": 3}).json()["sessao_id"]
    assert client.get(f"/sessoes/{b}").json()["status"] == "fila"
    client.delete(f"/sessoes/{a}")
    assert esperar_fim(client, b)["status"] == "ok"


def test_falha_vira_erro(client):
    sid = client.post("/ask", json={"texto": "FALHA agora", "forcar_tier": 3}).json()["sessao_id"]
    s = esperar_fim(client, sid)
    assert s["status"] == "erro" and s["erro"]


def test_continuar_retoma_sessao_do_claude(client):
    sid = client.post("/ask", json={"texto": "primeira", "forcar_tier": 3}).json()["sessao_id"]
    s1 = esperar_fim(client, sid)
    nova = client.post(f"/sessoes/{sid}/continuar", json={"texto": "e agora resuma"}).json()
    s2 = esperar_fim(client, nova["id"])
    assert s2["retomada_de"] == sid
    assert s2["claude_session_id"] == s1["claude_session_id"]  # passou --resume


def test_limite_diario_pede_confirmacao(client, monkeypatch, vault):
    from app import config

    monkeypatch.setenv("GANDALF_LIMITE_DIARIO_CHAMADAS", "1")
    config.get_settings.cache_clear()
    assert client.post("/ask", json={"texto": "pergunta 1"}).json()["tier"] == 2
    r = client.post("/ask", json={"texto": "pergunta 2"}).json()
    assert r["precisa_confirmar"] and r["tier"] == 0
    assert client.post("/ask", json={"texto": "pergunta 2", "confirmar": True}).json()["tier"] == 2


def test_claude_indisponivel_vira_503(client, monkeypatch):
    def sem_claude():
        raise claude_cli.ClaudeIndisponivel("Claude Code não encontrado")

    monkeypatch.setattr(claude_cli, "resolver_comando", sem_claude)
    r = client.post("/ask", json={"texto": "explique integrais"})
    assert r.status_code == 503 and "não encontrado" in r.json()["detail"]


def test_ws_sessao_inexistente_fecha_com_1008(client):
    from starlette.websockets import WebSocketDisconnect

    from tests.conftest import TOKEN

    with pytest.raises(WebSocketDisconnect) as erro:
        with client.websocket_connect(f"/ws/stream/naoexiste?token={TOKEN}", headers={"Authorization": ""}) as ws:
            ws.receive_json()
    assert erro.value.code == 1008
