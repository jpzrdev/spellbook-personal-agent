"""Aba Estudos: acervo de tópicos, quiz efêmero, anotações, material e contexto da nota no chat."""

import frontmatter

from app import estudos

NOTA = "wiki/estudos/calculo/derivadas.md"
CONTEUDO = """---
tipo: conceito
ordem: 1
---
# Derivadas

## Ideia central

A derivada mede a **taxa de variação** instantânea de uma função: o quanto ela muda quando a entrada muda um pouquinho.

## Regras

- soma, produto, cadeia
"""


def _preparar(vault):
    (vault / NOTA).write_text(CONTEUDO, encoding="utf-8")


def _recibos(vault):
    return [frontmatter.load(p) for p in (vault / "recibos").rglob("*.md")]


def test_detalhe_e_o_acervo_sem_progresso(client, vault):
    _preparar(vault)
    d = client.get("/estudos/calculo").json()
    assert d["titulo"] == "Cálculo II" and d["topicos_total"] == 2
    t = d["topicos"][0]  # ordem: 1 vem primeiro
    assert t["titulo"] == "Derivadas" and t["resumo"].startswith("A derivada mede a taxa de variação")
    assert t["palavras"] > 20
    for campo in ("estado", "revisar", "perguntas", "progresso", "pendentes", "tarefas"):
        assert campo not in t and campo not in d
    [m] = client.get("/estudos").json()
    assert m["materia"] == "calculo" and m["titulos"] == ["Derivadas", "Limites"]
    # rotas antigas de curso/flashcards saíram
    assert client.post("/estudos/calculo/estudado", json={"nota": NOTA}).status_code in (404, 405)
    assert client.get("/estudos/calculo/cartas").status_code == 404


def test_quiz_do_topico_multipla_escolha(client, vault):
    _preparar(vault)
    client.post("/estudos/calculo/anotacoes", json={"texto": "Regra da cadeia é a mais cobrada", "topico": NOTA})
    r = client.post("/estudos/calculo/quiz", json={"quantidade": 3, "tipo": "multipla", "topico": NOTA})
    assert r.status_code == 200
    q = r.json()
    assert q["topico"] == NOTA and len(q["perguntas"]) == 3  # a pergunta inválida do modelo foi descartada
    p = q["perguntas"][1]
    assert p["opcoes"] == ["A", "B", "C", "D"] and p["correta"] == 1 and p["topico"] == NOTA
    assert p["titulo_topico"] == "Derivadas"
    # nada do quiz vai para o vault, só o recibo com o custo
    [rec] = _recibos(vault)
    assert rec["intent"] == "estudos.quiz" and "Pergunta 1" not in rec.content
    assert not any("Pergunta 1" in a.read_text(encoding="utf-8") for a in vault.rglob("*.md"))


def test_quiz_geral_texto_livre_e_correcao(client, vault):
    _preparar(vault)
    q = client.post("/estudos/calculo/quiz", json={"quantidade": 2, "tipo": "texto"}).json()
    assert q["topico"] is None and all(p["opcoes"] is None for p in q["perguntas"])
    assert q["perguntas"][0]["topico"].startswith("wiki/estudos/calculo/")
    base = {"pergunta": "O que é a derivada?", "resposta_modelo": "A taxa de variação.", "topico": NOTA}
    c = client.post("/estudos/calculo/quiz/corrigir", json={**base, "resposta": "é a taxa de variação"}).json()
    assert c["veredito"] == "certo" and c["complemento"]
    assert client.post("/estudos/calculo/quiz/corrigir", json={**base, "resposta": "não sei"}).json()["veredito"] == "errado"


def test_quiz_limites_e_caminhos(client, vault):
    assert client.post("/estudos/calculo/quiz", json={"quantidade": 99, "tipo": "texto"}).status_code == 422
    assert client.post("/estudos/calculo/quiz", json={"quantidade": 3, "tipo": "outro"}).status_code == 422
    assert client.post("/estudos/calculo/quiz", json={"topico": "vida/tarefas.md"}).status_code == 400
    assert client.post("/estudos/calculo/quiz", json={"topico": "wiki/estudos/calculo/../../../CLAUDE.md"}).status_code == 400
    assert client.post("/estudos/nao-existe/quiz", json={}).status_code == 404
    assert client.get("/estudos/nao-existe").status_code == 404


def test_salvar_questao_do_quiz_como_anotacao(client, vault):
    _preparar(vault)
    a = client.post("/estudos/calculo/anotacoes", json={
        "titulo": "Quiz: O que é a derivada?", "texto": "**Pergunta:** ...", "topico": NOTA, "origem": "quiz"}).json()
    assert a["origem"] == "quiz" and a["topico"] == NOTA
    assert frontmatter.load(vault / a["arquivo"])["origem"] == "quiz"


def test_aprofundar_topico_usa_a_skill(client, vault):
    _preparar(vault)
    s = client.post("/estudos/gerar", json={"tipo": "aprofundar", "nota": NOTA}).json()
    assert NOTA in s["tarefa"] and s["tarefa"].startswith("Aprofunde")
    assert client.post("/estudos/gerar", json={"tipo": "aprofundar", "nota": "vida/tarefas.md"}).status_code == 400
    assert client.post("/estudos/gerar", json={"tipo": "materia", "pedido": "  "}).status_code == 422


def test_resumo_curto_pula_titulos_e_listas():
    assert estudos._resumo_curto("## T\n\n- item\n\n> callout\n\nTexto **forte** com [[a/b|link]].") == "Texto forte com link."


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


def test_remover_materia_apaga_tudo_e_tira_do_indice(client, vault):
    _preparar(vault)
    indice = vault / "wiki/estudos/_index.md"
    indice.write_text("# Estudos\n\n- [[wiki/estudos/calculo/_index|Cálculo II]]: derivadas.\n- [[wiki/estudos/calculo-3]]: outra.\n", encoding="utf-8")
    client.post("/estudos/calculo/anotacoes", json={"texto": "minha nota", "topico": NOTA})
    client.post("/estudos/calculo/material", data={"texto": "aula 1", "estruturar": "false"})
    r = client.delete("/estudos/calculo")
    assert r.status_code == 200
    d = r.json()
    assert (d["titulo"], d["topicos"], d["anotacoes"], d["fontes"]) == ("Cálculo II", 2, 1, 1)
    assert not (vault / "wiki/estudos/calculo").exists()
    texto = indice.read_text(encoding="utf-8")
    assert "calculo/_index" not in texto and "calculo-3" in texto  # só a linha da matéria apagada
    assert client.get("/estudos").json() == []
    assert client.delete("/estudos/calculo").status_code == 404
    assert client.delete("/estudos/..%2F..").status_code in (400, 404)
