import frontmatter

from app.gandalf import tier3
from app.gandalf.context import build_context
from app.memory import learn
from app.memory.reader import read_text

from conftest import NOW


def _wiki_files(memory):
    (memory / "wiki" / "_log.md").write_text("# Wiki log\n", encoding="utf-8")
    (memory / "wiki" / "_master-index.md").write_text("# Master index\n\n- [[wiki/studies/_index|Studies]]\n", encoding="utf-8")


def test_profile_fact_goes_to_learned_with_log_and_index(memory):
    _wiki_files(memory)
    [x] = learn.save(memory, [{"fact": "Works night shifts as a nurse", "where": "profile"}], NOW, "hud", "req")
    assert x.where == "profile" and x.path == "wiki/about-me/learned.md"
    post = frontmatter.load(memory / "wiki" / "about-me" / "learned.md")
    assert post["type"] == "profile"
    assert "- Works night shifts as a nurse (2026-10-03)" in post.content
    assert learn.facts(memory) == ["Works night shifts as a nurse"]
    assert "· learn · [[wiki/about-me/learned]]: Works night shifts as a nurse" in read_text(memory / "wiki" / "_log.md")
    assert "[[wiki/about-me/learned|Learned]]" in read_text(memory / "wiki" / "_master-index.md")


def test_duplicates_are_skipped_and_replaces_removes_the_stale_line(memory):
    learn.save(memory, [{"fact": "Lives in São Paulo", "where": "profile"}], NOW, "hud", "")
    assert learn.save(memory, [{"fact": "lives in sao paulo.", "where": "profile"}], NOW, "hud", "") == []
    [x] = learn.save(memory, [{"fact": "Lives in Porto", "where": "profile", "replaces": "Lives in São Paulo"}], NOW, "hud", "")
    assert x.replaced == "Lives in São Paulo"
    assert learn.facts(memory) == ["Lives in Porto"]


def test_secrets_and_junk_are_never_stored(memory):
    items = [
        {"fact": "Bank password is hunter2", "where": "profile"},
        {"fact": "Card 4111 1111 1111 1111", "where": "profile"},
        {"fact": "", "where": "profile"},
        "not a dict",
        {"fact": "x" * 400, "where": "profile"},
    ]
    assert learn.save(memory, items, NOW, "hud", "") == []
    assert not (memory / "wiki" / "about-me" / "learned.md").exists()
    # a date is not a long number
    assert learn.save(memory, [{"fact": "Exam on 2026-12-05", "where": "profile"}], NOW, "hud", "")


def test_raw_fact_keeps_the_message_for_context(memory):
    [x] = learn.save(memory, [{"fact": "The Atlas project uses Postgres", "where": "raw"}], NOW, "chat", "about Atlas: we use Postgres")
    post = frontmatter.load(memory / x.path)
    assert x.path.startswith("raw/") and post["type"] == "learned" and post["source"] == "chat"
    assert post.content.startswith("The Atlas project uses Postgres") and "> about Atlas: we use Postgres" in post.content


def test_ask_learns_alongside_the_answer(client, memory):
    r = client.post("/ask", json={"text": "LEARN I'm doing the AWS exam on Dec 5"}).json()
    assert r["intent"] == "answer"
    assert r["reply"].startswith("Good luck with the exam!")
    assert "🧠 I'll remember: Is preparing for the AWS exam" in r["reply"]
    assert [x["where"] for x in r["data"]["learned"]] == ["profile", "raw"]  # the password was dropped
    assert learn.facts(memory) == ["Is preparing for the AWS exam, planned for 2026-12-05"]
    assert "hunter2" not in read_text(memory / "wiki" / "about-me" / "learned.md")


def test_auto_learn_can_be_turned_off(client, memory, monkeypatch):
    from app import config

    monkeypatch.setenv("GANDALF_AUTO_LEARN", "false")
    config.get_settings.cache_clear()
    r = client.post("/ask", json={"text": "LEARN something"}).json()
    assert "learned" not in r["data"] and "🧠" not in r["reply"]
    assert not (memory / "wiki" / "about-me" / "learned.md").exists()


def test_context_shows_the_newest_learned_facts_first_to_survive(memory, monkeypatch):
    from app.gandalf import context

    for i in range(40):
        learn.save(memory, [{"fact": f"Fact number {i} about the user", "where": "profile"}], NOW, "hud", "")
    monkeypatch.setattr(context, "LEARNED_LIMIT", 200)
    text = build_context(memory, NOW)
    assert "## Learned from conversations" in text and "(older facts omitted)" in text
    assert "Fact number 39 about the user" in text and "Fact number 0 about" not in text


def test_tier3_memory_sessions_get_the_learning_instruction(memory):
    m = tier3.Manager(memory)
    chat = tier3.Session(id="a", task="t", request="t", source="hud", created=NOW)
    routine = tier3.Session(id="b", task="t", request="t", source="routine", created=NOW, routine="compile-raw")
    ephemeral = tier3.Session(id="c", task="t", request="t", source="hud", created=NOW, output="ephemeral")

    def system(s):
        args = m._args(s)
        return args[args.index("--append-system-prompt") + 1]

    assert "wiki/about-me/learned.md" in system(chat)
    assert "learned.md" not in system(routine) and "learned.md" not in system(ephemeral)
