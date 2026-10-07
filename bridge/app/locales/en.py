"""English: Tier 1 rules and replies.

Every regex runs on normalized text (lowercase, no accents). Group names are shared with `pt_br.py`.
"""

import re
from datetime import date, time, timedelta

NAME = "English"
WHISPER_LANGUAGE = "en"
KOKORO_LANGUAGE = "en-gb"

# Monday first (date.weekday()).
WEEKDAYS_NORM = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
# Sunday first (cron: 0 = Sunday).
WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]


def date_long(d: date) -> str:
    return f"{WEEKDAY_NAMES[d.weekday()]}, {MONTH_NAMES[d.month - 1]} {d.day}"


def short_date(d: date) -> str:
    return f"{MONTH_NAMES[d.month - 1][:3]} {d.day}"


# ---------- dates in free text (Tier 1 and reminders) ----------

# "10/15" is month/day.
DAY_FIRST = False
RELATIVE_DAYS: list[tuple[str, int]] = [
    (r"\b(?:for |by |on )?(?:the )?day after tomorrow\b", 2),
    (r"\b(?:for |by )?tomorrow\b", 1),
    (r"\b(?:for |by )?today\b", 0),
]


def weekday_pattern(day: str) -> str:
    return rf"\b(?:for |on |by |until |due )?(?:next |this )?{day}\b"


# Leftover words at the end of a task once the date is removed ("pay the bill by").
TRAILING_WORDS_RE = re.compile(r"\s+(for|by|on|until|due|at|in)\s*$")
HIGH_PRIORITY_RE = re.compile(r"\b(urgent|important|high priority)\b")

# Date, time or an appointment in a note: it may be a reminder/event, so Tier 2 decides.
DATE_HINT_RE = re.compile(
    r"\b(today|tomorrow|tonight|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"birthday|bday|appointment|meeting|therapy|exam|remind|every day|every|each|"
    r"january|february|march|april|june|july|august|september|october|november|december)\b"
    r"|\b\d{1,2}/\d{1,2}\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b"
)

# ---------- Tier 1 commands ----------
# Order matters: add/note before "tasks" (more generic). `rest` groups are cut from the original text.
_PREFIX = r"^(?:(?:hey |ok )?gandalf,? )?(?:please )?"
INTENTS: list[tuple[str, str]] = [
    ("add_task", _PREFIX + r"(?:add|create|new)(?: a)?(?: new)? task:? (?P<rest>.+)$"),
    ("note", _PREFIX + r"(?:note(?: down)?|jot(?: down)?|write down|capture)(?: that)?:? (?P<rest>.+)$"),
    ("reminders", _PREFIX + r"(?:show |list )?(?:what are )?(?:my )?(?:pending )?reminders(?: for today| today)?$"),
    ("agenda", _PREFIX + r"(?:what(?: do|'?ve| have)? i (?:have|got)(?: on)?|what'?s on my (?:agenda|calendar|schedule)"
               r"|(?:my )?(?:agenda|calendar|schedule|appointments))(?: (?:for )?(?P<when>today|tomorrow))?$"),
    ("priorities", _PREFIX + r"(?:what are )?(?:my )?(?:top )?priorities(?: for today| today)?$"),
    ("tasks", _PREFIX + r"(?:show |list )?(?:what are )?(?:my )?(?:open |pending )?tasks(?: for today| today)?$"),
    ("routines", _PREFIX + r"(?:show |list )?(?:what are )?(?:my )?routines$"),
]
TOMORROW_WORD = "tomorrow"

# ---------- reminders ("remind me to X in 30 min") ----------

CRON_DAYS = {"sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6}
NUMBERS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "ten": 10, "fifteen": 15,
           "twenty": 20, "thirty": 30}

# Looks like an appointment: with an absolute date/time, Tier 2 decides (it may be a calendar event).
APPOINTMENT_RE = re.compile(
    r"\b(appointment|meeting|therapy|therapist|doctor|dentist|birthday|bday|exam|interview|flight|class|lecture|"
    r"event|party|wedding|graduation|concert|show|trip|call with|(?:dinner|lunch|coffee|date) with)\b"
)
TRIGGER_RE = re.compile(
    r"^(?:(?:hey |ok )?gandalf,? )?(?:please )?"
    r"(?:remind me|alert me|notify me|ping me|(?:set|create|add|new)?\s*(?:a |an )?reminder:?)"
    r"(?:\s+(?:to|that|about))?\s+(?P<rest>.+)$"
)
RELATIVE_RE = re.compile(
    r"\b(?:in|within)\s+"
    r"(?:(?P<half>half an hour|a half hour)|(?P<n>\d+|a|an|one|two|three|four|five|ten|fifteen|twenty|thirty)\s*"
    r"(?P<u>minutes?|mins?|min|m|hours?|hrs?|hr|h)\b(?:\s*and\s*(?:(?P<and_half>a half)|(?P<n2>\d+)\s*(?:minutes?|mins?|min|m)?))?"
    r"|(?P<hm_h>\d+)h(?P<hm_m>\d{2}))"
)
_PERIOD = r"(?:\s+(?:in the\s+|at\s+)?(?P<per>morning|afternoon|evening|night|tonight))?"
ABSOLUTE_RE = re.compile(
    r"\b(?:(?:at|around|by)\s+)?"
    r"(?:(?P<word>noon|midday|midnight)"
    r"|(?P<h>\d{1,2})(?::(?P<m>\d{2}))?\s*(?P<ampm>am|pm|a\.m\.|p\.m\.)(?!\w)"
    r"|(?P<h24>\d{1,2}):(?P<m24>\d{2})\b)" + _PERIOD
)
ABSOLUTE_AT_RE = re.compile(r"\bat\s+(?P<h>\d{1,2})\b(?![:/])" + _PERIOD)
EVERY_DAY_RE = re.compile(r"\b(?:every ?day|each day|daily|every night|every morning|nightly)\b")
WEEKDAYS_ONLY_RE = re.compile(r"\b(?:on |every )?(?:weekdays|week days|monday (?:to|through|thru) friday)\b")
WEEKEND_RE = re.compile(r"\b(?:on |every )?(?:the )?weekends?\b")
DAY_NAME = r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
EVERY_RE = re.compile(
    rf"\b(?:(?:every|each)\s+{DAY_NAME}s?|(?:on\s+)?{DAY_NAME}s)\b((?:\s*(?:,|and)\s*(?:every\s+)?{DAY_NAME}s?)*)"
)
LEADING_CONNECTORS = re.compile(r"^(?:(?:to|that|about|of)\s+)+")
TRAILING_CONNECTORS = re.compile(r"(?:\s+(?:to|at|on|in|for|and|that|today|by))+$")


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
        return time(0, 0) if groups["word"] == "midnight" else time(12, 0)
    if groups.get("h24"):
        h, minute = int(groups["h24"]), int(groups["m24"])
    else:
        h, minute = int(groups["h"]), int(groups.get("m") or 0)
    ampm = (groups.get("ampm") or "").replace(".", "")
    if ampm == "pm" and h < 12:
        h += 12
    elif ampm == "am" and h == 12:
        h = 0
    elif not ampm and groups.get("per") in ("afternoon", "evening", "night", "tonight") and h < 12:
        h += 12
    if h > 23 or minute > 59:
        return None
    return time(h, minute)


# ---------- replies (Tier 1, captures and router) ----------

MESSAGES = {
    "today": "today",
    "tomorrow": "tomorrow",
    "all_day": "all day",
    "agenda.title": "**{label}, {date}**",
    "agenda.empty": "- Nothing on the calendar.",
    "agenda.tasks_for": "Tasks for {label}:",
    "task.overdue_since": "overdue since {date}",
    "task.due_today": "today",
    "task.due_by": "by {date}",
    "task.high_priority": "high priority",
    "priorities.none": "No open tasks. 🌱",
    "priorities.title": "Your 3 priorities:",
    "tasks.title": "You have {count} open task(s):",
    "tasks.more": "…and {count} more.",
    "task.added": "Task added{due}: {text}",
    "task.added_due": " for {date}",
    "note.saved": "Noted in `{path}`.",
    "reminders.none": "No pending reminders.",
    "reminders.title": "Your reminders:",
    "routines.none": "No routines in life/routines/.",
    "routines.title": "Your routines:",
    "routine.active": "active",
    "routine.paused": "paused",
    "when.at": "{day} at {time}{extra}",
    "when.in_minutes": " (in {minutes} min)",
    "when.in_hours": " (in {hours}h{minutes:02d})",
    "event.all_day": "all day",
    "repeat.yearly": "every year",
    "repeat.monthly": "every month",
    "repeat.weekly": "every week",
    "repeat.daily": "every day",
    "capture.reminder": "⏰ Reminder: {text} — {when}.",
    "capture.task": "✅ Task: {text}{due}.",
    "capture.task_due": " — by {date}",
    "capture.note": "📝 Noted in `{path}`.",
    "capture.event": "📅 Proposed Google Calendar event: {event}. Check it and tap **Add to calendar**.",
    "capture.failed": "⚠️ I couldn't save one item ({type}): {error}.",
    "capture.nothing": "Nothing to save.",
    "capture.no_devices": "\n\n_Turn on notifications on the Today screen to get the alert on your phone._",
    "learn.profile": "🧠 I'll remember: {fact}",
    "learn.raw": "🧠 Kept for the wiki: {fact} (`{path}`)",
    "router.not_understood": (
        "That request isn't among my quick spells, friend. The ones I know by heart: "
        "\"what do I have today/tomorrow?\", \"my priorities\", \"my tasks\", "
        "\"add task …\", \"note …\", \"remind me to … in 30 min\", \"my reminders\" and \"my routines\"."
    ),
    "router.limit": "You have already used {used} AI calls today (limit {limit}). Confirm to continue.",
    "router.tier3": "I opened a Claude Code session for this.",
    "router.escalated": "This needs work in the memory; I opened a Claude Code session.",
    "router.research": "I'll research this on the web: **{topic}**. When it's done the result shows up here and you decide whether to save it in the memory.",
    "tier2.no_answer": "I couldn't come up with an answer right now.",
    "speech.details_on_screen": "The details are on the screen.",
    # Written into memory files created by the code.
    "file.tasks_header": "# Tasks\n",
    "file.learned_header": (
        "# Learned\n\n"
        "Facts Gandalf picked up from your conversations, newest at the bottom. Edit or delete any line; "
        "the wiki check (lint) folds them into the other notes.\n"
    ),
    "file.learned_index_line": "- [[wiki/about-me/learned|Learned]]: facts Gandalf picked up from conversations.",
    "file.reminders_header": (
        "# Reminders\n\n"
        "Gandalf's alerts (phone/PC notification). You can edit by hand:\n"
        "`- [ ] text ⏰ YYYY-MM-DD HH:MM` (once) or `- [ ] text 🔁 <cron>` (repeats; e.g. `0 22 * * *` = every day at 22:00).\n"
        "Checking [x] ends it (or pauses it, if it repeats).\n\n"
    ),
    "file.no_subjects": "_No subjects yet._",
    "file.docx_extracted": "(text extracted from {name})",
}
