"""Ações internas (Tier 1, sem IA) que uma rotina pode chamar com `acao: <nome>`."""

import os
import subprocess
from collections.abc import Callable
from datetime import datetime
from pathlib import Path


class AcaoFalhou(Exception):
    pass


def _git(vault: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        cwd=vault,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )


def git_commit(vault: Path, agora: datetime) -> str:
    """Commit de tudo que mudou no vault (para poder desfazer qualquer alteração)."""
    if not (vault / ".git").exists():
        raise AcaoFalhou("o vault não tem repositório git (rode `git init` dentro de vault/)")
    _git(vault, "add", "-A")
    if not _git(vault, "status", "--porcelain").stdout.strip():
        return "Nada mudou no vault desde o último commit."
    mudancas = _git(vault, "diff", "--cached", "--name-only").stdout.split()
    r = _git(vault, "commit", "-m", f"Commit diário {agora:%Y-%m-%d %H:%M}")
    if r.returncode != 0:
        raise AcaoFalhou((r.stderr or r.stdout).strip()[-400:])
    lista = "\n".join(f"- `{m}`" for m in mudancas[:20])
    extra = f"\n…e mais {len(mudancas) - 20}." if len(mudancas) > 20 else ""
    return f"Commit feito com {len(mudancas)} arquivo(s):\n{lista}{extra}"


def aviso_do_dia(vault: Path, agora: datetime) -> str:
    """Notificação da manhã: compromissos (da agenda sincronizada), aniversários, tarefas e lembretes do dia."""
    from app import push
    from app.vault import lembretes, reader
    from app.vault.tasks import ordenar_prioridades

    dia = agora.date()
    eventos = reader.ler_agenda(vault, dia)
    aniversarios = [e.titulo for e in eventos if "anivers" in e.titulo.lower()]
    compromissos = [e for e in eventos if e.titulo not in aniversarios]
    abertas = ordenar_prioridades(reader.ler_tarefas(vault), dia)
    para_hoje = [t for t in abertas if t.vence and t.vence <= dia]
    atrasadas = sum(1 for t in para_hoje if t.vence < dia)
    avisos = [x for x in lembretes.ler(vault, agora.tzinfo) if not x.concluido and x.quando and x.quando.date() == dia]

    partes = []
    if aniversarios:
        partes.append("🎂 " + ", ".join(aniversarios))
    if compromissos:
        primeiro = next((e for e in compromissos if e.inicio), compromissos[0])
        mais = f" +{len(compromissos) - 1}" if len(compromissos) > 1 else ""
        partes.append(f"📅 {primeiro.inicio or 'dia todo'} {primeiro.titulo}{mais}")
    if para_hoje:
        partes.append(f"✅ {len(para_hoje)} tarefa(s)" + (f" ({atrasadas} atrasada[s])" if atrasadas else ""))
    if avisos:
        partes.append(f"⏰ {len(avisos)} lembrete(s)")
    corpo = " · ".join(partes) or "Dia livre: nada na agenda nem tarefas com prazo. 🌱"
    enviados = push.enviar(push.Notificacao("☀️ Bom dia! Seu dia hoje", corpo, "/", tag="aviso-do-dia"))
    return f"{corpo}\n\n(notificação enviada para {enviados} aparelho[s])"


ACOES: dict[str, tuple[str, Callable[[Path, datetime], str]]] = {
    "git-commit": ("Salvar no git tudo o que mudou no vault", git_commit),
    "aviso-do-dia": ("Notificar no celular o resumo do dia (agenda, aniversários, tarefas, lembretes)", aviso_do_dia),
}
