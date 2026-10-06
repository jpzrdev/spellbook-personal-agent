from datetime import date

from app import cron
from app.routines import status
from app.vault import reader
from tests.conftest import NOW, TZ


def test_agenda_sorts_and_extracts_location(vault):
    events = reader.read_agenda(vault, date(2026, 10, 3))
    assert [(e.start, e.end, e.title, e.location) for e in events] == [
        (None, None, "Municipal holiday", None),
        ("09:00", "10:30", "Calculus II lecture", "Room 204"),
        ("14:00", None, "Dentist", None),
    ]


def test_agenda_day_without_file(vault):
    assert reader.read_agenda(vault, date(2026, 10, 9)) == []


def test_cron_standard_weekday():
    # 2026-10-05 is a Monday; 2026-10-03 is a Saturday. "1-5" = Mon–Fri (standard cron).
    assert [h.strftime("%H:%M") for h in cron.times_in_day("50 6 * * 1-5", date(2026, 10, 5), TZ)] == ["06:50"]
    assert cron.times_in_day("50 6 * * 1-5", date(2026, 10, 3), TZ) == []
    assert len(cron.times_in_day("0 20 * * 0", date(2026, 10, 4), TZ)) == 1  # Sunday
    assert len(cron.times_in_day("0 */2 * * *", date(2026, 10, 3), TZ)) == 12


def test_cron_description():
    assert cron.describe("50 6 * * 1-5") == "Mon–Fri at 06:50"
    assert cron.describe("0 23 * * *") == "every day at 23:00"
    assert cron.describe("0 20 * * 0") == "Sun at 20:00"
    assert cron.describe("0 */2 * * *") == "every 2h (at :00)"
    assert cron.describe("0 7-22/2 * * *") == "every 2h, from 07:00 to 22:00"


def test_cron_description_in_portuguese():
    assert cron.describe("50 6 * * 1-5", "pt-BR") == "seg–sex às 06:50"
    assert cron.describe("0 23 * * *", "pt-BR") == "todo dia às 23:00"
    assert cron.describe("0 7-22/2 * * *", "pt-BR") == "a cada 2h, das 07h às 22h"


def test_routines_today_only_active(vault):
    items = status.routines_today(vault, NOW, TZ)
    # Saturday: only the daily routine; the Mon–Fri one doesn't run and the paused one is ignored.
    assert items == [
        {"slug": "compile-raw", "name": "Compile raw", "time": "23:00", "schedule": "every day at 23:00", "status": "pending"}
    ]
