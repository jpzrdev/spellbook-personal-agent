import json
from datetime import timedelta

from app import clock, conversations, ephemeral
from app.gandalf import claude_cli, router
from app.memory import recent
from app.memory.reader import read_text

from conftest import NOW
from test_ephemeral import wait_for_session


def _ask(client, text, conversation_id=None, **extra):
    r = client.post("/ask", json={"text": text, "conversation_id": conversation_id, **extra})
    assert r.status_code == 200, r.text
    return r.json()


def _at(monkeypatch, minutes: int):
    monkeypatch.setattr(clock, "now", lambda: NOW + timedelta(minutes=minutes))


# ---------- turns and context ----------

def test_each_request_is_a_turn_and_the_next_one_sees_the_conversation(client, memory):
    first = _ask(client, "what is a derivative")
    cid = first["conversation_id"]
    assert cid and first["thread"] is None and "earlier turns" not in first["reply"]

    second = _ask(client, "and an integral", cid)
    assert second["conversation_id"] == cid
    assert "(I saw 1 earlier turns.)" in second["reply"]

    c = client.get(f"/conversations/{cid}").json()
    assert [t["question"] for t in c["turns"]] == ["what is a derivative", "and an integral"]
    assert c["turns"][0]["tier"] == 2 and c["turns"][0]["receipt_id"] == first["id"]
    assert c["turns"][1]["reply"]["reply"] == second["reply"]  # the HUD shows the conversation again from this
    assert c["title"] == "Fake title"  # Tier 2 named the untitled conversation
    assert (memory / "conversations" / f"{cid}.json").is_file()


def test_tier1_replies_are_turns_too(client):
    r = _ask(client, "my tasks")
    assert r["tier"] == 1 and r["conversation_id"]
    c = client.get(f"/conversations/{r['conversation_id']}").json()
    assert c["turns"][0]["tier"] == 1 and c["title"] == "my tasks"  # the first question until Tier 2 names it


def test_a_follow_up_skips_tier1_which_does_not_see_the_conversation(client):
    cid = _ask(client, "what is a derivative")["conversation_id"]
    assert _ask(client, "my tasks", cid)["tier"] == 1  # self-contained: Tier 1 answers
    r = _ask(client, "and my tasks?", cid)  # "and …" only makes sense with the conversation
    assert r["tier"] == 2


def test_a_reply_to_a_question_skips_tier1(client, memory):
    c = conversations.new(NOW)
    t = conversations.Turn(id="t1", at=NOW.isoformat(), question="remind me to call John", tier=2,
                           answer="When should I remind you?")
    conversations.append(memory, c, t, NOW)
    assert _ask(client, "my tasks", c.id)["tier"] == 2


def test_long_answers_are_cut_in_the_context_with_a_pointer_to_the_receipt(memory):
    c = conversations.new(NOW)
    conversations.append(memory, c, conversations.Turn(id="a", at=NOW.isoformat(), question="explain",
                                                       answer="x" * 5000, tier=2, receipt_id="R1"), NOW)
    text = conversations.context(conversations.load(memory, c.id), NOW)
    assert "full answer is in receipt R1" in text and "x" * 1600 not in text


def test_routines_keep_no_conversation(client, memory):
    r = router.ask(memory, "my tasks", source="routine")
    assert r.conversation_id is None and not (memory / "conversations").exists()


# ---------- after a pause ----------

def test_after_a_pause_tier2_can_start_a_new_conversation_and_the_user_can_undo_it(client, monkeypatch):
    cid = _ask(client, "what is a derivative")["conversation_id"]
    _ask(client, "and an integral", cid)

    _at(monkeypatch, 45)
    r = _ask(client, "NEWTOPIC presents for mom", cid)
    assert r["thread"] == {"decision": "new", "other_id": cid}
    new_id = r["conversation_id"]
    assert new_id != cid
    assert [t["question"] for t in client.get(f"/conversations/{new_id}").json()["turns"]] == ["NEWTOPIC presents for mom"]
    assert len(client.get(f"/conversations/{cid}").json()["turns"]) == 2

    merged = client.post(f"/conversations/{new_id}/merge-back").json()
    assert merged["id"] == cid and len(merged["turns"]) == 3
    assert client.get(f"/conversations/{new_id}").status_code == 404


def test_after_a_pause_only_the_summary_and_the_last_turns_go(client, memory, monkeypatch):
    cid = _ask(client, "q1")["conversation_id"]
    for i in range(2, 6):
        _ask(client, f"q{i}", cid)
    _at(monkeypatch, 45)
    r = _ask(client, "q6 same subject", cid)
    assert r["thread"] == {"decision": "continue", "other_id": cid} and r["conversation_id"] == cid
    assert "(I saw 3 earlier turns.)" in r["reply"]
    # back in the flow: the whole window again
    assert "(I saw 6 earlier turns.)" in _ask(client, "q7", cid)["reply"]


def test_continuing_can_be_undone_by_splitting_from_the_turn(client, monkeypatch):
    cid = _ask(client, "q1")["conversation_id"]
    _at(monkeypatch, 45)
    r = _ask(client, "q2", cid)
    turn = client.get(f"/conversations/{cid}").json()["turns"][-1]["id"]
    new = client.post(f"/conversations/{cid}/split", json={"turn_id": turn}).json()
    assert new["split_from"] == cid and [t["question"] for t in new["turns"]] == ["q2"]
    assert len(client.get(f"/conversations/{cid}").json()["turns"]) == 1
    assert client.post(f"/conversations/{new['id']}/split", json={"turn_id": turn}).status_code == 409
    assert r["thread"]["decision"] == "continue"


def test_a_tier1_question_after_a_break_does_not_hide_the_break(client, monkeypatch):
    cid = _ask(client, "what is a derivative")["conversation_id"]
    _at(monkeypatch, 45)
    assert _ask(client, "my tasks", cid)["tier"] == 1
    r = _ask(client, "NEWTOPIC presents", cid)
    assert r["thread"]["decision"] == "new"
    moved = client.get(f"/conversations/{r['conversation_id']}").json()["turns"]
    assert [t["question"] for t in moved] == ["my tasks", "NEWTOPIC presents"]  # what came after the break


# ---------- summary ----------

def test_old_turns_fold_into_an_incremental_summary(client, memory, monkeypatch):
    cid = _ask(client, "q1")["conversation_id"]
    for i in range(2, 9):
        _ask(client, f"q{i} " + "y" * 300, cid)
    monkeypatch.setattr(conversations, "COMPACT_AT", 1000)
    monkeypatch.setattr(conversations, "COMPACT_TO", 500)
    assert conversations.compact(memory, cid)

    c = conversations.load(memory, cid)
    assert c.summarized == len(c.turns) - conversations.KEEP_WHOLE  # the last turns always stay whole
    assert c.summary.startswith("## Topic") and c.title == "Folded conversation"
    text = conversations.context(c, NOW)
    assert "<summary>" in text and "User: q1" not in text and "User: q8" in text
    assert "(I saw 4 earlier turns.)" in _ask(client, "q9", cid)["reply"]

    # the receipt of the summary doesn't count toward the daily limit
    receipts = list((memory / "receipts").rglob("*.md"))
    assert any("conversation_summary" in p.read_text(encoding="utf-8") for p in receipts)
    assert router.ai_calls_today(memory, NOW.date()) == 9


def test_ephemeral_results_never_go_into_the_summary(memory):
    e = ephemeral.save("Emails", "SECRET EMAIL CONTENT", "skill")
    c = conversations.new(NOW)
    conversations.append(memory, c, conversations.Turn(id="a", at=NOW.isoformat(), question="my emails", tier=3,
                                                       ephemeral_id=e.id), NOW)
    c = conversations.load(memory, c.id)
    assert "SECRET EMAIL CONTENT" in conversations.context(c, NOW)  # read from the ephemeral store while it lives
    assert "SECRET EMAIL CONTENT" not in conversations._summary_text(c.turns[0], "Gandalf")
    assert "SECRET" not in (memory / "conversations" / f"{c.id}.json").read_text(encoding="utf-8")


# ---------- Tier 3 ----------

def test_an_escalation_gets_the_conversation_and_its_result_comes_back_to_the_turn(client, memory):
    cid = _ask(client, "what is a derivative")["conversation_id"]
    r = _ask(client, "ESCALATE organize it", cid)
    s = wait_for_session(client, r["session_id"])
    assert "<conversation_so_far>" in s["task"] and "what is a derivative" in s["task"]
    turn = client.get(f"/conversations/{cid}").json()["turns"][-1]
    assert turn["session_id"] == s["id"] and turn["answer"] == "Done: I wrote output/test-report.md."


def test_a_second_escalation_resumes_the_previous_session(client):
    cid = _ask(client, "ESCALATE organize raw")["conversation_id"]
    first = client.get(f"/conversations/{cid}").json()["turns"][-1]["session_id"]
    wait_for_session(client, first)
    r = _ask(client, "ESCALATE now the other folder", cid)
    s = wait_for_session(client, r["session_id"])
    assert s["resumed_from"] == first


# ---------- deep mode, list, search ----------

def test_a_deep_conversation_uses_the_deep_model(client, monkeypatch):
    from app import config

    monkeypatch.setenv("GANDALF_TIER2_MODEL", "haiku")
    monkeypatch.setenv("GANDALF_TIER2_DEEP_MODEL", "sonnet")
    config.get_settings.cache_clear()
    seen = []
    original = claude_cli.run_json

    def spy(prompt, args, cwd, **kw):
        seen.append(args[args.index("--model") + 1])
        return original(prompt, args, cwd, **kw)

    monkeypatch.setattr(claude_cli, "run_json", spy)
    cid = _ask(client, "what is a derivative", deep=True)["conversation_id"]
    _ask(client, "and an integral", cid)
    assert seen == ["sonnet", "sonnet"]
    client.patch(f"/conversations/{cid}", json={"deep": False})
    _ask(client, "and a limit", cid)
    assert seen[-1] == "haiku"


def test_list_search_rename_and_delete(client):
    a = _ask(client, "presents for mom")["conversation_id"]
    b = _ask(client, "what is a derivative")["conversation_id"]
    items = client.get("/conversations?limit=5").json()
    assert {x["id"] for x in items} == {a, b} and items[0]["turn_count"] == 1
    assert [x["id"] for x in client.get("/conversations?q=mom").json()] == [a]
    assert len(client.get("/conversations?q=instantaneous rate").json()) == 2  # the answers count too
    assert client.patch(f"/conversations/{a}", json={"title": "Mom"}).json()["title"] == "Mom"
    assert client.delete(f"/conversations/{a}").status_code == 200
    assert client.get(f"/conversations/{a}").status_code == 404
    assert client.get("/conversations/../../etc").status_code == 404


def test_an_unknown_conversation_id_starts_a_new_one(client):
    r = _ask(client, "what is a derivative", "20990101-0000-abcdef")
    assert r["conversation_id"] != "20990101-0000-abcdef"


# ---------- short-term memory ----------

def test_recent_facts_expire_by_themselves(memory):
    assert recent.add(memory, "Looking for a present for mom", NOW, days=3) == (True, None)
    assert recent.add(memory, "Looking for a present for mom", NOW, days=1) == (False, None)  # already covered
    assert recent.add(memory, "Looking for a present for mom", NOW, days=5)[0]  # renewed
    assert recent.facts(memory, NOW.date())[0].end == NOW.date() + timedelta(days=5)
    recent.add(memory, "Exam on Friday", NOW, days=10)  # at most 7
    assert recent.facts(memory, NOW.date())[1].end == NOW.date() + timedelta(days=7)

    assert [f.fact for f in recent.facts(memory, NOW.date() + timedelta(days=6))] == ["Exam on Friday"]
    assert "present for mom" not in read_text(memory / recent.RECENT)  # the expired line left the file


def test_replaces_drops_what_stopped_being_true(memory):
    recent.add(memory, "Looking for a present for mom", NOW)
    assert recent.add(memory, "Bought mom's present, a scarf", NOW, replaces="present for mom") == (
        True, "Looking for a present for mom")
    assert [f.fact for f in recent.facts(memory, NOW.date())] == ["Bought mom's present, a scarf"]


def test_tier2_keeps_short_term_facts_and_every_conversation_sees_them(client, memory):
    r = _ask(client, "RECENT I need a present for my mom")
    assert "🕑" in r["reply"] and r["data"]["learned"][0]["where"] == "recent"
    assert "(2026-10-03 → 2026-10-07)" in read_text(memory / recent.RECENT)
    assert "learned.md" not in json.dumps(r["data"])

    from app.gandalf.context import build_context

    assert "## Recent" in build_context(memory, NOW) and "present for their mother" in build_context(memory, NOW)
    assert "## Recent" not in build_context(memory, NOW + timedelta(days=5))


# ---------- importing the old chats ----------

def test_old_receipts_become_conversations_grouped_by_pauses(memory):
    from app.migrations import conversations_from_receipts as migration
    from app.receipts import Receipt, write_receipt

    def receipt(minutes, text, **kw):
        write_receipt(memory, Receipt(text, f"answer to {text}", kw.pop("source", "hud"), 2, NOW + timedelta(minutes=minutes), 10, **kw))

    receipt(0, "presents for mom")
    receipt(5, "cheaper ones")
    receipt(60, "what is a derivative", source="voice")
    receipt(61, "Routine: email summary", source="routine", routine="email-summary")
    assert migration.migrate(memory, apply=False) == 2 and not (memory / "conversations").exists()
    assert migration.migrate(memory, apply=True) == 2
    items = conversations.list_items(memory)
    assert sorted(x["title"] for x in items) == ["presents for mom", "what is a derivative"]
    c = conversations.load(memory, next(x["id"] for x in items if x["title"] == "presents for mom"))
    assert [t.answer for t in c.turns] == ["answer to presents for mom", "answer to cheaper ones"]
    assert migration.migrate(memory, apply=True) == 0  # nothing new the second time
