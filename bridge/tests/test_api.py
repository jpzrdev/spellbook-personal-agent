import frontmatter

from app.vault.reader import read_text


def test_ask_tier1_fast_with_receipt(client, vault):
    resp = client.post("/ask", json={"text": "what do I have today?"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["tier"] == 1 and body["intent"] == "agenda" and body["understood"]
    assert body["duration_ms"] < 50

    [receipt] = list((vault / "receipts" / "2026" / "10").glob("*.md"))
    assert receipt.name == "2026-10-03-091512-what-do-i-have-today.md"
    post = frontmatter.load(receipt)
    assert post["id"] == body["id"] and post["tier"] == 1 and post["source"] == "hud"
    assert post["input_tokens"] == 0 and post["estimated_cost_usd"] == 0
    assert "## Request\nwhat do I have today?" in post.content


def test_forced_tier1_not_understood_also_writes_a_receipt(client, vault):
    body = client.post("/ask", json={"text": "explain derivatives to me", "force_tier": 1}).json()
    assert body["tier"] == 1 and body["understood"] is False
    assert len(list((vault / "receipts").rglob("*.md"))) == 1


def test_today(client):
    h = client.get("/today").json()
    assert h["date"] == "2026-10-03"
    assert h["date_long"] == "Saturday, October 3"
    assert [e["title"] for e in h["agenda"]] == ["Municipal holiday", "Calculus II lecture", "Dentist"]
    assert [p["text"] for p in h["priorities"]] == ["Review limits", "Renew library book", "Calculus problem set 3"]
    assert h["tasks"] == {"open": 5, "today": 1, "overdue": 1, "done_today": 0}
    assert [r["slug"] for r in h["routines"]] == ["compile-raw"]


def test_completing_a_task_in_the_hud_changes_the_file(client, vault):
    target = next(x for x in client.get("/tasks").json() if x["text"] == "Pay the electricity bill")
    resp = client.patch(f"/tasks/{target['id']}", json={"done": True})
    assert resp.status_code == 200 and resp.json()["done"]
    content = read_text(vault / "life/tasks.md")
    assert "- [x] Pay the electricity bill 📅 2026-10-05 #personal ✅ 2026-10-03" in content
    # The rest of the file stays intact.
    assert "Loose text that is not a task." in content
    assert client.get("/today").json()["tasks"]["done_today"] == 1


def test_editing_the_file_shows_in_the_api(client, vault):
    path = vault / "life/tasks.md"
    path.write_text(read_text(path).replace("- [ ] Read chapter 4", "- [x] Read chapter 4"), encoding="utf-8")
    open_tasks = [x["text"] for x in client.get("/tasks").json()]
    assert "Read chapter 4" not in open_tasks


def test_create_and_edit_task(client, vault):
    new = client.post("/tasks", json={"text": "Book a doctor", "due": "2026-10-07", "priority": "high", "tags": ["#health"]})
    assert new.status_code == 201
    x = new.json()
    assert "- [ ] Book a doctor 📅 2026-10-07 ⏫ #health" in read_text(vault / "life/tasks.md")

    edited = client.patch(f"/tasks/{x['id']}", json={"text": "Book a dentist", "priority": None}).json()
    assert edited["text"] == "Book a dentist" and edited["priority"] is None
    assert "- [ ] Book a dentist 📅 2026-10-07 #health" in read_text(vault / "life/tasks.md")


def test_missing_task(client):
    assert client.patch("/tasks/doesnotexist", json={"done": True}).status_code == 404


def test_raw_capture_text_and_file(client, vault):
    r = client.post("/raw", json={"text": "Idea: flashcards app\nwith spaced repetition"}).json()
    assert r["file"] == "raw/2026-10-03-091512-idea-flashcards-app.md"
    assert frontmatter.load(vault / r["file"]).content.startswith("Idea: flashcards app")

    up = client.post("/raw/file", files={"file": ("Whiteboard Photo.PNG", b"\x89PNG...", "image/png")}).json()
    assert up["file"] == "raw/2026-10-03-091512-whiteboard-photo.png"
    assert (vault / up["file"]).read_bytes() == b"\x89PNG..."
