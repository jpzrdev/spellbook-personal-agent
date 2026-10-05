"""Pesquisa web (só web, sem vault) → resultado efêmero → guardar organizado na Biblioteca."""

import time

from app.gandalf import tier3
from test_tier2_tier3 import esperar_fim


def _esperar_recibo(client, sessao_id):
    s = esperar_fim(client, sessao_id)
    for _ in range(60):  # o status vira "ok" um instante antes de o resultado ser guardado
        if s["recibo_id"]:
            return s
        time.sleep(0.05)
        s = client.get(f"/sessoes/{sessao_id}").json()
    return s


def test_ferramentas_de_cada_modo_presas_ao_vault(vault):
    """Regressão de segurança (testada com o CLI real): sem `(**)` o Claude Code lia/escrevia fora do vault,
    e com acceptEdits as sessões "só leitura" conseguiam escrever."""
    g = tier3.gerenciador(vault)

    def ferramentas(saida, skill=None):
        s = tier3.Sessao(id="x", tarefa="t", pedido="p", origem="hud", criada=None, saida=saida, skill=skill)
        args = g._args(s)
        assert args[args.index("--permission-mode") + 1] == "default"
        return args[args.index("--allowedTools") + 1]

    assert ferramentas("vault").startswith("Read(**),Write(**),Edit(**)")
    assert ferramentas("efemera") == "Read(**),Glob(**),Grep(**)"
    assert ferramentas("pesquisa") == "WebSearch,WebFetch"  # nem leitura do vault
    biblio = ferramentas("biblioteca")
    assert "Write(wiki/biblioteca/**)" in biblio and "Write(**)" not in biblio and "Web" not in biblio


def test_pergunta_atual_vira_pesquisa_e_guarda_na_biblioteca(client, vault):
    r = client.post("/ask", json={"texto": "PESQUISAR: quero me mudar para o Canadá"}).json()
    assert r["tier"] == 3 and r["intent"] == "pesquisar" and "Mudança para o Canadá" in r["resposta"]
    s = tier3.gerenciador(vault).obter(r["sessao_id"])
    assert s.saida == "pesquisa" and s.skill == "pesquisar"
    fim = _esperar_recibo(client, r["sessao_id"])
    assert fim["status"] == "ok" and fim["efemero_id"]

    e = client.get(f"/efemeros/{fim['efemero_id']}").json()
    assert e["titulo"] == "Pesquisa: Mudança para o Canadá" and e["pesquisa"]["tema"] == "Mudança para o Canadá"
    assert e["expira"] > "2026-10-09"  # pesquisa espera 7 dias
    recibo = (vault / "recibos").rglob("*.md")
    assert all(e["texto"] not in r.read_text(encoding="utf-8") for r in recibo)

    g = client.post(f"/pesquisas/{e['id']}/guardar")
    assert g.status_code == 201
    guardar = g.json()
    assert guardar["skill"] == "guardar-pesquisa" and guardar["saida"] == "biblioteca"
    assert "<relatorio>" in guardar["tarefa"] and "Crie um tema novo" in guardar["tarefa"]
    _esperar_recibo(client, guardar["id"])
    assert client.get(f"/efemeros/{e['id']}").status_code == 404  # guardado: saiu de "Resumos"


def test_skill_pesquisar_pela_aba_skills_continua_sem_vault(client, vault):
    s = client.post("/skills/pesquisar/executar", json={"instrucao": "voos para Tóquio"}).json()
    assert s["saida"] == "pesquisa"


def test_biblioteca_lista_detalhe_e_checklist(client, vault):
    pasta = vault / "wiki/biblioteca/viagem-japao"
    pasta.mkdir(parents=True)
    (pasta / "_index.md").write_text(
        "---\ntipo: plano\natualizado: 2026-10-02\n---\n# Viagem ao Japão\n\nDez dias entre Tóquio e Kyoto em abril.\n", encoding="utf-8")
    (pasta / "roteiro.md").write_text("---\nordem: 1\n---\n# Roteiro\n\nDia 1…\n", encoding="utf-8")
    (pasta / "orcamento.md").write_text("---\nordem: 2\n---\n# Orçamento\n", encoding="utf-8")
    (pasta / "checklist.md").write_text("# Checklist\n\n- [ ] Tirar passaporte\n- [x] Comprar guia\n- [ ] Reservar hotel 📅 2026-12-01\n", encoding="utf-8")

    [item] = client.get("/biblioteca").json()
    assert item == {"slug": "viagem-japao", "titulo": "Viagem ao Japão", "tipo": "plano",
                    "resumo": "Dez dias entre Tóquio e Kyoto em abril.", "atualizado": "2026-10-02", "partes": 3}
    d = client.get("/biblioteca/viagem-japao").json()
    assert [p["titulo"] for p in d["lista_partes"]][:2] == ["Roteiro", "Orçamento"] and d["tem_checklist"]
    assert client.post("/biblioteca/viagem-japao/tarefas").json()["criadas"] == ["Tirar passaporte", "Reservar hotel"]
    assert client.post("/biblioteca/viagem-japao/tarefas").json()["criadas"] == []  # sem duplicar
    assert client.get("/biblioteca/../vida").status_code == 404

    # atualizar: a pesquisa recebe o que já está guardado, mas continua sem vault
    s = client.post("/pesquisas", json={"pedido": "acrescentar um dia em Nara", "atualizar": "viagem-japao"}).json()
    assert "<ja_guardado>" in s["tarefa"] and "Dez dias" in s["tarefa"] and s["saida"] == "pesquisa"
