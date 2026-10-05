"""Migrates a vault (and bridge/data, .env) from the old Portuguese layout to the English one.

Older versions used Portuguese names for the vault's structure (`vida/tarefas.md`, `recibos/`, `tipo: recibo`…),
the Bridge's data folder (`bridge/dados/`) and the .env variables. The content of the notes stays as it is: only
the structure the code reads (folders, file names, frontmatter keys and fixed values) changes.

Usage (stop the Bridge first):
    uv run python -m app.migrations.english_layout            # dry run: lists what would change
    uv run python -m app.migrations.english_layout --apply    # applies it
Options: --language pt-BR (written to GANDALF_LANGUAGE in the .env if it's missing), --vault <path>.

Commit the vault's git before applying: everything can then be undone with git.
"""

import argparse
import hashlib
import json
import re
import shutil
import sys
from collections.abc import Callable
from pathlib import Path

from app.config import REPO_ROOT, get_settings

TEMPLATE = REPO_ROOT / "vault-template"

# ---------- names ----------

SKILLS = {
    "agendar": "schedule-event",
    "compilar-raw": "compile-raw",
    "estruturar-material": "structure-material",
    "guardar-pesquisa": "save-research",
    "pesquisar": "research",
    "planejar-semana": "plan-week",
    "preparar-estudos": "prepare-studies",
    "responder-com-vault": "answer-from-vault",
    "resumo-do-dia": "daily-summary",
    "resumo-emails": "email-summary",
    "sincronizar-agenda": "sync-calendar",
    "revisar-estudos": "review-studies",
}
# Routines that came from the template: the file (slug) gets the template's English name, so the vault
# setup doesn't add a second copy. Receipts that point at them are updated too.
ROUTINES = {
    "aviso-da-manha": "morning-notice",
    "commit-diario": "daily-commit",
    "compilar-raw": "compile-raw",
    "planejar-semana": "plan-week",
    "resumo-da-manha": "morning-summary",
    "resumo-emails": "email-summary",
    "sincronizar-agenda": "sync-calendar",
}
ACTIONS = {"aviso-do-dia": "daily-notice", "git-commit": "git-commit"}

# sha1 of the old template files (skills and vault CLAUDE.md): an untouched copy is replaced by the new template.
OLD_TEMPLATE_SKILLS = {
    "30fd611ea764df0a9a52f4db17053c3c8b46ea59": "agendar",
    "cfd8ba3ec48a5a6e8c789b7e9d58bbdf8958e7a9": "compilar-raw",
    "1e306056b2c909ecfd3a79c660f39b886a9b2f43": "estruturar-material",
    "a0155b929cc753aef9d3a5b513a8841f449d490e": "guardar-pesquisa",
    "bf8718d0692330cbff20d7c71c7626262f592a0c": "pesquisar",
    "50ba5d2c9f5fa36069e7bcb5454970451c3a49c5": "planejar-semana",
    "316003f78d616dc941ea3c86094fccf153b04fe8": "preparar-estudos",
    "23d3c5a4b6435fab9ac0184d14283fac86a7aca9": "responder-com-vault",
    "1fbfc4547f0c8221600b3e9eac017ddd76b0a0e4": "resumo-do-dia",
    "539384efed6eda2b9b548f1b5df01a7acabd65b6": "resumo-emails",
    "cbcecb0d5ae3ac2c8322db80e8dcce53cedb2dbf": "sincronizar-agenda",
}
OLD_TEMPLATE_CLAUDE_MD = {"abaee37f0f5252da0fb2537ac39f1a04e25b7fb5"}

# Folder/file moves, in order (more specific first). Paths relative to the vault.
MOVES = [
    ("vida/tarefas.md", "life/tasks.md"),
    ("vida/lembretes.md", "life/reminders.md"),
    ("vida/agenda", "life/agenda"),
    ("vida/rotinas", "life/routines"),
    ("vida/diario", "life/journal"),
    ("vida", "life"),
    ("recibos", "receipts"),
    ("raw/_processados.md", "raw/_processed.md"),
    ("wiki/estudos", "wiki/studies"),
    ("wiki/pessoal", "wiki/personal"),
    ("wiki/sobre-mim/perfil.md", "wiki/sobre-mim/profile.md"),
    ("wiki/sobre-mim", "wiki/about-me"),
    ("wiki/biblioteca", "wiki/library"),
]
SUBJECT_FOLDERS = {"_anotacoes": "_annotations", "_fontes": "_sources"}

# Path references inside the notes (links, sources, skill instructions).
PATHS = [
    (r"vida/tarefas\.md", "life/tasks.md"),
    (r"vida/lembretes\.md", "life/reminders.md"),
    (r"vida/agenda", "life/agenda"),
    (r"vida/rotinas", "life/routines"),
    (r"vida/diario", "life/journal"),
    (r"vida/", "life/"),
    (r"raw/_processados", "raw/_processed"),
    (r"wiki/estudos", "wiki/studies"),
    (r"wiki/pessoal", "wiki/personal"),
    (r"wiki/sobre-mim/perfil", "wiki/about-me/profile"),
    (r"wiki/sobre-mim", "wiki/about-me"),
    (r"wiki/biblioteca", "wiki/library"),
    (r"recibos/", "receipts/"),
    (r"/_anotacoes", "/_annotations"),
    (r"/_fontes", "/_sources"),
]

# Frontmatter keys (top level only).
KEYS = {
    "tipo": "type", "criado": "created", "criada": "created", "atualizado": "updated", "fontes": "sources",
    "fonte": "source", "origem": "source", "titulo": "title", "ordem": "order", "data": "date", "nome": "name",
    "ativa": "active", "acao": "action", "saida": "output", "notificar": "notify", "quando": "at", "modelo": "model",
    "duracao_ms": "duration_ms", "tokens_entrada": "input_tokens", "tokens_saida": "output_tokens",
    "custo_estimado_usd": "estimated_cost_usd", "sessao_claude_code": "claude_code_session", "rotina": "routine",
    "topico": "topic", "tema": "topic", "sincronizado": "synced", "revisar": "review", "pergunta": "question",
    "estado": "state", "intervalo": "interval", "revisoes": "reviews", "estudado_em": "studied_on",
    "ultima_revisao": "last_review",
}
TYPES = {
    "captura": "capture", "recibo": "receipt", "rotina": "routine", "anotacao": "annotation", "conceito": "concept",
    "indice": "index", "resumo": "summary", "perfil": "profile", "projeto": "project", "diario": "journal",
    "plano": "plan", "pesquisa": "research", "resposta": "answer", "revisao": "review",
}
SOURCES = {"voz": "voice", "rotina": "routine"}
STATUSES = {"erro": "error", "cancelada": "cancelled", "tempo_esgotado": "timed_out"}
OUTPUTS = {"efemera": "ephemeral", "pesquisa": "research", "biblioteca": "library", "acao": "action"}
INTENTS = {
    "nao_entendido": "not_understood", "prioridades": "priorities", "tarefas": "tasks", "adicionar_tarefa": "add_task",
    "anotar": "note", "lembretes": "reminders", "rotinas": "routines", "lembrete": "reminder", "capturar": "capture",
    "responder": "answer", "pesquisar": "research", "estudos.quiz": "studies.quiz",
    "estudos.quiz.corrigir": "studies.quiz.grade",
}

# .env variables (the GANDALF_/JEV_ prefix is handled separately).
ENV_NAMES = {
    "TIER3_MAX_SIMULTANEAS": "TIER3_MAX_CONCURRENT",
    "LIMITE_DIARIO_CHAMADAS": "DAILY_CALL_LIMIT",
    "EFEMERO_HORAS": "EPHEMERAL_HOURS",
    "WHISPER_MODELO": "WHISPER_MODEL",
    "VOZ": "VOICE",
    "VOZ_VELOCIDADE": "VOICE_SPEED",
    "AGENDAR_MODELO": "SCHEDULE_EVENT_MODEL",
}


def sha1(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()


# ---------- frontmatter and body rewriting ----------

FRONTMATTER_RE = re.compile(r"\A(---\r?\n)(.*?)(\r?\n---\r?\n?)", re.S)
LINE_RE = re.compile(r"^([A-Za-z_][\w-]*)(\s*:)(.*)$")


def _value(raw: str) -> tuple[str, str, str]:
    """Splits ' recibo  # comment' into (leading space, bare value, trailing part)."""
    m = re.match(r"^(\s*)(['\"]?)([^'\"#]*?)\2(\s*(?:#.*)?)$", raw)
    if not m:
        return raw, "", ""
    return m.group(1) + m.group(2), m.group(3), m.group(2) + m.group(4)


def _map_value(key: str, value: str, kind: str | None) -> str:
    if key == "type":
        return TYPES.get(value, value)
    if key == "source" and kind in ("receipt", "capture"):
        return SOURCES.get(value, value)
    if key == "status":
        return STATUSES.get(value, value)
    if key == "output":
        return OUTPUTS.get(value, value)
    if key == "action":
        return ACTIONS.get(value, value)
    if key == "skill":
        return SKILLS.get(value, value)
    if key == "routine":
        return ROUTINES.get(value, value)
    if key == "name" and kind == "skill":
        return SKILLS.get(value, value)
    if key == "intent":
        if value.startswith("skill:"):
            return "skill:" + SKILLS.get(value[6:], value[6:])
        if value.startswith("acao:"):
            return "action:" + ACTIONS.get(value[5:], value[5:])
        return INTENTS.get(value, value)
    return value


def rewrite_frontmatter(block: str, kind_hint: str | None = None) -> str:
    """Renames top-level keys and maps the fixed values, keeping comments and formatting."""
    lines = block.split("\n")
    kind = kind_hint
    for line in lines:
        if m := LINE_RE.match(line):
            if m.group(1) in ("tipo", "type"):
                kind = TYPES.get(_value(m.group(3))[1].strip(), _value(m.group(3))[1].strip())
    out = []
    for line in lines:
        m = LINE_RE.match(line)
        if not m:
            out.append(line)
            continue
        key = KEYS.get(m.group(1), m.group(1))
        if kind == "skill" and m.group(1) == "titulo":
            key = "title"
        lead, value, trail = _value(m.group(3))
        new_value = _map_value(key, value.strip(), kind) if value.strip() else value
        if value.strip() and new_value != value.strip():
            value = value.replace(value.strip(), new_value)
        out.append(f"{key}{m.group(2)}{lead}{value}{trail}")
    return "\n".join(out)


def rewrite_paths(text: str) -> str:
    for pattern, repl in PATHS:
        text = re.sub(r"(?<![\w-])" + pattern, repl, text)
    return text


def rewrite_note(text: str, is_skill: bool = False) -> str:
    m = FRONTMATTER_RE.match(text)
    if m:
        head = rewrite_frontmatter(m.group(2), "skill" if is_skill else None)
        body = text[m.end():]
        is_receipt = re.search(r"^type:\s*receipt\s*$", head, re.M) is not None
        text = m.group(1) + head + m.group(3) + body
        if is_receipt:
            text = re.sub(r"^## Pedido\s*$", "## Request", text, count=1, flags=re.M)
            text = re.sub(r"^## Resposta\s*$", "## Response", text, count=1, flags=re.M)
    return rewrite_paths(text)


# ---------- plan ----------

class Plan:
    def __init__(self, apply: bool):
        self.apply = apply
        self.steps: list[str] = []
        self.warnings: list[str] = []

    def do(self, description: str, action: Callable[[], None]) -> None:
        self.steps.append(description)
        if self.apply:
            action()

    def warn(self, message: str) -> None:
        self.warnings.append(message)


def _merge_move(src: Path, dst: Path) -> None:
    """Moves src to dst; if dst is an existing folder, moves the contents (without overwriting files)."""
    if not dst.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
        return
    if src.is_dir() and dst.is_dir():
        for child in list(src.iterdir()):
            _merge_move(child, dst / child.name)
        src.rmdir()
        return
    raise FileExistsError(f"{dst} already exists")


def migrate_vault(vault: Path, plan: Plan) -> None:
    # 1) skills: an untouched template copy becomes the new template skill; edited ones are renamed and rewritten
    skills_dir = vault / ".claude" / "skills"
    if skills_dir.is_dir():
        for folder in sorted(p for p in skills_dir.iterdir() if p.is_dir() and p.name in SKILLS):
            new = skills_dir / SKILLS[folder.name]
            skill_md = folder / "SKILL.md"
            template_skill = TEMPLATE / ".claude" / "skills" / SKILLS[folder.name]
            pristine = skill_md.is_file() and OLD_TEMPLATE_SKILLS.get(sha1(skill_md)) == folder.name
            if new.exists():
                plan.warn(f"skill {new.name} already exists; left {folder.relative_to(vault)} untouched")
                continue
            if pristine and template_skill.is_dir():
                plan.do(f"skill {folder.name} → {new.name} (untouched template copy: replaced by the new template)",
                        lambda f=folder, n=new, t=template_skill: (shutil.rmtree(f), shutil.copytree(t, n)))
            else:
                def rename_skill(f=folder, n=new):
                    shutil.move(str(f), str(n))
                    md = n / "SKILL.md"
                    if md.is_file():
                        md.write_text(rewrite_note(md.read_text(encoding="utf-8"), is_skill=True), encoding="utf-8", newline="")
                plan.do(f"skill {folder.name} → {new.name} (edited: renamed, frontmatter and paths rewritten)", rename_skill)
                if not template_skill.is_dir():
                    plan.warn(f"skill {folder.name} is not in the template; its instructions may still mention old field names")

    # 2) vault CLAUDE.md
    claude_md = vault / "CLAUDE.md"
    if claude_md.is_file() and sha1(claude_md) in OLD_TEMPLATE_CLAUDE_MD:
        plan.do("CLAUDE.md → the new template (it was an untouched copy)",
                lambda: shutil.copy2(TEMPLATE / "CLAUDE.md", claude_md))
    elif claude_md.is_file() and "vida/" in claude_md.read_text(encoding="utf-8"):
        plan.warn("CLAUDE.md was edited by hand: review it against vault-template/CLAUDE.md (paths were rewritten)")

    # 3) routines that came from the template get the English slug
    routines = vault / "vida" / "rotinas"
    if routines.is_dir():
        for path in sorted(routines.glob("*.md")):
            if path.stem in ROUTINES and not (routines / f"{ROUTINES[path.stem]}.md").exists():
                plan.do(f"vida/rotinas/{path.name} → {ROUTINES[path.stem]}.md",
                        lambda p=path: p.rename(p.with_name(f"{ROUTINES[p.stem]}.md")))

    # 4) folders and files
    for old, new in MOVES:
        src, dst = vault / old, vault / new
        if src.exists():
            plan.do(f"{old} → {new}", lambda s=src, d=dst: _merge_move(s, d))

    # 5) subject folders (_anotacoes, _fontes)
    for studies in (vault / "wiki" / "studies", vault / "wiki" / "estudos"):
        if not studies.is_dir():
            continue
        for subject in sorted(p for p in studies.iterdir() if p.is_dir()):
            for old, new in SUBJECT_FOLDERS.items():
                if (subject / old).is_dir():
                    plan.do(f"{subject.relative_to(vault).as_posix()}/{old} → {new}",
                            lambda s=subject / old, d=subject / new: _merge_move(s, d))

    # 6) note contents: frontmatter keys/values, receipt headings and path references
    changed = []
    for path in sorted(vault.rglob("*.md")):
        rel = path.relative_to(vault)
        if rel.parts[0] in (".git", ".obsidian", ".trash"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        new = rewrite_note(text, is_skill=path.name == "SKILL.md")
        if new != text:
            changed.append((path, new))
    if changed:
        def write_all():
            for path, new in changed:
                # The file may have moved in the steps above: find it again by its new location.
                target = path if path.exists() else _moved(vault, path)
                if target and target.exists():
                    target.write_text(rewrite_note(target.read_text(encoding="utf-8"), is_skill=target.name == "SKILL.md"),
                                      encoding="utf-8", newline="")
        plan.do(f"rewrite the frontmatter/paths of {len(changed)} note(s)", write_all)


def _moved(vault: Path, old: Path) -> Path | None:
    rel = old.relative_to(vault).as_posix()
    for pattern, repl in PATHS:
        rel = re.sub(r"(?<![\w-])" + pattern, repl, rel)
    for o, n in ROUTINES.items():
        rel = re.sub(rf"^life/routines/{re.escape(o)}\.md$", f"life/routines/{n}.md", rel)
    for o, n in SKILLS.items():
        rel = rel.replace(f".claude/skills/{o}/", f".claude/skills/{n}/")
    rel = rel.replace("wiki/about-me/perfil.md", "wiki/about-me/profile.md")
    return vault / rel


# ---------- bridge/dados → bridge/data ----------

def _rename_keys(data, mapping: dict):
    if isinstance(data, dict):
        return {mapping.get(k, k): _rename_keys(v, mapping) for k, v in data.items()}
    if isinstance(data, list):
        return [_rename_keys(v, mapping) for v in data]
    return data


EPHEMERAL_KEYS = {"titulo": "title", "texto": "text", "quando": "created", "expira": "expires", "origem": "source",
                  "rotina": "routine", "sessao_id": "session_id", "chave": "key", "pesquisa": "research",
                  "tema": "topic", "tipo": "kind", "pedido": "request", "efemero_id": "ephemeral_id"}
PROPOSAL_KEYS = {"evento": "event", "titulo": "title", "data": "date", "dia_inteiro": "all_day",
                 "hora_inicio": "start_time", "hora_fim": "end_time", "repetir": "repeat", "avisos_min": "reminders_min",
                 "local": "location", "descricao": "description", "pedido": "request", "origem": "source",
                 "criada": "created", "expira": "expires", "sessao_id": "session_id"}
VALUES = {"pesquisa": "research", "plano": "plan", "anual": "yearly", "mensal": "monthly", "semanal": "weekly",
          "diaria": "daily", "pendente": "pending", "confirmada": "confirmed", "rotina": "routine", "voz": "voice"}


def _map_values(data, keys: tuple[str, ...]):
    if isinstance(data, dict):
        return {k: (VALUES.get(v, v) if k in keys and isinstance(v, str) else _map_values(v, keys)) for k, v in data.items()}
    return data


def migrate_data(old: Path, new: Path, plan: Plan) -> None:
    if not old.is_dir():
        return
    if new.exists():
        plan.warn(f"{new} already exists; {old} left untouched")
        return

    def run():
        shutil.move(str(old), str(new))
        for a, b in (("efemeros", "ephemeral"), ("propostas", "proposals"), ("modelos", "models")):
            if (new / a).exists():
                (new / a).rename(new / b)
        if (new / "lembretes_estado.json").exists():
            (new / "lembretes_estado.json").rename(new / "reminders_state.json")
        push = new / "push"
        if (push / "vapid_privada.pem").exists():
            (push / "vapid_privada.pem").rename(push / "vapid_private.pem")
        if (push / "inscricoes.json").exists():
            items = json.loads((push / "inscricoes.json").read_text(encoding="utf-8"))
            items = _rename_keys(items, {"aparelho": "device", "desde": "since"})
            (push / "subscriptions.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
            (push / "inscricoes.json").unlink()
        for path in (new / "ephemeral").glob("*.json") if (new / "ephemeral").is_dir() else []:
            data = _map_values(_rename_keys(json.loads(path.read_text(encoding="utf-8")), EPHEMERAL_KEYS), ("kind", "source"))
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        for path in (new / "proposals").glob("*.json") if (new / "proposals").is_dir() else []:
            data = _map_values(_rename_keys(json.loads(path.read_text(encoding="utf-8")), PROPOSAL_KEYS), ("repeat", "status", "source"))
            path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

    plan.do(f"{old} → {new} (push subscriptions, VAPID key, voice models, ephemeral items and proposals)", run)


# ---------- .env ----------

def migrate_env(env: Path, language: str, plan: Plan) -> None:
    if not env.is_file():
        return
    text = env.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    out, renamed = [], []
    present = {line.split("=", 1)[0].strip() for line in lines if "=" in line and not line.lstrip().startswith("#")}
    known = {"TIER2_MODEL", "TIER3_MODEL", "TIER3_TIMEOUT_MIN", *ENV_NAMES}
    for line in lines:
        m = re.match(r"^\s*(GANDALF|JEV)_(\w+)=(.*)$", line)
        if m and m.group(2) in known and (m.group(2) in ENV_NAMES or m.group(1) == "JEV"):
            name = f"GANDALF_{ENV_NAMES.get(m.group(2), m.group(2))}"
            if name not in present:
                out.append(f"{name}={m.group(3)}")
                renamed.append(f"{m.group(1)}_{m.group(2)} → {name}")
                present.add(name)
                continue
        if (m := re.match(r"^\s*(PUSH_CONTATO|LIFEOS_DADOS)=(.*)$", line)):
            name = {"PUSH_CONTATO": "PUSH_CONTACT", "LIFEOS_DADOS": "GANDALF_DATA_DIR"}[m.group(1)]
            out.append(f"{name}={m.group(2)}")
            renamed.append(f"{m.group(1)} → {name}")
            continue
        out.append(line)
    if "GANDALF_LANGUAGE" not in present:
        out += ["", "# The assistant's language (what Gandalf says and writes). Code and HUD are always in English.",
                f"GANDALF_LANGUAGE={language}"]
        renamed.append(f"+ GANDALF_LANGUAGE={language}")
    if renamed:
        plan.do(".env: " + "; ".join(renamed), lambda: env.write_text("\n".join(out) + "\n", encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="apply the changes (default: dry run)")
    parser.add_argument("--language", default="pt-BR", help="GANDALF_LANGUAGE to add to the .env if missing")
    parser.add_argument("--vault", type=Path, default=None)
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows consoles default to cp1252

    vault = (args.vault or get_settings().vault_path).resolve()
    plan = Plan(apply=args.apply)
    if vault.is_dir():
        migrate_vault(vault, plan)
    else:
        plan.warn(f"vault not found at {vault}")
    migrate_data(REPO_ROOT / "bridge" / "dados", REPO_ROOT / "bridge" / "data", plan)
    migrate_env(REPO_ROOT / ".env", args.language, plan)

    print(f"{'Applied' if args.apply else 'Dry run (use --apply to change files)'}: {vault}")
    for step in plan.steps:
        print(f"  - {step}")
    if not plan.steps:
        print("  nothing to migrate")
    for warning in plan.warnings:
        print(f"  ! {warning}")
    if args.apply and plan.steps:
        print("Then run `uv run python -m app.setup_vault` to add what the new template has.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
