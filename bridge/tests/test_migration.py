"""Migration of a vault (and bridge/data, .env) from the old Portuguese layout."""

import json
from datetime import date
from pathlib import Path

import frontmatter

from app import studies
from app.migrations import english_layout as mig
from app.receipts_index import read_receipts
from app.vault import reader

OLD_VAULT = {
    "vida/tarefas.md": "# Tarefas\n\n- [ ] Pagar boleto 📅 2026-10-05 ⏫ #pessoal\n",
    "vida/lembretes.md": "# Lembretes\n\n- [ ] Tomar remédio 🔁 0 22 * * * 🆔 a8d7f1\n",
    "vida/agenda/2026-10-03.md": "---\ntipo: agenda\ndata: 2026-10-03\nfonte: google-calendar\n---\n- 14:00 Dentista\n",
    "vida/rotinas/aviso-da-manha.md": (
        '---\ntipo: rotina\nnome: Aviso da manhã\ncron: "30 7 * * *"\nativa: true\ntier: 1\nacao: aviso-do-dia\n---\nAvisa.\n'
    ),
    "vida/rotinas/resumo-emails.md": (
        '---\ntipo: rotina\nnome: Resumo de e-mails\ncron: "0 8 * * 1-5"\nativa: false\ntier: 3\nskill: resumo-emails\n'
        "saida: efemera\n---\nResume os e-mails de vida/agenda.\n"
    ),
    "recibos/2026/10/2026-10-04-135751-rotina-aviso.md": (
        "---\ntipo: recibo\nid: 01M43XKE06QW4DTAGH3W2Z6PMD\nquando: '2026-10-04T13:57:51-03:00'\norigem: rotina\ntier: 1\n"
        "intent: acao:aviso-do-dia\nmodelo: null\nduracao_ms: 2712\ntokens_entrada: 0\ntokens_saida: 0\n"
        "custo_estimado_usd: 0.0\nsessao_claude_code: null\nrotina: aviso-da-manha\nstatus: erro\n---\n"
        "## Pedido\nRotina: Aviso da manhã\n\n## Resposta\nFalhou.\n"
    ),
    "wiki/estudos/calc/_index.md": "---\ntipo: indice\n---\n# Cálculo\n\n- [[wiki/estudos/calc/limites]]\n",
    "wiki/estudos/calc/limites.md": "---\ntipo: conceito\nordem: 1\ncriado: 2026-10-04\n---\n# Limites\n\nTexto.\n",
    "wiki/estudos/calc/_anotacoes/2026-10-04-a.md": (
        "---\ntipo: anotacao\ntopico: wiki/estudos/calc/limites.md\ncriado: '2026-10-04T16:36:39-03:00'\n---\nMinha nota.\n"
    ),
    "wiki/sobre-mim/perfil.md": "---\ntipo: perfil\n---\n# Perfil\n",
    "raw/_processados.md": "# Itens processados\n",
    "raw/2026-10-05-x.md": "---\ntipo: captura\ncriado: 2026-10-05T00:06:52-03:00\norigem: voz\n---\nasd\n",
    ".claude/skills/agendar/SKILL.md": "---\nname: agendar\ndescription: Cria um evento (editada).\n---\nUse vida/agenda/.\n",
    ".claude/skills/resumo-emails/SKILL.md": (
        "---\nname: resumo-emails\ndescription: Resume.\n# comentário\nsaida: efemera\ntitulo: Resumo de e-mails\n---\nResuma.\n"
    ),
}


def _old_vault(tmp_path: Path) -> Path:
    vault = tmp_path / "old-vault"
    for rel, content in OLD_VAULT.items():
        path = vault / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return vault


def test_dry_run_changes_nothing(tmp_path):
    vault = _old_vault(tmp_path)
    plan = mig.Plan(apply=False)
    mig.migrate_vault(vault, plan)
    assert any(s.startswith("vida/tarefas.md → life/tasks.md") for s in plan.steps)
    assert (vault / "vida/tarefas.md").exists() and not (vault / "life").exists()


def test_migrated_vault_is_read_by_the_bridge(tmp_path, now):
    vault = _old_vault(tmp_path)
    mig.migrate_vault(vault, mig.Plan(apply=True))

    assert not (vault / "vida").exists() and not (vault / "recibos").exists()
    assert [x.text for x in reader.read_tasks(vault)] == ["Pagar boleto"]
    assert [e.title for e in reader.read_agenda(vault, date(2026, 10, 3))] == ["Dentista"]
    assert (vault / "life/reminders.md").exists() and (vault / "raw/_processed.md").exists()
    assert (vault / "wiki/about-me/profile.md").exists()

    routines = {r.slug: r for r in reader.read_routines(vault)}
    assert set(routines) == {"morning-notice", "email-summary"}
    assert routines["morning-notice"].action == "daily-notice" and routines["morning-notice"].name == "Aviso da manhã"
    assert routines["email-summary"].skill == "email-summary" and routines["email-summary"].output == "ephemeral"
    assert "life/agenda" in routines["email-summary"].description

    [receipt] = read_receipts(vault, date(2026, 10, 1), date(2026, 10, 31))
    assert receipt["source"] == "routine" and receipt["routine"] == "morning-notice" and receipt["status"] == "error"
    assert receipt["intent"] == "action:daily-notice" and receipt["request"] == "Rotina: Aviso da manhã"

    [subject] = studies.list_subjects(vault)
    assert subject["topic_count"] == 1 and subject["annotation_count"] == 1
    [annotation] = studies.list_annotations(vault, "calc")
    assert annotation["topic"] == "wiki/studies/calc/limites.md"
    assert "[[wiki/studies/calc/limites]]" in (vault / "wiki/studies/calc/_index.md").read_text(encoding="utf-8")
    assert frontmatter.load(vault / "raw/2026-10-05-x.md")["source"] == "voice"


def test_skills_pristine_copies_get_the_new_template_and_edited_ones_are_rewritten(tmp_path):
    vault = _old_vault(tmp_path)
    mig.migrate_vault(vault, mig.Plan(apply=True))
    edited = (vault / ".claude/skills/schedule-event/SKILL.md").read_text(encoding="utf-8")
    assert "name: schedule-event" in edited and "Use life/agenda/." in edited
    email = (vault / ".claude/skills/email-summary/SKILL.md").read_text(encoding="utf-8")
    assert "output: ephemeral" in email and "title: Resumo de e-mails" in email and "# comentário" in email
    assert not (vault / ".claude/skills/agendar").exists()


def test_rewrite_is_idempotent():
    text = OLD_VAULT["recibos/2026/10/2026-10-04-135751-rotina-aviso.md"]
    once = mig.rewrite_note(text)
    assert mig.rewrite_note(once) == once
    assert "## Request\n" in once and "type: receipt" in once


def test_bridge_data_and_env(tmp_path):
    old, new = tmp_path / "dados", tmp_path / "data"
    (old / "push").mkdir(parents=True)
    (old / "push" / "inscricoes.json").write_text(json.dumps([{"endpoint": "e", "keys": {}, "aparelho": "iPhone", "desde": "x"}]), encoding="utf-8")
    (old / "push" / "vapid_privada.pem").write_text("key", encoding="utf-8")
    (old / "propostas").mkdir()
    (old / "propostas" / "abc.json").write_text(json.dumps({
        "id": "abc", "evento": {"titulo": "Terapia", "data": "2026-10-06", "repetir": "semanal"}, "pedido": "p",
        "origem": "voz", "criada": "c", "expira": "e", "status": "pendente", "sessao_id": None}), encoding="utf-8")
    mig.migrate_data(old, new, mig.Plan(apply=True))
    assert json.loads((new / "push" / "subscriptions.json").read_text(encoding="utf-8"))[0]["device"] == "iPhone"
    assert (new / "push" / "vapid_private.pem").exists()
    proposal = json.loads((new / "proposals" / "abc.json").read_text(encoding="utf-8"))
    assert proposal["event"] == {"title": "Terapia", "date": "2026-10-06", "repeat": "weekly"}
    assert proposal["status"] == "pending" and proposal["source"] == "voice"

    env = tmp_path / ".env"
    env.write_text("﻿JEV_TIER2_MODEL=sonnet\nGANDALF_LIMITE_DIARIO_CHAMADAS=10\nJEV_LIMITE_DIARIO_USD=1\nBRIDGE_TOKEN=t\n", encoding="utf-8")
    mig.migrate_env(env, "pt-BR", mig.Plan(apply=True))
    lines = env.read_text(encoding="utf-8").splitlines()
    assert "GANDALF_TIER2_MODEL=sonnet" in lines and "GANDALF_DAILY_CALL_LIMIT=10" in lines
    assert "JEV_LIMITE_DIARIO_USD=1" in lines and "GANDALF_LANGUAGE=pt-BR" in lines and "BRIDGE_TOKEN=t" in lines
