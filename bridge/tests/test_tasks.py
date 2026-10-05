from datetime import date

from app.vault.tasks import format_task, ordenar_prioridades, parse_tasks, set_concluida

HOJE = date(2026, 10, 3)


def test_parse_campos():
    [t] = parse_tasks("- [ ] Lista 3 de cálculo 📅 2026-10-06 ⏫ #estudos/calculo")
    assert t.texto == "Lista 3 de cálculo"
    assert t.vence == date(2026, 10, 6)
    assert t.prioridade == "alta"
    assert t.tags == ["estudos/calculo"]
    assert not t.concluida


def test_parse_concluida_e_crlf():
    [t] = parse_tasks("# T\r\n- [x] Comprar café ✅ 2026-10-02\r\n")
    assert t.concluida and t.concluida_em == date(2026, 10, 2)
    assert t.texto == "Comprar café"
    assert t.linha == 1


def test_id_estavel_ao_concluir_e_unico_para_duplicadas():
    antes = parse_tasks("- [ ] Ler\n- [ ] Ler")
    assert antes[0].id != antes[1].id
    linha = set_concluida("- [ ] Ler", True, HOJE)
    assert linha == "- [x] Ler ✅ 2026-10-03"
    assert parse_tasks(linha)[0].id == antes[0].id
    assert set_concluida(linha, False, HOJE) == "- [ ] Ler"


def test_format_task_ida_e_volta():
    linha = format_task("Pagar luz", vence=date(2026, 10, 5), prioridade="alta", tags=["pessoal"])
    assert linha == "- [ ] Pagar luz 📅 2026-10-05 ⏫ #pessoal"
    [t] = parse_tasks(linha)
    assert (t.texto, t.prioridade, t.tags) == ("Pagar luz", "alta", ["pessoal"])


def test_ordem_de_prioridades(vault):
    from app.vault.reader import ler_tarefas

    ordem = [t.texto for t in ordenar_prioridades(ler_tarefas(vault), HOJE)]
    # Atrasada/hoje primeiro (por prioridade), depois o resto por prioridade e data.
    assert ordem[:2] == ["Revisar limites", "Renovar livro da biblioteca"]
    assert ordem[2] == "Lista 3 de cálculo"
    assert "Comprar café" not in ordem
