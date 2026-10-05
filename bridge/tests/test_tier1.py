from datetime import date

import frontmatter
import pytest

from app.gandalf import tier1
from app.vault.reader import read_tasks
from tests.conftest import NOW, TZ


def ctx(vault):
    return tier1.Context(vault=vault, now=NOW, tz=TZ)


# ---------- English ----------

@pytest.mark.parametrize(
    "request_text,intent",
    [
        ("what do I have today?", "agenda"),
        ("What do I have tomorrow", "agenda"),
        ("agenda", "agenda"),
        ("What are my priorities?", "priorities"),
        ("my tasks", "tasks"),
        ("routines", "routines"),
        ("add task buy bread", "add_task"),
        ("note: an idea for the thesis", "note"),
    ],
)
def test_recognized_intents(vault, request_text, intent):
    r = tier1.answer(request_text, ctx(vault))
    assert r is not None and r.intent == intent


def test_does_not_recognize_an_open_question(vault):
    assert tier1.answer("summarize my last note about limits", ctx(vault)) is None


def test_todays_agenda(vault):
    r = tier1.answer("what do I have today?", ctx(vault))
    assert "Today, Saturday, October 3" in r.text
    assert "- 09:00–10:30 Calculus II lecture (Room 204)" in r.text
    assert "Review limits" in r.text  # today's task
    assert "Renew library book" in r.text  # overdue


def test_tomorrows_agenda_without_events(vault):
    r = tier1.answer("what do I have tomorrow", ctx(vault))
    assert r.data["date"] == "2026-10-04"
    assert "Nothing on the calendar" in r.text


def test_add_task_with_date_priority_and_tags(vault):
    r = tier1.answer("Add task study Fourier series friday urgent #studies/calculus", ctx(vault))
    x = r.data["task"]
    assert x["text"] == "study Fourier series"
    assert x["due"] == "2026-10-09"  # the next Friday from Saturday 10/03
    assert x["priority"] == "high"
    assert x["tags"] == ["studies/calculus"]
    assert any(t.text == "study Fourier series" for t in read_tasks(vault))


@pytest.mark.parametrize(
    "text,expected",
    [
        ("pay the bill tomorrow", date(2026, 10, 4)),
        ("pay the bill by 10/15", date(2026, 10, 15)),  # month/day in English
        ("pay the bill 2026-11-01", date(2026, 11, 1)),
        ("pay the bill 1/1", date(2027, 1, 1)),  # already passed → next year
        ("pay the bill", None),
    ],
)
def test_extract_date(text, expected):
    d, _ = tier1.extract_date(tier1.normalize(text), NOW.date())
    assert d == expected


def test_note_creates_a_file_in_raw(vault):
    r = tier1.answer("note: buy a present for Anna", ctx(vault))
    path = vault / r.data["file"]
    post = frontmatter.load(path)
    assert post["type"] == "capture"
    assert post.content == "buy a present for Anna"


# ---------- Brazilian Portuguese ----------

@pytest.mark.parametrize(
    "request_text,intent",
    [
        ("o que tenho hoje?", "agenda"),
        ("O que eu tenho amanhã", "agenda"),
        ("Quais são minhas prioridades?", "priorities"),
        ("minhas tarefas", "tasks"),
        ("rotinas", "routines"),
        ("adiciona tarefa comprar pão", "add_task"),
        ("anota: ideia para o TCC", "note"),
    ],
)
def test_recognized_intents_in_portuguese(vault, pt_br, request_text, intent):
    r = tier1.answer(request_text, ctx(vault))
    assert r is not None and r.intent == intent


def test_agenda_in_portuguese(vault, pt_br):
    r = tier1.answer("o que tenho hoje?", ctx(vault))
    assert "Hoje, sábado, 3 de outubro" in r.text
    assert "- Nenhum compromisso na agenda." in tier1.answer("o que tenho amanhã", ctx(vault)).text


def test_add_task_keeps_accents_in_portuguese(vault, pt_br):
    r = tier1.answer("Adiciona tarefa estudar séries de Fourier sexta urgente #estudos/calculo", ctx(vault))
    x = r.data["task"]
    assert x["text"] == "estudar séries de Fourier"
    assert x["due"] == "2026-10-09" and x["priority"] == "high" and x["tags"] == ["estudos/calculo"]
    assert r.text == "Tarefa adicionada para 09/10: estudar séries de Fourier"


@pytest.mark.parametrize(
    "text,expected",
    [
        ("pagar boleto amanhã", date(2026, 10, 4)),
        ("pagar boleto para 15/10", date(2026, 10, 15)),  # day/month in Portuguese
        ("pagar boleto 01/01", date(2027, 1, 1)),
    ],
)
def test_extract_date_in_portuguese(pt_br, text, expected):
    d, _ = tier1.extract_date(tier1.normalize(text), NOW.date())
    assert d == expected
