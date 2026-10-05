import time
from datetime import datetime

import frontmatter

from app import cron
from app.receipts import Recibo, gravar_recibo
from app.routines import scheduler
from tests.conftest import AGORA, TZ

ANTIGA = datetime(2026, 9, 1, tzinfo=TZ)


def test_ultimo_disparo():
    # AGORA = sábado 03/10 09:15
    assert cron.ultimo_disparo("50 6 * * 1-5", AGORA, TZ) == datetime(2026, 10, 2, 6, 50, tzinfo=TZ)
    assert cron.ultimo_disparo("0 23 * * *", AGORA, TZ) == datetime(2026, 10, 2, 23, 0, tzinfo=TZ)
    assert cron.ultimo_disparo("0 7-22/2 * * *", AGORA, TZ) == datetime(2026, 10, 3, 9, 0, tzinfo=TZ)
    assert cron.ultimo_disparo("0 20 * * 0", AGORA, TZ) == datetime(2026, 9, 27, 20, 0, tzinfo=TZ)


def _agendador(vault, monkeypatch, criada=ANTIGA):
    ag = scheduler.Agendador(vault, TZ)
    monkeypatch.setattr(ag, "_criada_em", lambda r: criada)
    return ag


def test_detecta_rotinas_que_perderam_o_horario(vault, agora, monkeypatch):
    ag = _agendador(vault, monkeypatch)
    pendentes = {r.slug: era for r, era in ag.atrasadas(AGORA)}
    # Ativas no fixture: compilar-raw (todo dia 23:00) e resumo-da-manha (seg–sex 06:50). "pausada" fica de fora.
    assert pendentes == {
        "compilar-raw": datetime(2026, 10, 2, 23, 0, tzinfo=TZ),
        "resumo-da-manha": datetime(2026, 10, 2, 6, 50, tzinfo=TZ),
    }


def test_execucao_depois_do_horario_conta_como_feita(vault, agora, monkeypatch):
    gravar_recibo(vault, Recibo("Rotina: Compilar raw", "ok", "rotina", 3, datetime(2026, 10, 2, 23, 1, tzinfo=TZ), 10, rotina="compilar-raw"))
    pendentes = [r.slug for r, _ in _agendador(vault, monkeypatch).atrasadas(AGORA)]
    assert pendentes == ["resumo-da-manha"]


def test_rotina_criada_depois_do_horario_nao_roda(vault, agora, monkeypatch):
    assert _agendador(vault, monkeypatch, criada=AGORA).atrasadas(AGORA) == []


def test_recupera_uma_vez_e_marca_o_recibo(client, vault, monkeypatch):
    ag = _agendador(vault, monkeypatch)
    resultados = ag.recuperar_atrasadas(espera_s=0)
    assert sorted(r["slug"] for r in resultados) == ["compilar-raw", "resumo-da-manha"]
    for r in resultados:  # as duas são Tier 3: esperam as sessões (Claude Code falso) terminarem
        fim = time.monotonic() + 15
        while client.get(f"/sessoes/{r['sessao_id']}").json()["status"] in ("fila", "rodando") and time.monotonic() < fim:
            time.sleep(0.1)
    pedidos = sorted(frontmatter.load(p).content.split("\n")[1] for p in (vault / "recibos").rglob("*.md"))
    assert pedidos == [
        "Rotina: Compilar raw (atrasada: era 23:00 de 02/10)",
        "Rotina: Resumo da manhã (atrasada: era 06:50 de 02/10)",
    ]
    # Rodou: na próxima inicialização não há mais nada atrasado.
    assert ag.atrasadas(AGORA) == []


def test_rotina_criada_pelo_hud_grava_a_data(client, vault):
    client.post("/rotinas", json={"nome": "Nova", "cron": "0 8 * * *", "tier": 3})
    assert frontmatter.load(vault / "vida/rotinas/nova.md")["criada"] == "2026-10-03T09:15:12-03:00"
