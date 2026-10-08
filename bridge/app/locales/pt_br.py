"""Brazilian Portuguese: Tier 1 rules and replies.

Every regex runs on normalized text (lowercase, no accents). Group names are shared with `en.py`.
"""

import re
from datetime import date, time, timedelta

NAME = "Brazilian Portuguese (pt-BR)"
WHISPER_LANGUAGE = "pt"
KOKORO_LANGUAGE = "pt-br"

# Monday first (date.weekday()).
WEEKDAYS_NORM = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]
WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
# Sunday first (cron: 0 = Sunday).
WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
               "agosto", "setembro", "outubro", "novembro", "dezembro"]


def date_long(d: date) -> str:
    return f"{WEEKDAY_NAMES[d.weekday()]}, {d.day} de {MONTH_NAMES[d.month - 1]}"


def short_date(d: date) -> str:
    return f"{d:%d/%m}"


# ---------- dates in free text (Tier 1 and reminders) ----------

# "15/10" is day/month.
DAY_FIRST = True
RELATIVE_DAYS: list[tuple[str, int]] = [
    (r"\b(?:para |pra )?depois de amanha\b", 2),
    (r"\b(?:para |pra )?amanha\b", 1),
    (r"\b(?:para |pra )?hoje\b", 0),
]


def weekday_pattern(day: str) -> str:
    return rf"\b(?:para |pra |na |no |ate )?(?:proxim[oa] )?{day}(?:-feira)?\b"


# Leftover words at the end of a task once the date is removed ("pagar boleto para").
TRAILING_WORDS_RE = re.compile(r"\s+(para|pra|ate|no|na|em)\s*$")
HIGH_PRIORITY_RE = re.compile(r"\b(urgente|importante|prioridade alta)\b")

# Date, time or an appointment in a note: it may be a reminder/event, so Tier 2 decides.
DATE_HINT_RE = re.compile(
    r"\b(hoje|amanha|ontem|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|"
    r"aniversario|niver|consulta|reuniao|terapia|prova|lembra|lembrar|avisa|todo dia|toda|todos os|"
    r"janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b"
    r"|\b\d{1,2}/\d{1,2}\b|\b\d{1,2}(?::\d{2}|h\d{0,2})\b"
)

# ---------- Tier 1 commands ----------
# Order matters: add/note before "tasks" (more generic). `rest` groups are cut from the original text.
_PREFIX = r"^(?:(?:gandalf|jev),? )?"
INTENTS: list[tuple[str, str]] = [
    ("add_task", _PREFIX + r"(?:adiciona|adicionar|adicione|add|cria|criar|crie|nova|novo)(?: uma)? tarefa:? (?P<rest>.+)$"),
    ("note", _PREFIX + r"(?:anota|anote|anotar|captura|capturar):? (?P<rest>.+)$"),
    ("reminders", _PREFIX + r"(?:quais (?:sao )?(?:os )?)?(?:meus )?lembretes(?: pendentes| de hoje)?$"),
    ("agenda", _PREFIX + r"(?:o que (?:eu )?tenho|qual (?:e )?(?:a )?minha agenda|minha agenda|agenda|compromissos|meus compromissos)"
               r"(?: (?:para |pra |de )?(?P<when>hoje|amanha))?$"),
    ("priorities", _PREFIX + r"(?:quais (?:sao )?(?:as )?)?(?:minhas )?prioridades(?: de hoje| do dia)?$"),
    ("tasks", _PREFIX + r"(?:quais (?:sao )?(?:as )?)?(?:minhas )?tarefas(?: (?:de hoje|pendentes|abertas))?$"),
    ("routines", _PREFIX + r"(?:quais (?:sao )?(?:as )?)?(?:minhas )?rotinas$"),
]
TOMORROW_WORD = "amanha"

# ---------- reminders ("me lembra de X em 30 min") ----------

CRON_DAYS = {"domingo": 0, "segunda": 1, "terca": 2, "quarta": 3, "quinta": 4, "sexta": 5, "sabado": 6}
NUMBERS = {"um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4, "cinco": 5, "dez": 10, "quinze": 15, "vinte": 20}

# Looks like an appointment: with an absolute date/time, Tier 2 decides (it may be a calendar event).
APPOINTMENT_RE = re.compile(
    r"\b(consulta|reuniao|terapia|terapeuta|psicolog[oa]|aniversario|niver|dentista|medic[oa]|prova|entrevista|"
    r"voo|aula|compromisso|evento|festa|casamento|formatura|exame|show|viagem|call|meeting|"
    r"(?:jantar|almoco|cafe|encontro) com)\b"
)
TRIGGER_RE = re.compile(
    r"^(?:(?:gandalf|jev),? )?(?:(?:me )?(?:lembra|lembre|lembrar|avisa|avise|notifica|notifique|alerta|alerte)(?:-me| me)?"
    r"|(?:cria|crie|criar|adiciona|adicione|coloca|coloque|poe|ponha|novo|nova)?\s*(?:um |uma )?lembrete:?)\s+(?P<rest>.+)$"
)
RELATIVE_RE = re.compile(
    r"\b(?:em|daqui a|daqui|dentro de)\s+"
    r"(?:(?P<half>meia hora)|(?P<n>\d+|um|uma|dois|duas|tres|quatro|cinco|dez|quinze|vinte)\s*"
    r"(?P<u>minutos?|mins?|min|m|horas?|hrs?|hr|h)\b(?:\s*e\s*(?:(?P<and_half>meia)|(?P<n2>\d+)\s*(?:minutos?|mins?|min|m)?))?"
    r"|(?P<hm_h>\d+)h(?P<hm_m>\d{2}))"
)
_PERIOD = r"(?:\s+(?:da|de)\s+(?P<per>manha|tarde|noite|madrugada))?"
ABSOLUTE_RE = re.compile(
    r"\b(?:(?:as|a|ao|pelas|pela)\s+)?"
    r"(?:(?P<word>meio-dia|meio dia|meia-noite|meia noite)"
    r"|(?P<h>\d{1,2})(?::(?P<m>\d{2})|h(?P<m2>\d{2})?\b|(?=\s+(?:da|de)\s+(?:manha|tarde|noite|madrugada))))" + _PERIOD
)
ABSOLUTE_AT_RE = re.compile(r"\b(?:as|pelas)\s+(?P<h>\d{1,2})\b(?!/)" + _PERIOD)
EVERY_DAY_RE = re.compile(r"\b(?:todo dia|todos os dias|diariamente|toda noite|toda manha)\b")
WEEKDAYS_ONLY_RE = re.compile(r"\b(?:(?:em |nos )?dias? (?:uteis|de semana)|de segunda a sexta)\b")
WEEKEND_RE = re.compile(r"\b(?:(?:no|nos|todo|todos os) )?fins? de semana\b")
DAY_NAME = r"(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?"
EVERY_RE = re.compile(rf"\b(?:toda|todo|todas as|todos os)\s+{DAY_NAME}s?((?:\s*(?:,|e)\s*(?:toda\s+|todo\s+)?{DAY_NAME}s?)*)")
LEADING_CONNECTORS = re.compile(r"^(?:(?:de|que|pra|para|da|do|sobre)\s+(?:eu\s+)?)+")
TRAILING_CONNECTORS = re.compile(r"(?:\s+(?:de|que|pra|para|e|as|a|no|na|em|hoje))+$")


def _number(v: str) -> int:
    return int(v) if v.isdigit() else NUMBERS[v]


def parse_relative(m: re.Match) -> timedelta:
    if m.group("half"):
        return timedelta(minutes=30)
    if m.group("hm_h"):
        return timedelta(hours=int(m.group("hm_h")), minutes=int(m.group("hm_m")))
    qty = _number(m.group("n"))
    delta = timedelta(hours=qty) if m.group("u").startswith("h") else timedelta(minutes=qty)
    if m.group("and_half"):
        delta += timedelta(minutes=30)
    elif m.group("n2"):
        delta += timedelta(minutes=int(m.group("n2")))
    return delta


def parse_time(m: re.Match) -> time | None:
    groups = m.groupdict()
    if groups.get("word"):
        return time(12, 0) if "dia" in groups["word"] else time(0, 0)
    h = int(groups["h"])
    minute = int(groups.get("m") or groups.get("m2") or 0)
    period = groups.get("per")
    if period in ("tarde", "noite") and h < 12:
        h += 12
    if period == "noite" and h == 24:
        h = 0
    if h > 23 or minute > 59:
        return None
    return time(h, minute)


# ---------- replies (Tier 1, captures and router) ----------

MESSAGES = {
    "today": "hoje",
    "tomorrow": "amanhã",
    "all_day": "dia todo",
    "agenda.title": "**{label}, {date}**",
    "agenda.empty": "- Nenhum compromisso na agenda.",
    "agenda.tasks_for": "Tarefas para {label}:",
    "task.overdue_since": "atrasada desde {date}",
    "task.due_today": "hoje",
    "task.due_by": "até {date}",
    "task.high_priority": "prioridade alta",
    "priorities.none": "Nenhuma tarefa aberta. 🌱",
    "priorities.title": "Suas 3 prioridades:",
    "tasks.title": "Você tem {count} tarefa(s) aberta(s):",
    "tasks.more": "…e mais {count}.",
    "task.added": "Tarefa adicionada{due}: {text}",
    "task.added_due": " para {date}",
    "note.saved": "Anotado em `{path}`.",
    "reminders.none": "Nenhum lembrete pendente.",
    "reminders.title": "Seus lembretes:",
    "routines.none": "Nenhuma rotina cadastrada em life/routines/.",
    "routines.title": "Suas rotinas:",
    "routine.active": "ativa",
    "routine.paused": "pausada",
    "when.at": "{day} às {time}{extra}",
    "when.in_minutes": " (em {minutes} min)",
    "when.in_hours": " (em {hours}h{minutes:02d})",
    "event.all_day": "dia inteiro",
    "repeat.yearly": "todo ano",
    "repeat.monthly": "todo mês",
    "repeat.weekly": "toda semana",
    "repeat.daily": "todo dia",
    "capture.reminder": "⏰ Lembrete: {text} — {when}.",
    "capture.task": "✅ Tarefa: {text}{due}.",
    "capture.task_due": " — até {date}",
    "capture.note": "📝 Anotado em `{path}`.",
    "capture.event": "📅 Proposta para o Google Agenda: {event}. Confira e toque em **Add to calendar**.",
    "capture.failed": "⚠️ Não consegui registrar um item ({type}): {error}.",
    "capture.nothing": "Nada para registrar.",
    "capture.no_devices": "\n\n_Ative as notificações na tela Today para receber o aviso no celular._",
    "learn.profile": "🧠 Vou lembrar: {fact}",
    "learn.raw": "🧠 Guardado para o wiki: {fact} (`{path}`)",
    "router.not_understood": (
        "Esse pedido não está nos meus feitiços rápidos, amigo. Os que conheço de cor: "
        "\"o que tenho hoje/amanhã?\", \"minhas prioridades\", \"minhas tarefas\", "
        "\"adiciona tarefa …\", \"anota …\", \"me lembra de … em 30 min\", \"meus lembretes\" e \"minhas rotinas\"."
    ),
    "router.limit": "Você já usou {used} chamadas de IA hoje (limite {limit}). Confirme para continuar.",
    "router.tier3": "Abri uma sessão do Claude Code para isso.",
    "router.escalated": "Isso precisa de trabalho no memory; abri uma sessão do Claude Code.",
    "router.research": "Vou pesquisar na web: **{topic}**. Quando terminar, o resultado aparece aqui e você decide se guarda no memory.",
    "tier2.no_answer": "Não consegui formular uma resposta agora.",
    "speech.details_on_screen": "Os detalhes estão na tela.",
    # Written into memory files created by the code.
    "file.tasks_header": "# Tarefas\n",
    "file.learned_header": (
        "# Aprendido\n\n"
        "Fatos que o seu assistente captou nas conversas, os mais novos no fim. Edite ou apague qualquer linha; "
        "a checagem do wiki (lint) os incorpora às outras notas.\n"
    ),
    "file.learned_index_line": "- [[wiki/about-me/learned|Aprendido]]: fatos que o seu assistente captou nas conversas.",
    "file.reminders_header": (
        "# Lembretes\n\n"
        "Avisos do seu assistente (notificação no celular/PC). Pode editar à mão:\n"
        "`- [ ] texto ⏰ AAAA-MM-DD HH:MM` (uma vez) ou `- [ ] texto 🔁 <cron>` (repete; ex.: `0 22 * * *` = todo dia 22h).\n"
        "Marcar [x] encerra (ou pausa, se repetir).\n\n"
    ),
    "file.no_subjects": "_Nenhuma matéria ainda._",
    "file.docx_extracted": "(texto extraído de {name})",
}
