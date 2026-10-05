"""Reminders, triage (reminder × event × task × note), proposed events and push."""

from datetime import timedelta

import pytest

from app import proposals, push
from app import reminders as reminder_scheduler
from app.gandalf import tier3, triage
from app.vault import reminders
from conftest import NOW, TZ
from test_tier2_tier3 import wait_for_end


# ---------- the life/reminders.md file ----------

def test_add_read_and_format(vault):
    x = reminders.add(vault, TZ, "Take the laundry out", when=NOW.replace(hour=18, minute=30))
    r = reminders.add(vault, TZ, "Take medicine", recurrence="0 22 * * *")
    text = (vault / "life/reminders.md").read_text(encoding="utf-8")
    assert text.startswith("# Reminders")
    assert f"- [ ] Take the laundry out ⏰ 2026-10-03 18:30 🆔 {x.id}" in text
    assert f"- [ ] Take medicine 🔁 0 22 * * * 🆔 {r.id}" in text
    items = reminders.read(vault, TZ)
    assert [y.text for y in items] == ["Take the laundry out", "Take medicine"]
    assert items[1].recurring and items[0].when.hour == 18


def test_new_file_header_follows_the_language(vault, pt_br):
    reminders.add(vault, TZ, "Tomar remédio", recurrence="0 22 * * *")
    assert (vault / "life/reminders.md").read_text(encoding="utf-8").startswith("# Lembretes")


def test_handwritten_line_gets_an_id_when_edited(vault):
    (vault / "life/reminders.md").write_text("# Reminders\n\n- [ ] Water the plants ⏰ 2026-10-04 08:00\n- [ ] item without time\n", encoding="utf-8")
    [x] = reminders.read(vault, TZ)  # a checklist item without a time is not a reminder
    assert x.id.startswith("l")
    new = reminders.update(vault, TZ, x.id, done=True, now=NOW)
    assert not new.id.startswith("l") and new.done
    assert "🆔 " + new.id in (vault / "life/reminders.md").read_text(encoding="utf-8")


def test_validations(vault):
    with pytest.raises(reminders.InvalidReminder):
        reminders.add(vault, TZ, "x")  # no time
    with pytest.raises(reminders.InvalidReminder):
        reminders.add(vault, TZ, "x", recurrence="this is not cron")
    with pytest.raises(reminders.InvalidReminder):
        reminders.add(vault, TZ, "has ⏰ inside", when=NOW)


# ---------- Tier 1: reminders without AI ----------

@pytest.mark.parametrize(
    ("phrase", "text", "when", "recurrence"),
    [
        ("remind me to take the laundry out in 30 minutes", "Take the laundry out", "2026-10-03 09:45", None),
        ("remind me in half an hour to take the cake out of the oven", "Take the cake out of the oven", "2026-10-03 09:45", None),
        ("remind me in 2 hours to call mom", "Call mom", "2026-10-03 11:15", None),
        ("Gandalf, remind me tomorrow at 9am to call the bank", "Call the bank", "2026-10-04 09:00", None),
        ("remind me at 8 to wake up early", "Wake up early", "2026-10-04 08:00", None),  # 8:00 already passed: tomorrow
        ("remind me on friday at 8pm to watch the game", "Watch the game", "2026-10-09 20:00", None),
        ("remind me to take my medicine every day at 10pm", "Take my medicine", None, "0 22 * * *"),
        ("reminder: gym every monday and wednesday at 7am", "Gym", None, "0 7 * * 1,3"),
        ("remind me to drink water on weekdays at 3pm", "Drink water", None, "0 15 * * 1,2,3,4,5"),
    ],
)
def test_parse_reminder(phrase, text, when, recurrence):
    r = triage.parse_reminder(phrase, NOW)
    assert r is not None and r.text == text
    assert (f"{r.when:%Y-%m-%d %H:%M}" if r.when else None) == when
    assert r.recurrence == recurrence


@pytest.mark.parametrize(
    "phrase",
    [
        "remind me that Arthur's birthday is on 10/3",  # yearly date: Tier 2 (event)
        "remind me about the dentist appointment tomorrow at 2pm",  # appointment: Tier 2 decides (calendar)
        "remind me to buy bread",  # no time: Tier 2 (task)
        "remind me today at 8 to do something",  # already passed: ambiguous
        "notify me in 5 min",  # nothing to remind
    ],
)
def test_parse_leaves_it_to_tier2(phrase):
    assert triage.parse_reminder(phrase, NOW) is None


@pytest.mark.parametrize(
    ("phrase", "text", "when", "recurrence"),
    [
        ("me lembre de pegar a roupa na máquina em 30 minutos", "Pegar a roupa na máquina", "2026-10-03 09:45", None),
        ("me avisa em meia hora de tirar o bolo do forno", "Tirar o bolo do forno", "2026-10-03 09:45", None),
        ("me avisa daqui a 2 horas pra ligar pra mãe", "Ligar pra mãe", "2026-10-03 11:15", None),
        ("Gandalf, me lembra amanhã às 9h de ligar pro banco", "Ligar pro banco", "2026-10-04 09:00", None),
        ("me lembra às 8 de acordar cedo", "Acordar cedo", "2026-10-04 08:00", None),  # 8h já passou: amanhã
        ("me lembra sexta às 8 da noite de ver o jogo", "Ver o jogo", "2026-10-09 20:00", None),
        ("me lembra de tomar remédio todo dia às 22h", "Tomar remédio", None, "0 22 * * *"),
        ("lembrete: academia toda segunda e quarta às 7h", "Academia", None, "0 7 * * 1,3"),
        ("me lembra de beber água em dias úteis às 15h", "Beber água", None, "0 15 * * 1,2,3,4,5"),
    ],
)
def test_parse_reminder_in_portuguese(pt_br, phrase, text, when, recurrence):
    r = triage.parse_reminder(phrase, NOW)
    assert r is not None and r.text == text
    assert (f"{r.when:%Y-%m-%d %H:%M}" if r.when else None) == when
    assert r.recurrence == recurrence


@pytest.mark.parametrize(
    "phrase",
    [
        "me lembra que dia 3/10 é aniversário do Artur",
        "me lembra da consulta amanhã às 14h",
        "me lembra de comprar pão",
        "me lembra hoje às 8 de algo",
        "me notifica em 5 min",
    ],
)
def test_parse_leaves_it_to_tier2_in_portuguese(pt_br, phrase):
    assert triage.parse_reminder(phrase, NOW) is None


def test_ask_tier1_reminder_saves_and_replies(client, vault):
    r = client.post("/ask", json={"text": "remind me to take the laundry out in 30 minutes"}).json()
    assert r["tier"] == 1 and r["intent"] == "reminder"
    assert "today at 09:45 (in 30 min)" in r["reply"]
    assert "Turn on notifications" in r["reply"]  # no device subscribed
    [x] = reminders.read(vault, TZ)
    assert x.text == "Take the laundry out"
    r = client.post("/ask", json={"text": "my reminders"}).json()
    assert r["intent"] == "reminders" and "Take the laundry out" in r["reply"]


def test_ask_tier1_reminder_in_portuguese(client, vault, pt_br):
    r = client.post("/ask", json={"text": "me lembra de pegar a roupa na máquina em 30 minutos"}).json()
    assert r["tier"] == 1 and r["intent"] == "reminder"
    assert "hoje às 09:45 (em 30 min)" in r["reply"] and "Ative as notificações" in r["reply"]
    r = client.post("/ask", json={"text": "meus lembretes"}).json()
    assert r["intent"] == "reminders" and r["reply"].startswith("Seus lembretes:")


def test_note_with_a_date_goes_to_tier2(client, vault):
    r = client.post("/ask", json={"text": "note that today is my brother Arthur's birthday"}).json()
    assert r["tier"] == 2  # didn't land in raw/ through Tier 1
    r = client.post("/ask", json={"text": "note: the book Dune looks good"}).json()
    assert r["tier"] == 1 and r["intent"] == "note"


# ---------- Tier 2: capture ----------

def test_tier2_capture_saves_each_item_in_the_right_place(client, vault):
    r = client.post("/ask", json={"text": "CAPTURE Arthur's birthday today"}).json()
    assert r["tier"] == 2 and r["intent"] == "capture"
    d = r["data"]
    # the event does NOT go straight to the calendar: it becomes a proposal to confirm
    [p] = d["proposals"]
    assert p["event"]["title"] == "Arthur's birthday (brother)" and p["event"]["repeat"] == "yearly"
    assert p["event"]["all_day"] and p["event"]["reminders_min"] == [900]
    assert "Add to calendar" in r["reply"]
    assert d["tasks"][0]["text"] == "Buy a present" and d["tasks"][0]["due"] == "2026-10-09"
    texts = {x.text: x for x in reminders.read(vault, TZ)}
    assert texts["Call Arthur"].when.hour == 18
    assert texts["Take medicine"].recurrence == "0 22 * * *"


def test_execute_rejects_a_reminder_in_the_past(vault):
    text, data = triage.execute(vault, TZ, [{"type": "reminder", "text": "x", "when": "2026-10-02T10:00"}], NOW, "p", "hud")
    assert data["errors"] and "already passed" in text


# ---------- proposed events ----------

def test_create_event_args():
    e = proposals.normalize({"title": "Therapy", "date": "2026-10-06", "start_time": "15:00", "repeat": "weekly"})
    assert e.end_time == "16:00" and e.reminders_min == [30]
    a = proposals.create_event_args(e, "America/Sao_Paulo")
    assert a["startTime"] == "2026-10-06T15:00:00-03:00" and a["endTime"] == "2026-10-06T16:00:00-03:00"
    assert a["recurrenceData"] == ["RRULE:FREQ=WEEKLY"] and not a["allDay"]
    bday = proposals.create_event_args(proposals.normalize({"title": "Bday", "date": "2026-10-03", "all_day": True}), "America/Sao_Paulo")
    assert bday["allDay"] and bday["availability"] == "AVAILABILITY_FREE"
    assert bday["endTime"].startswith("2026-10-04") and bday["overrideReminders"] == [{"method": "popup", "minutes": 900}]


def test_confirming_a_proposal_opens_a_restricted_schedule_event_session(client, vault):
    r = client.post("/ask", json={"text": "CAPTURE"}).json()
    pid = r["data"]["proposals"][0]["id"]
    edited = {**r["data"]["proposals"][0]["event"], "title": "Arthur bday"}
    c = client.post(f"/proposals/{pid}/confirm", json={"event": edited})
    assert c.status_code == 201
    session = c.json()["session"]
    assert session["skill"] == "schedule-event" and session["output"] == "action"
    assert '"summary": "Arthur bday"' in session["task"]
    s = tier3.manager(vault).get(session["id"])
    args = tier3.manager(vault)._args(s)
    tools = args[args.index("--allowedTools") + 1]
    assert "create_event" in tools and "Write" not in tools and "delete_event" not in tools
    assert args[args.index("--model") + 1] == "haiku"
    wait_for_end(client, session["id"])
    assert client.post(f"/proposals/{pid}/confirm", json={}).status_code == 409  # never creates twice
    assert client.delete(f"/proposals/{pid}").status_code == 204


# ---------- scheduler: firing, lateness and recurring ----------

def test_firing_a_one_off_marks_it_done_and_publishes(vault, now, monkeypatch):
    sent = []
    monkeypatch.setattr(push, "send", lambda n: sent.append(n) or 1)
    x = reminders.add(vault, TZ, "Get the laundry", when=NOW - timedelta(minutes=40))
    s = reminder_scheduler.ReminderScheduler(vault, TZ)
    ev = s.fire(x.id, late_since=x.when)
    assert ev["late"] and sent[0].title == "⏰ Get the laundry"
    assert sent[0].reminder_id == x.id  # one-off: notification with "Snooze"
    [y] = reminders.read(vault, TZ)
    assert y.done and y.done_at == NOW.replace(second=0)  # the file stores HH:MM
    assert s.fire(x.id) is None  # never alerts twice


def test_reload_recovers_overdue_one_offs_and_a_missed_recurring(vault, monkeypatch):
    now = NOW.replace(hour=22, minute=30)
    monkeypatch.setattr("app.clock.now", lambda: now)
    overdue = reminders.add(vault, TZ, "Overdue", when=now - timedelta(hours=2))
    future = reminders.add(vault, TZ, "Future", when=now + timedelta(hours=1))
    medicine = reminders.add(vault, TZ, "Medicine", recurrence="0 22 * * *")
    s = reminder_scheduler.ReminderScheduler(vault, TZ)
    s._scheduler.start(paused=True)
    try:
        s.reload(recover=True)
        ids = {j.id for j in s._scheduler.get_jobs()}
        assert {f"late-{overdue.id}", f"late-{medicine.id}", future.id, medicine.id} <= ids
        # Already alerted after 22:00: not recovered again
        reminder_scheduler._mark_state(medicine.id, now.replace(minute=1))
        s.reload(recover=True)
        assert f"late-{medicine.id}" not in {j.id for j in s._scheduler.get_jobs()}
    finally:
        s.stop()


# ---------- API ----------

def test_api_reminders_crud_and_snooze(client, vault):
    r = client.post("/reminders", json={"text": "Call John", "when": "2026-10-03T10:00:00"})
    assert r.status_code == 201
    rid = r.json()["id"]
    assert r.json()["next"].startswith("2026-10-03T10:00")
    assert client.post("/reminders", json={"text": "x"}).status_code == 422
    r = client.patch(f"/reminders/{rid}", json={"snooze_min": 10})
    assert r.json()["when"].startswith("2026-10-03T09:25")
    client.patch(f"/reminders/{rid}", json={"done": True})
    items = client.get("/reminders").json()
    assert items[0]["done"] and items[0]["next"] is None
    assert client.delete(f"/reminders/{rid}").status_code == 204
    assert client.get("/reminders").json() == []


def test_push_key_subscription_and_test_without_devices(client):
    key = client.get("/push/key").json()["key"]
    assert len(key) == 87  # uncompressed P-256 point in base64url
    assert client.get("/push/key").json()["key"] == key  # key persisted
    assert client.post("/push/test").status_code == 409
    sub = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "x", "auth": "y"}}
    assert client.post("/push/subscribe", json={"subscription": sub, "device": "iPhone"}).status_code == 201
    assert client.get("/push/subscriptions").json()[0]["device"] == "iPhone"
    assert client.post("/push/unsubscribe", json={"endpoint": sub["endpoint"]}).json()["removed"]


def test_push_removes_an_unsubscribed_device(monkeypatch):
    import pywebpush

    push.subscribe({"endpoint": "https://push.example/dead", "keys": {"p256dh": "x", "auth": "y"}}, "old")

    class Resp:
        status_code = 410

    def fail(*a, **k):
        raise pywebpush.WebPushException("gone", response=Resp())

    monkeypatch.setattr(pywebpush, "webpush", fail)
    assert push.send(push.Notification("t")) == 0
    assert push.subscriptions() == []


def test_daily_notice(vault, monkeypatch):
    from app.routines.actions import ACTIONS

    sent = []
    monkeypatch.setattr(push, "send", lambda n: sent.append(n) or 2)
    reminders.add(vault, TZ, "Something", when=NOW + timedelta(hours=2))
    text = ACTIONS["daily-notice"][1](vault, NOW)
    assert "reminder" in sent[0].body and "2 device" in text


def test_routine_edit_schedule_and_notify(client, vault):
    r = client.post("/routines", json={"name": "Push test", "cron": "0 7 * * *", "tier": 1, "action": "git-commit", "notify": True})
    assert r.status_code == 201 and r.json()["notify"]
    assert "notify: true" in (vault / "life/routines/push-test.md").read_text(encoding="utf-8")
    r = client.patch("/routines/push-test", json={"cron": "30 8 * * 1-5", "name": "Test", "notify": False})
    assert r.json()["cron"] == "30 8 * * 1-5" and r.json()["schedule"] == "Mon–Fri at 08:30" and not r.json()["notify"]
    assert "notify" not in (vault / "life/routines/push-test.md").read_text(encoding="utf-8")
