from datetime import date

from app import cron
from app.routines import status
from app.vault import reader
from tests.conftest import AGORA, TZ


def test_agenda_ordena_e_extrai_local(vault):
    eventos = reader.ler_agenda(vault, date(2026, 10, 3))
    assert [(e.inicio, e.fim, e.titulo, e.local) for e in eventos] == [
        (None, None, "Feriado municipal", None),
        ("09:00", "10:30", "Aula de Cálculo II", "Sala 204"),
        ("14:00", None, "Dentista", None),
    ]


def test_agenda_dia_sem_arquivo(vault):
    assert reader.ler_agenda(vault, date(2026, 10, 9)) == []


def test_cron_dia_da_semana_padrao():
    # 2026-10-05 é segunda; 2026-10-03 é sábado. "1-5" = seg–sex (cron padrão).
    assert [h.strftime("%H:%M") for h in cron.horarios_no_dia("50 6 * * 1-5", date(2026, 10, 5), TZ)] == ["06:50"]
    assert cron.horarios_no_dia("50 6 * * 1-5", date(2026, 10, 3), TZ) == []
    assert len(cron.horarios_no_dia("0 20 * * 0", date(2026, 10, 4), TZ)) == 1  # domingo
    assert len(cron.horarios_no_dia("0 */2 * * *", date(2026, 10, 3), TZ)) == 12


def test_cron_descricao():
    assert cron.descrever("50 6 * * 1-5") == "seg–sex às 06:50"
    assert cron.descrever("0 23 * * *") == "todo dia às 23:00"
    assert cron.descrever("0 20 * * 0") == "dom às 20:00"
    assert cron.descrever("0 */2 * * *") == "a cada 2h (min 00)"
    assert cron.descrever("0 7-22/2 * * *") == "a cada 2h, das 07h às 22h"


def test_rotinas_do_dia_so_ativas(vault):
    itens = status.rotinas_do_dia(vault, AGORA, TZ)
    # Sábado: só a rotina diária; a de seg–sex não roda e a pausada é ignorada.
    assert itens == [
        {"slug": "compilar-raw", "nome": "Compilar raw", "horario": "23:00", "quando": "todo dia às 23:00", "status": "pendente"}
    ]
