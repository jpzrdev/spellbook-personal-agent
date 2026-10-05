import logging

from fastapi.testclient import TestClient

from tests.conftest import TOKEN


def test_recibos_custos_e_leitura(client):
    client.post("/ask", json={"texto": "o que tenho hoje?"})  # tier 1
    client.post("/ask", json={"texto": "explique integrais"})  # tier 2 (CLI falso)
    recibos = client.get("/recibos").json()
    # Mesmo horário (relógio fixo dos testes): só confere que vieram os dois.
    assert sorted(r["tier"] for r in recibos) == [1, 2]
    assert [r["tier"] for r in client.get("/recibos?tier=1").json()] == [1]
    assert client.get("/recibos?origem=voz").json() == []

    tier2 = next(r for r in recibos if r["tier"] == 2)
    assert tier2["pedido"] == "explique integrais"
    detalhe = client.get(f"/recibos/{tier2['id']}").json()
    assert detalhe["metadados"]["tier"] == 2 and "## Pedido\nexplique integrais" in detalhe["texto"]
    assert client.get("/recibos/naoexiste").status_code == 404

    c = client.get("/custos").json()
    assert c["hoje"]["chamadas"] == {"1": 1, "2": 1, "3": 0}
    assert c["mes"]["tokens"] == 170 and c["mes"]["custo_estimado_usd"] == 0.0011
    assert c["por_dia"][-1]["dia"] == "2026-10-03"


def test_vault_arvore_e_nota(client):
    arvore = client.get("/vault/arvore").json()
    nomes = [n["nome"] for n in arvore]
    assert nomes[:3] == [".claude", "output", "raw"] or "vida" in nomes
    assert ".git" not in nomes
    vida = next(n for n in arvore if n["nome"] == "vida")
    assert any(f["caminho"] == "vida/tarefas.md" for f in vida["filhos"])

    nota = client.get("/vault/nota", params={"caminho": "vida/agenda/2026-10-03.md"}).json()
    assert nota["metadados"]["data"] == "2026-10-03" and "Dentista" in nota["texto"]


def test_vault_nao_sai_da_pasta(client):
    for caminho in ("../.env", "vida/../../segredo.md", ".git/config", "/etc/passwd"):
        r = client.get("/vault/nota", params={"caminho": caminho})
        assert r.status_code in (400, 404), caminho
    assert client.get("/vault/nota", params={"caminho": "nao/existe.md"}).status_code == 404


def test_servidor_unico_serve_hud_e_api(monkeypatch, vault, tmp_path):
    from app import config
    from app.servidor import criar

    monkeypatch.setenv("BRIDGE_TOKEN", TOKEN)
    monkeypatch.setenv("VAULT_PATH", str(vault))
    config.get_settings.cache_clear()
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>HUD</html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")

    with TestClient(criar(dist)) as c:
        h = {"Authorization": f"Bearer {TOKEN}"}
        assert c.get("/api/health", headers=h).json()["status"] == "ok"
        assert c.get("/api/health").status_code == 401
        assert c.get("/").text == "<html>HUD</html>"
        assert c.get("/rotinas").text == "<html>HUD</html>"  # rota do React Router
        assert c.get("/assets/app.js").text == "console.log(1)"
        assert c.get("/api/nao-existe", headers=h).status_code == 404  # API não cai no index.html
        with c.websocket_connect(f"/api/ws/events?token={TOKEN}"):
            pass


def test_logs_sem_token():
    from app.servidor import _SemToken

    rec = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s"', ("127.0.0.1", "WebSocket", "/api/ws/stream/x?token=abc123&y=1"), None)
    _SemToken().filter(rec)
    assert rec.getMessage() == '127.0.0.1 - "WebSocket /api/ws/stream/x?token=***&y=1"'
