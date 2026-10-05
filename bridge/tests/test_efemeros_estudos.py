import time
from pathlib import Path

import frontmatter

from app import efemeros
from app.gandalf import tier3
from app.skills.catalog import _ferramentas, obter_skill


def esperar_sessao(client, sid: str, timeout: float = 15) -> dict:
    fim = time.monotonic() + timeout
    while time.monotonic() < fim:
        s = client.get(f"/sessoes/{sid}").json()
        if s["status"] not in ("fila", "rodando"):
            return s
        time.sleep(0.1)
    raise AssertionError("sessão não terminou")


def _rotina_efemera(client):
    r = client.post("/rotinas", json={
        "nome": "Resumo de e-mails", "cron": "0 8 * * 1-5", "tier": 3,
        "skill": "resumo-emails", "saida": "efemera", "descricao": "Resuma os e-mails importantes.",
    })
    assert r.status_code == 201 and r.json()["saida"] == "efemera"


def test_rotina_efemera_nao_guarda_conteudo_no_vault(client, vault):
    _rotina_efemera(client)
    assert 'saida: efemera' in (vault / "vida/rotinas/resumo-de-e-mails.md").read_text(encoding="utf-8")

    sid = client.post("/rotinas/resumo-de-e-mails/executar").json()["sessao_id"]
    s = esperar_sessao(client, sid)
    assert s["status"] == "ok" and s["saida"] == "efemera" and s["efemero_id"]

    # O conteúdo vai para o armazenamento efêmero, que aparece no HUD...
    [item] = client.get("/efemeros").json()
    assert item["texto"] == "Pronto: criei output/relatorio-teste.md." and item["rotina"] == "resumo-de-e-mails"
    # ...e o recibo no vault fica só com metadados.
    [rec] = [frontmatter.load(p) for p in (vault / "recibos").rglob("*.md")]
    assert rec["rotina"] == "resumo-de-e-mails" and rec["status"] == "ok"
    assert "Pronto: criei" not in rec.content and "saída efêmera" in rec.content


def test_sessao_efemera_roda_so_leitura_mais_ferramentas_da_skill(vault):
    g = tier3.Gerenciador(vault)
    s = tier3.Sessao(id="x", tarefa="t", pedido="p", origem="rotina", criada=None, skill="resumo-emails", saida="efemera")
    args = g._args(s)
    assert args[args.index("--allowedTools") + 1] == "Read(**),Glob(**),Grep(**),mcp__gmail,Read(**)"
    assert g._prompt(s).startswith("/resumo-emails t") and "efêmera" in g._prompt(s)

    normal = tier3.Sessao(id="y", tarefa="t", pedido="p", origem="hud", criada=None)
    assert "Write" in g._args(normal)[g._args(normal).index("--allowedTools") + 1]


def test_mcp_do_vault_e_carregado_explicitamente(vault):
    (vault / ".mcp.json").write_text('{"mcpServers": {}}', encoding="utf-8")
    args = tier3.Gerenciador(vault)._args(tier3.Sessao(id="x", tarefa="t", pedido="p", origem="hud", criada=None))
    assert args[args.index("--mcp-config") + 1] == str(vault / ".mcp.json")


def test_allowed_tools_formatos(vault):
    assert _ferramentas("Read, Bash(git *) mcp__gmail") == ["Read", "Bash(git *)", "mcp__gmail"]
    assert _ferramentas(["mcp__google_calendar"]) == ["mcp__google_calendar"]
    assert obter_skill(vault, "resumo-emails").ferramentas == ["mcp__gmail", "Read"]


def test_guardar_e_descartar_efemero(client, vault):
    e = efemeros.salvar("Resumo de e-mails", "- Boleto da faculdade vence sexta\n- Reunião remarcada", "rotina")
    r = client.post(f"/efemeros/{e.id}/guardar", json={"destino": "tarefa", "texto": "Pagar boleto da faculdade"})
    assert r.status_code == 201 and r.json()["tarefa"]["texto"] == "Pagar boleto da faculdade"
    r = client.post(f"/efemeros/{e.id}/guardar", json={"destino": "raw"}).json()
    assert (vault / r["arquivo"]).read_text(encoding="utf-8").strip().endswith("- Reunião remarcada")
    assert client.post(f"/efemeros/{e.id}/guardar", json={"destino": "tarefa"}).status_code == 422
    assert client.delete(f"/efemeros/{e.id}").status_code == 204
    assert client.get("/efemeros").json() == []
    assert client.delete(f"/efemeros/{e.id}").status_code == 404


def test_efemero_expira(monkeypatch, tmp_path):
    from app import clock
    from tests.conftest import AGORA

    monkeypatch.setattr(clock, "now", lambda: AGORA)
    e = efemeros.salvar("x", "y", "hud")
    assert [i.id for i in efemeros.listar()] == [e.id]
    monkeypatch.setattr(clock, "now", lambda: AGORA.replace(day=6))  # +72 h > 48 h
    assert efemeros.listar() == []
    assert not any(Path(efemeros._pasta()).glob("*.json"))


def test_estudos(client):
    [calc] = client.get("/estudos").json()
    assert calc["materia"] == "calculo" and calc["titulo"] == "Cálculo II"
    assert calc["notas"] == 2
    assert calc["pendentes"] == [{"nota": "wiki/estudos/calculo/limites.md", "titulo": "Limites", "desde": "2026-10-01"}]
    assert calc["proxima_revisao"] == "2026-10-10"
    assert calc["revisoes_feitas"] == 1 and calc["ultima_revisao"] == "output/revisoes/2026-09-30-calculo.md"


def test_skill_efemera_rodada_pela_aba_skills_nao_vai_para_o_vault(client, vault):
    """Bug real: rodar /resumo-emails pela aba Skills gravava os e-mails no recibo e não aparecia em Resumos."""
    from test_tier2_tier3 import esperar_fim

    for _ in range(2):  # a segunda execução substitui a primeira no card
        s = client.post("/skills/resumo-emails/executar", json={"instrucao": ""}).json()
        assert s["saida"] == "efemera"
        fim = esperar_fim(client, s["id"])
        for _ in range(50):  # o status vira "ok" um instante antes de o resumo ser guardado
            if fim["recibo_id"]:
                break
            time.sleep(0.05)
            fim = client.get(f"/sessoes/{s['id']}").json()
        assert fim["status"] == "ok" and fim["efemero_id"]
    [item] = client.get("/efemeros").json()
    assert item["titulo"] == "Resumo de e-mails" and item["id"] == fim["efemero_id"]
    for recibo in (vault / "recibos").rglob("*.md"):
        assert item["texto"] not in recibo.read_text(encoding="utf-8")
