"""Studies tab: topic collection, ephemeral quiz, annotations, material and the note context in the chat."""

import frontmatter

from app import studies

NOTE = "wiki/studies/calculus/derivatives.md"
CONTENT = """---
type: concept
order: 1
---
# Derivatives

## Core idea

The derivative measures the instantaneous **rate of change** of a function: how much it changes when the input changes a tiny bit.

## Rules

- sum, product, chain
"""


def _prepare(memory):
    (memory / NOTE).write_text(CONTENT, encoding="utf-8")


def _receipts(memory):
    return [frontmatter.load(p) for p in (memory / "receipts").rglob("*.md")]


def test_detail_is_the_collection_without_progress(client, memory):
    _prepare(memory)
    d = client.get("/studies/calculus").json()
    assert d["title"] == "Calculus II" and d["topic_count"] == 2
    x = d["topics"][0]  # order: 1 comes first
    assert x["title"] == "Derivatives" and x["summary"].startswith("The derivative measures the instantaneous rate of change")
    assert x["words"] > 20
    for field in ("state", "review", "questions", "progress", "pending", "tasks"):
        assert field not in x and field not in d
    [m] = client.get("/studies").json()
    assert m["subject"] == "calculus" and m["titles"] == ["Derivatives", "Limits"]


def test_topic_quiz_multiple_choice(client, memory):
    _prepare(memory)
    client.post("/studies/calculus/annotations", json={"text": "The chain rule is the one that shows up the most", "topic": NOTE})
    r = client.post("/studies/calculus/quiz", json={"count": 3, "type": "multiple", "topic": NOTE})
    assert r.status_code == 200
    q = r.json()
    assert q["topic"] == NOTE and len(q["questions"]) == 3  # the model's invalid question was dropped
    p = q["questions"][1]
    assert p["options"] == ["A", "B", "C", "D"] and p["correct"] == 1 and p["topic"] == NOTE
    assert p["topic_title"] == "Derivatives"
    # nothing from the quiz goes to the memory, only the receipt with the cost
    [rec] = _receipts(memory)
    assert rec["intent"] == "studies.quiz" and "Question 1" not in rec.content
    assert not any("Question 1" in a.read_text(encoding="utf-8") for a in memory.rglob("*.md"))


def test_general_free_text_quiz_and_grading(client, memory):
    _prepare(memory)
    q = client.post("/studies/calculus/quiz", json={"count": 2, "type": "text"}).json()
    assert q["topic"] is None and all(p["options"] is None for p in q["questions"])
    assert q["questions"][0]["topic"].startswith("wiki/studies/calculus/")
    base = {"question": "What is the derivative?", "model_answer": "The rate of change.", "topic": NOTE}
    c = client.post("/studies/calculus/quiz/grade", json={**base, "answer": "it's the rate of change"}).json()
    assert c["verdict"] == "correct" and c["detail"]
    assert client.post("/studies/calculus/quiz/grade", json={**base, "answer": "no idea"}).json()["verdict"] == "wrong"


def test_quiz_limits_and_paths(client, memory):
    assert client.post("/studies/calculus/quiz", json={"count": 99, "type": "text"}).status_code == 422
    assert client.post("/studies/calculus/quiz", json={"count": 3, "type": "other"}).status_code == 422
    assert client.post("/studies/calculus/quiz", json={"topic": "life/tasks.md"}).status_code == 400
    assert client.post("/studies/calculus/quiz", json={"topic": "wiki/studies/calculus/../../../CLAUDE.md"}).status_code == 400
    assert client.post("/studies/does-not-exist/quiz", json={}).status_code == 404
    assert client.get("/studies/does-not-exist").status_code == 404


def test_save_a_quiz_question_as_an_annotation(client, memory):
    _prepare(memory)
    a = client.post("/studies/calculus/annotations", json={
        "title": "Quiz: What is the derivative?", "text": "**Question:** ...", "topic": NOTE, "source": "quiz"}).json()
    assert a["source"] == "quiz" and a["topic"] == NOTE
    assert frontmatter.load(memory / a["file"])["source"] == "quiz"


def test_deepen_topic_uses_the_skill(client, memory):
    _prepare(memory)
    s = client.post("/studies/generate", json={"kind": "deepen", "note": NOTE}).json()
    assert NOTE in s["task"] and s["task"].startswith("Deepen")
    assert client.post("/studies/generate", json={"kind": "deepen", "note": "life/tasks.md"}).status_code == 400
    assert client.post("/studies/generate", json={"kind": "subject", "request": "  "}).status_code == 422


def test_short_summary_skips_headings_and_lists():
    assert studies._short_summary("## T\n\n- item\n\n> callout\n\nText **bold** with [[a/b|link]].") == "Text bold with link."


def test_question_about_a_note_goes_to_tier2_with_context(client, memory, monkeypatch):
    from app.gandalf import tier2

    _prepare(memory)
    seen = {}
    original = tier2.decide

    def spy(memory_, request, now, conversation=None, note=None, model=None):
        seen["note"] = note
        return original(memory_, request, now, conversation, note, model)

    monkeypatch.setattr(tier2, "decide", spy)
    r = client.post("/ask", json={"text": "my tasks", "note": NOTE}).json()
    assert r["tier"] == 2  # even a Tier 1 phrase goes to the AI when it's about the note
    assert seen["note"][0] == NOTE and "Derivatives" in seen["note"][1]
    assert client.post("/ask", json={"text": "x", "note": "../.env"}).status_code == 400


def test_pomodoro_without_scheduler_does_not_break(client):
    r = client.post("/pomodoro", json={"end": "2026-10-03T09:40:00", "title": "Break"})
    assert r.status_code == 200 and r.json() == {"scheduled": False}
    assert client.post("/pomodoro", json={"end": "2026-10-03T09:00:00", "title": "x"}).status_code == 422


def test_topic_and_general_annotations(client, memory):
    _prepare(memory)
    a = client.post("/studies/calculus/annotations", json={"text": "Remember the chain rule", "topic": NOTE}).json()
    g = client.post("/studies/calculus/annotations", json={"text": "The exam is on the 20th", "title": "Exam"}).json()
    assert a["topic"] == NOTE and g["topic"] is None and g["title"] == "Exam"
    assert a["file"].startswith("wiki/studies/calculus/_annotations/")
    d = client.get("/studies/calculus").json()
    assert [x["title"] for x in d["annotations"]] == ["Exam"]
    assert next(x for x in d["topics"] if x["note"] == NOTE)["annotation_count"] == 1
    assert all("_annotations" not in x["note"] for x in d["topics"])  # an annotation doesn't become a topic
    e = client.put("/studies/calculus/annotations", json={"file": a["file"], "text": "Chain rule: f(g(x))' = f'(g(x))·g'(x)"}).json()
    assert e["text"].startswith("Chain rule") and e["updated"]
    assert client.get("/studies/calculus/annotations", params={"topic": NOTE}).json()[0]["text"] == e["text"]
    assert client.delete("/studies/calculus/annotations", params={"file": g["file"]}).status_code == 204
    assert client.delete("/studies/calculus/annotations", params={"file": NOTE}).status_code == 400  # annotations only
    assert client.post("/studies/calculus/annotations", json={"text": "x", "topic": "life/tasks.md"}).status_code == 400


def test_annotations_go_into_the_question_context(client, memory, monkeypatch):
    from app.gandalf import tier2

    _prepare(memory)
    client.post("/studies/calculus/annotations", json={"text": "My question: what about the product rule?", "topic": NOTE})
    seen = {}
    original = tier2.decide
    monkeypatch.setattr(tier2, "decide", lambda v, p, a, conv=None, note=None, model=None: seen.update(note=note) or original(v, p, a, conv, note, model))
    client.post("/ask", json={"text": "explain", "note": NOTE})
    assert "product rule" in seen["note"][1]


def test_send_material_stores_and_structures(client, memory):
    import io
    import zipfile

    from test_tier2_tier3 import wait_for_end

    _prepare(memory)
    docx = io.BytesIO()
    with zipfile.ZipFile(docx, "w") as z:
        z.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
                   '<w:p><w:r><w:t>Derivative of a sum</w:t></w:r></w:p><w:p><w:r><w:t>is the sum of the derivatives</w:t></w:r></w:p></w:body></w:document>')
    r = client.post(
        "/studies/calculus/material",
        data={"text": "Notes from lecture 3 on the chain rule", "topic": NOTE},
        files=[("files", ("lecture.docx", docx.getvalue(), "application/octet-stream"))],
    )
    assert r.status_code == 201
    sources = r.json()["sources"]
    assert len(sources) == 3 and all(f.startswith("wiki/studies/calculus/_sources/") for f in sources)
    md = next(f for f in sources if f.endswith("lecture.md"))
    assert "is the sum of the derivatives" in (memory / md).read_text(encoding="utf-8")
    session = r.json()["session"]
    assert "_sources/" in session["task"] and NOTE in session["task"]
    wait_for_end(client, session["id"])
    assert client.get("/studies/calculus").json()["sources"]
    # store only, no AI; and an unsupported format
    assert client.post("/studies/calculus/material", data={"text": "x", "structure": "false"}).json()["session"] is None
    assert client.post("/studies/calculus/material", files=[("files", ("a.exe", b"x", "application/octet-stream"))]).status_code == 422
    assert client.post("/studies/calculus/material", data={}).status_code == 422


def test_remove_subject_deletes_everything_and_leaves_the_index(client, memory):
    _prepare(memory)
    index = memory / "wiki/studies/_index.md"
    index.write_text("# Studies\n\n- [[wiki/studies/calculus/_index|Calculus II]]: derivatives.\n- [[wiki/studies/calculus-3]]: another.\n", encoding="utf-8")
    client.post("/studies/calculus/annotations", json={"text": "my note", "topic": NOTE})
    client.post("/studies/calculus/material", data={"text": "lecture 1", "structure": "false"})
    r = client.delete("/studies/calculus")
    assert r.status_code == 200
    d = r.json()
    assert (d["title"], d["topics"], d["annotations"], d["sources"]) == ("Calculus II", 2, 1, 1)
    assert not (memory / "wiki/studies/calculus").exists()
    text = index.read_text(encoding="utf-8")
    assert "calculus/_index" not in text and "calculus-3" in text  # only the deleted subject's line
    assert client.get("/studies").json() == []
    assert client.delete("/studies/calculus").status_code == 404
    assert client.delete("/studies/..%2F..").status_code in (400, 404)
