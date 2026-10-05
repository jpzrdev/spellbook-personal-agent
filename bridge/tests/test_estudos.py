"""Aba Estudos: tópicos, flashcards, estudo, repetição espaçada e contexto da nota no chat."""

from datetime import date

import frontmatter

from app import estudos

NOTA = "wiki/estudos/calculo/derivadas.md"
CONTEUDO = """---
tipo: conceito
ordem: 1
---
# Derivadas

Resumo.

## Perguntas

1. O que é a derivada?
> [!note]- Resposta
> A taxa de variação instantânea.
> É o limite do quociente de Newton.

2. **Derivada de x²?**

> [!note]- Resposta
> 2x
"""


def _preparar(vault):
    (vault / NOTA).write_text(CONTEUDO, encoding="utf-8")
    (vault / "vida/tarefas.md").write_text(
        "# Tarefas\n- [ ] Estudar Derivadas (cálculo) 📅 2026-10-03 #estudos/calculo\n", encoding="utf-8")


def test_perguntas_do_callout():
    pares = estudos.perguntas(CONTEUDO)
    assert pares[0] == {"pergunta": "O que é a derivada?", "resposta": "A taxa de variação instantânea.\nÉ o limite do quociente de Newton."}
    assert pares[1] == {"pergunta": "Derivada de x²?", "resposta": "2x"}


def test_proximo_intervalo():
    assert estudos.proximo_intervalo(0, "facil") == 4 and estudos.proximo_intervalo(4, "facil") == 10
    assert estudos.proximo_intervalo(10, "dificil") == 13 and estudos.proximo_intervalo(10, "errei") == 1


def test_detalhe_estudar_e_revisar(client, vault):
    _preparar(vault)
    d = client.get("/estudos/calculo").json()
    assert d["titulo"] == "Cálculo II" and d["topicos"][0]["titulo"] == "Derivadas"  # ordem: 1 vem primeiro
    assert d["topicos"][0]["perguntas"] == 2 and d["topicos"][0]["estado"] == "novo"
    assert d["proxima_tarefa"]["texto"].startswith("Estudar Derivadas")

    r = client.post("/estudos/calculo/estudado", json={"nota": NOTA}).json()
    assert r["topico"]["estado"] == "estudado" and r["topico"]["revisar"] == "2026-10-04"
    assert r["tarefas_concluidas"] == ["Estudar Derivadas (cálculo)"]

    cartas = client.get("/estudos/calculo/cartas", params={"nota": NOTA}).json()
    assert [c["pergunta"] for c in cartas] == ["O que é a derivada?", "Derivada de x²?"]
    t = client.post("/estudos/calculo/revisao", json={"nota": NOTA, "nivel": "facil"}).json()
    assert t["intervalo"] == 4 and t["revisar"] == "2026-10-07" and t["revisoes"] == 1
    meta = frontmatter.load(vault / NOTA).metadata
    assert meta["revisar"] == date(2026, 10, 7) and "# Derivadas" in (vault / NOTA).read_text(encoding="utf-8")


def test_caminhos_fora_da_materia_sao_recusados(client, vault):
    assert client.post("/estudos/calculo/estudado", json={"nota": "vida/tarefas.md"}).status_code == 400
    assert client.post("/estudos/calculo/estudado", json={"nota": "wiki/estudos/calculo/../../../CLAUDE.md"}).status_code == 400
    assert client.get("/estudos/nao-existe").status_code == 404


def test_pergunta_sobre_nota_vai_para_o_tier2_com_contexto(client, vault, monkeypatch):
    from app.gandalf import tier2

    _preparar(vault)
    visto = {}
    original = tier2.decidir

    def espiar(vault_, pedido, agora, anterior=None, nota=None):
        visto["nota"] = nota
        return original(vault_, pedido, agora, anterior, nota)

    monkeypatch.setattr(tier2, "decidir", espiar)
    r = client.post("/ask", json={"texto": "minhas tarefas", "nota": NOTA}).json()
    assert r["tier"] == 2  # mesmo uma frase do Tier 1 vai para a IA quando é sobre a nota
    assert visto["nota"][0] == NOTA and "Derivadas" in visto["nota"][1]
    assert client.post("/ask", json={"texto": "x", "nota": "../.env"}).status_code == 400


def test_pomodoro_sem_agendador_nao_quebra(client):
    r = client.post("/pomodoro", json={"fim": "2026-10-03T09:40:00", "titulo": "Pausa"})
    assert r.status_code == 200 and r.json() == {"agendado": False}
    assert client.post("/pomodoro", json={"fim": "2026-10-03T09:00:00", "titulo": "x"}).status_code == 422


def test_anotacoes_do_topico_e_gerais(client, vault):
    _preparar(vault)
    a = client.post("/estudos/calculo/anotacoes", json={"texto": "Lembrar da regra da cadeia", "topico": NOTA}).json()
    g = client.post("/estudos/calculo/anotacoes", json={"texto": "Prova é dia 20", "titulo": "Prova"}).json()
    assert a["topico"] == NOTA and g["topico"] is None and g["titulo"] == "Prova"
    assert a["arquivo"].startswith("wiki/estudos/calculo/_anotacoes/")
    d = client.get("/estudos/calculo").json()
    assert [x["titulo"] for x in d["anotacoes"]] == ["Prova"]
    assert next(t for t in d["topicos"] if t["nota"] == NOTA)["anotacoes"] == 1
    assert all("_anotacoes" not in t["nota"] for t in d["topicos"])  # anotação não vira tópico
    e = client.put("/estudos/calculo/anotacoes", json={"arquivo": a["arquivo"], "texto": "Regra da cadeia: f(g(x))' = f'(g(x))·g'(x)"}).json()
    assert e["texto"].startswith("Regra da cadeia") and e["atualizado"]
    assert client.get("/estudos/calculo/anotacoes", params={"topico": NOTA}).json()[0]["texto"] == e["texto"]
    assert client.delete("/estudos/calculo/anotacoes", params={"arquivo": g["arquivo"]}).status_code == 204
    assert client.delete("/estudos/calculo/anotacoes", params={"arquivo": NOTA}).status_code == 400  # só anotações
    assert client.post("/estudos/calculo/anotacoes", json={"texto": "x", "topico": "vida/tarefas.md"}).status_code == 400


def test_anotacoes_vao_no_contexto_da_duvida(client, vault, monkeypatch):
    from app.gandalf import tier2

    _preparar(vault)
    client.post("/estudos/calculo/anotacoes", json={"texto": "Minha dúvida: e a regra do produto?", "topico": NOTA})
    visto = {}
    original = tier2.decidir
    monkeypatch.setattr(tier2, "decidir", lambda v, p, a, ant=None, nota=None: visto.update(nota=nota) or original(v, p, a, ant, nota))
    client.post("/ask", json={"texto": "explica", "nota": NOTA})
    assert "regra do produto" in visto["nota"][1]


def test_enviar_material_guarda_e_estrutura(client, vault):
    import io
    import zipfile

    from test_tier2_tier3 import esperar_fim

    _preparar(vault)
    docx = io.BytesIO()
    with zipfile.ZipFile(docx, "w") as z:
        z.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
                   '<w:p><w:r><w:t>Derivada da soma</w:t></w:r></w:p><w:p><w:r><w:t>é a soma das derivadas</w:t></w:r></w:p></w:body></w:document>')
    r = client.post(
        "/estudos/calculo/material",
        data={"texto": "Anotações da aula 3 sobre regra da cadeia", "topico": NOTA},
        files=[("arquivos", ("aula.docx", docx.getvalue(), "application/octet-stream"))],
    )
    assert r.status_code == 201
    fontes = r.json()["fontes"]
    assert len(fontes) == 3 and all(f.startswith("wiki/estudos/calculo/_fontes/") for f in fontes)
    md = next(f for f in fontes if f.endswith("aula.md"))
    assert "é a soma das derivadas" in (vault / md).read_text(encoding="utf-8")
    sessao = r.json()["sessao"]
    assert "_fontes/" in sessao["tarefa"] and NOTA in sessao["tarefa"]
    esperar_fim(client, sessao["id"])
    assert client.get("/estudos/calculo").json()["fontes"]
    # só guardar, sem IA; e formato não suportado
    assert client.post("/estudos/calculo/material", data={"texto": "x", "estruturar": "false"}).json()["sessao"] is None
    assert client.post("/estudos/calculo/material", files=[("arquivos", ("a.exe", b"x", "application/octet-stream"))]).status_code == 422
    assert client.post("/estudos/calculo/material", data={}).status_code == 422
