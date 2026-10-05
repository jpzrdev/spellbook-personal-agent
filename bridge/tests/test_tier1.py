from datetime import date

import frontmatter
import pytest

from app.gandalf import tier1
from app.vault.reader import ler_tarefas
from tests.conftest import AGORA, TZ


def ctx(vault):
    return tier1.Contexto(vault=vault, agora=AGORA, tz=TZ)


@pytest.mark.parametrize(
    "pedido,intent",
    [
        ("o que tenho hoje?", "agenda"),
        ("O que eu tenho amanhã", "agenda"),
        ("agenda", "agenda"),
        ("Quais são minhas prioridades?", "prioridades"),
        ("minhas tarefas", "tarefas"),
        ("rotinas", "rotinas"),
        ("adiciona tarefa comprar pão", "adicionar_tarefa"),
        ("anota: ideia para o TCC", "anotar"),
    ],
)
def test_intents_reconhecidos(vault, pedido, intent):
    r = tier1.responder(pedido, ctx(vault))
    assert r is not None and r.intent == intent


def test_nao_reconhece_pergunta_aberta(vault):
    assert tier1.responder("resuma minha última nota sobre limites", ctx(vault)) is None


def test_agenda_de_hoje(vault):
    r = tier1.responder("o que tenho hoje?", ctx(vault))
    assert "Hoje, sábado, 3 de outubro" in r.texto
    assert "- 09:00–10:30 Aula de Cálculo II (Sala 204)" in r.texto
    assert "Revisar limites" in r.texto  # tarefa de hoje
    assert "Renovar livro" in r.texto  # atrasada


def test_agenda_de_amanha_sem_eventos(vault):
    r = tier1.responder("o que tenho amanhã", ctx(vault))
    assert r.dados["data"] == "2026-10-04"
    assert "Nenhum compromisso" in r.texto


def test_adicionar_tarefa_com_data_prioridade_e_acentos(vault):
    r = tier1.responder("Adiciona tarefa estudar séries de Fourier sexta urgente #estudos/calculo", ctx(vault))
    t = r.dados["tarefa"]
    assert t["texto"] == "estudar séries de Fourier"
    assert t["vence"] == "2026-10-09"  # próxima sexta a partir de sábado 03/10
    assert t["prioridade"] == "alta"
    assert t["tags"] == ["estudos/calculo"]
    assert any(x.texto == "estudar séries de Fourier" for x in ler_tarefas(vault))


@pytest.mark.parametrize(
    "texto,esperado",
    [
        ("pagar boleto amanhã", date(2026, 10, 4)),
        ("pagar boleto para 15/10", date(2026, 10, 15)),
        ("pagar boleto 2026-11-01", date(2026, 11, 1)),
        ("pagar boleto 01/01", date(2027, 1, 1)),  # dd/mm já passado → ano que vem
        ("pagar boleto", None),
    ],
)
def test_extrair_data(texto, esperado):
    d, _ = tier1.extrair_data(tier1.normalizar(texto), AGORA.date())
    assert d == esperado


def test_anotar_cria_arquivo_em_raw(vault):
    r = tier1.responder("anota: comprar presente para a Ana", ctx(vault))
    arquivo = vault / r.dados["arquivo"]
    post = frontmatter.load(arquivo)
    assert post["tipo"] == "captura"
    assert post.content == "comprar presente para a Ana"
