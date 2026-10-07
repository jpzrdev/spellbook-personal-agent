from datetime import date

from app.memory.tasks import format_task, parse_tasks, set_done, sort_by_priority

TODAY = date(2026, 10, 3)


def test_parse_fields():
    [x] = parse_tasks("- [ ] Calculus problem set 3 📅 2026-10-06 ⏫ #studies/calculus")
    assert x.text == "Calculus problem set 3"
    assert x.due == date(2026, 10, 6)
    assert x.priority == "high"
    assert x.tags == ["studies/calculus"]
    assert not x.done


def test_parse_done_and_crlf():
    [x] = parse_tasks("# T\r\n- [x] Buy coffee ✅ 2026-10-02\r\n")
    assert x.done and x.done_on == date(2026, 10, 2)
    assert x.text == "Buy coffee"
    assert x.line == 1


def test_id_stable_when_done_and_unique_for_duplicates():
    before = parse_tasks("- [ ] Read\n- [ ] Read")
    assert before[0].id != before[1].id
    line = set_done("- [ ] Read", True, TODAY)
    assert line == "- [x] Read ✅ 2026-10-03"
    assert parse_tasks(line)[0].id == before[0].id
    assert set_done(line, False, TODAY) == "- [ ] Read"


def test_format_task_round_trip():
    line = format_task("Pay electricity", due=date(2026, 10, 5), priority="high", tags=["personal"])
    assert line == "- [ ] Pay electricity 📅 2026-10-05 ⏫ #personal"
    [x] = parse_tasks(line)
    assert (x.text, x.priority, x.tags) == ("Pay electricity", "high", ["personal"])


def test_priority_order(memory):
    from app.memory.reader import read_tasks

    order = [x.text for x in sort_by_priority(read_tasks(memory), TODAY)]
    # Overdue/today first (by priority), then the rest by priority and date.
    assert order[:2] == ["Review limits", "Renew library book"]
    assert order[2] == "Calculus problem set 3"
    assert "Buy coffee" not in order
