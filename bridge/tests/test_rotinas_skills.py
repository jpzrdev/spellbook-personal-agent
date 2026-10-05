import subprocess
import time
from pathlib import Path

import frontmatter
import pytest

from app.routines import scheduler
from tests.conftest import TZ


def esperar_sessao(client, sid: str, timeout: float = 15) -> dict:
    fim = time.monotonic() + timeout
    while time.monotonic() < fim:
        s = client.get(f"/sessoes/{sid}").json()
        if s["status"] not in ("fila", "rodando"):
            return s
        time.sleep(0.1)
    raise AssertionError("sessão não terminou")


def recibos(vault: Path) -> list[frontmatter.Post]:
    return [frontmatter.load(p) for p in sorted((vault / "recibos").rglob("*.md")) if not p.name.startswith(".tmp-")]


# ---------- rotinas: CRUD ----------

def test_listar_rotinas(client):
    rotinas = {r["slug"]: r for r in client.get("/rotinas").json()}
    assert set(rotinas) == {"compilar-raw", "resumo-da-manha", "pausada"}
    assert rotinas["compilar-raw"]["quando"] == "todo dia às 23:00"
    assert rotinas["compilar-raw"]["proxima"] == "2026-10-03T23:00:00-03:00"
    assert rotinas["pausada"]["proxima"] is None


def test_criar_rotina_gera_md(client, vault):
    r = client.post("/rotinas", json={
        "nome": "Revisão de Cálculo", "cron": "30 19 * * 1,3,5", "tier": 3,
        "skill": "revisar-estudos", "descricao": "Revisar cálculo II.",
    })
    assert r.status_code == 201
    assert r.json()["slug"] == "revisao-de-calculo" and r.json()["quando"] == "seg, qua, sex às 19:30"
    post = frontmatter.load(vault / "vida/rotinas/revisao-de-calculo.md")
    assert 'cron: "30 19 * * 1,3,5"' in (vault / "vida/rotinas/revisao-de-calculo.md").read_text(encoding="utf-8")
    assert post["cron"] == "30 19 * * 1,3,5" and post["ativa"] is True and post["skill"] == "revisar-estudos"
    assert post.content == "Revisar cálculo II."


@pytest.mark.parametrize(
    "corpo,codigo",
    [
        ({"nome": "x", "cron": "isso nao e cron", "tier": 3}, 422),
        ({"nome": "x", "cron": "0 8 * * *", "tier": 1, "acao": "inexistente"}, 422),
        ({"nome": "Compilar raw", "cron": "0 8 * * *", "tier": 3}, 409),
    ],
)
def test_criar_rotina_invalida(client, corpo, codigo):
    assert client.post("/rotinas", json=corpo).status_code == codigo


def test_editar_rotina_preserva_corpo_e_campos(client, vault):
    r = client.patch("/rotinas/compilar-raw", json={"ativa": False, "cron": "0 22 * * *"}).json()
    assert r["ativa"] is False and r["quando"] == "todo dia às 22:00"
    post = frontmatter.load(vault / "vida/rotinas/compilar-raw.md")
    assert post["skill"] == "compilar-raw" and post.content == "Organiza o raw/ toda noite."


def test_remover_rotina(client, vault):
    assert client.delete("/rotinas/pausada").status_code == 204
    assert not (vault / "vida/rotinas/pausada.md").exists()
    assert client.delete("/rotinas/pausada").status_code == 404
    assert client.delete("/rotinas/..%2Fsegredo").status_code == 404


# ---------- rotinas: execução ----------

def test_rodar_agora_tier3_gera_recibo_de_rotina(client, vault):
    r = client.post("/rotinas/compilar-raw/executar").json()
    assert r["tier"] == 3
    s = esperar_sessao(client, r["sessao_id"])
    assert s["status"] == "ok" and s["rotina"] == "compilar-raw" and s["skill"] == "compilar-raw"
    [rec] = recibos(vault)
    assert rec["origem"] == "rotina" and rec["rotina"] == "compilar-raw" and rec["status"] == "ok"
    hist = next(x for x in client.get("/rotinas").json() if x["slug"] == "compilar-raw")["historico"]
    assert hist[0]["status"] == "ok"


def _rotina_commit(client, cron: str = "0 9 * * *"):
    assert client.post("/rotinas", json={"nome": "Commit", "cron": cron, "tier": 1, "acao": "git-commit"}).status_code == 201


def test_rotina_tier1_sem_git_registra_erro_e_aparece_no_hoje(client, vault):
    _rotina_commit(client)
    r = client.post("/rotinas/commit/executar").json()
    assert r["status"] == "erro" and "git" in r["resposta"]
    item = next(i for i in client.get("/hoje").json()["rotinas"] if i["slug"] == "commit")
    assert item["horario"] == "09:00" and item["status"] == "erro"  # rodou às 09:15, conta para as 09:00


def test_rotina_git_commit_ok(client, vault):
    for args in (["init", "-q"], ["config", "user.email", "t@t"], ["config", "user.name", "T"]):
        subprocess.run(["git", *args], cwd=vault, check=True)
    _rotina_commit(client)
    r = client.post("/rotinas/commit/executar").json()
    assert r["status"] == "ok" and "Commit feito" in r["resposta"]
    log = subprocess.run(["git", "log", "--oneline"], cwd=vault, capture_output=True, text=True, encoding="utf-8").stdout
    assert "Commit diário 2026-10-03 09:15" in log
    # Segunda vez: nada novo além do recibo recém-criado (que entra no próximo commit).
    assert client.post("/rotinas/commit/executar").json()["status"] == "ok"


def test_status_pendente_e_passou(client):
    _rotina_commit(client, "0 8,20 * * *")
    itens = [i for i in client.get("/hoje").json()["rotinas"] if i["slug"] == "commit"]
    assert [(i["horario"], i["status"]) for i in itens] == [("08:00", "passou"), ("20:00", "pendente")]


# ---------- agendador ----------

def test_agendador_registra_ativas_e_recarrega_ao_mudar_pasta(vault):
    ag = scheduler.Agendador(vault, TZ)
    ag.iniciar()
    try:
        rotinas = {j.id for j in ag._scheduler.get_jobs() if not j.id.startswith("_")}
        assert rotinas == {"compilar-raw", "resumo-da-manha"}
        assert ag._scheduler.get_job("_limpar_efemeros") is not None
        (vault / "vida/rotinas/nova.md").write_text(
            '---\ntipo: rotina\nnome: Nova\ncron: "0 12 * * *"\nativa: true\ntier: 3\n---\nTeste.\n', encoding="utf-8"
        )
        fim = time.monotonic() + 8
        while time.monotonic() < fim and "nova" not in {j.id for j in ag._scheduler.get_jobs()}:
            time.sleep(0.2)
        assert "nova" in {j.id for j in ag._scheduler.get_jobs()}
        job = ag._scheduler.get_job("resumo-da-manha")
        # seg–sex às 06:50 no padrão cron (a próxima depois de sábado 03/10 é segunda 05/10)
        assert job.trigger.get_next_fire_time(None, job.next_run_time.replace(year=2026, month=10, day=3)).isoformat().startswith("2026-10-05T06:50")
    finally:
        ag.parar()


# ---------- skills ----------

def test_skills_listar_executar_e_ultima_execucao(client, vault):
    skill = next(x for x in client.get("/skills").json() if x["nome"] == "resumo-do-dia")
    assert skill["ultima_execucao"] is None
    s = client.post("/skills/resumo-do-dia/executar", json={"instrucao": "foque em estudos"}).json()
    assert s["skill"] == "resumo-do-dia"
    assert esperar_sessao(client, s["id"])["status"] == "ok"
    [rec] = recibos(vault)
    assert rec["intent"] == "skill:resumo-do-dia" and rec["tier"] == 3
    skill = next(x for x in client.get("/skills").json() if x["nome"] == "resumo-do-dia")
    assert skill["ultima_execucao"]["status"] == "ok"
    assert client.post("/skills/nao-existe/executar", json={}).status_code == 404
