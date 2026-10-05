import frontmatter

from app.vault.reader import ler_texto


def test_ask_tier1_rapido_com_recibo(client, vault):
    resp = client.post("/ask", json={"texto": "o que tenho hoje?"})
    assert resp.status_code == 200
    corpo = resp.json()
    assert corpo["tier"] == 1 and corpo["intent"] == "agenda" and corpo["entendeu"]
    assert corpo["duracao_ms"] < 50

    [recibo] = list((vault / "recibos" / "2026" / "10").glob("*.md"))
    assert recibo.name == "2026-10-03-091512-o-que-tenho-hoje.md"
    post = frontmatter.load(recibo)
    assert post["id"] == corpo["id"] and post["tier"] == 1 and post["origem"] == "hud"
    assert post["tokens_entrada"] == 0 and post["custo_estimado_usd"] == 0
    assert "## Pedido\no que tenho hoje?" in post.content


def test_tier1_forcado_nao_entendido_tambem_gera_recibo(client, vault):
    corpo = client.post("/ask", json={"texto": "me explique derivadas", "forcar_tier": 1}).json()
    assert corpo["tier"] == 1 and corpo["entendeu"] is False
    assert len(list((vault / "recibos").rglob("*.md"))) == 1


def test_hoje(client):
    h = client.get("/hoje").json()
    assert h["data"] == "2026-10-03"
    assert h["data_extenso"] == "sábado, 3 de outubro"
    assert [e["titulo"] for e in h["agenda"]] == ["Feriado municipal", "Aula de Cálculo II", "Dentista"]
    assert [p["texto"] for p in h["prioridades"]] == ["Revisar limites", "Renovar livro da biblioteca", "Lista 3 de cálculo"]
    assert h["tarefas"] == {"abertas": 5, "hoje": 1, "atrasadas": 1, "concluidas_hoje": 0}
    assert [r["slug"] for r in h["rotinas"]] == ["compilar-raw"]


def test_concluir_tarefa_pelo_hud_altera_arquivo(client, vault):
    alvo = next(t for t in client.get("/tarefas").json() if t["texto"] == "Pagar conta de luz")
    resp = client.patch(f"/tarefas/{alvo['id']}", json={"concluida": True})
    assert resp.status_code == 200 and resp.json()["concluida"]
    conteudo = ler_texto(vault / "vida/tarefas.md")
    assert "- [x] Pagar conta de luz 📅 2026-10-05 #pessoal ✅ 2026-10-03" in conteudo
    # O resto do arquivo fica intacto.
    assert "Texto solto que não é tarefa." in conteudo
    assert client.get("/hoje").json()["tarefas"]["concluidas_hoje"] == 1


def test_editar_no_arquivo_reflete_na_api(client, vault):
    arquivo = vault / "vida/tarefas.md"
    arquivo.write_text(ler_texto(arquivo).replace("- [ ] Ler capítulo 4", "- [x] Ler capítulo 4"), encoding="utf-8")
    abertas = [t["texto"] for t in client.get("/tarefas").json()]
    assert "Ler capítulo 4" not in abertas


def test_criar_e_editar_tarefa(client, vault):
    nova = client.post("/tarefas", json={"texto": "Marcar médico", "vence": "2026-10-07", "prioridade": "alta", "tags": ["#saude"]})
    assert nova.status_code == 201
    t = nova.json()
    assert "- [ ] Marcar médico 📅 2026-10-07 ⏫ #saude" in ler_texto(vault / "vida/tarefas.md")

    editada = client.patch(f"/tarefas/{t['id']}", json={"texto": "Marcar dentista", "prioridade": None}).json()
    assert editada["texto"] == "Marcar dentista" and editada["prioridade"] is None
    assert "- [ ] Marcar dentista 📅 2026-10-07 #saude" in ler_texto(vault / "vida/tarefas.md")


def test_tarefa_inexistente(client):
    assert client.patch("/tarefas/naoexiste", json={"concluida": True}).status_code == 404


def test_captura_raw_texto_e_arquivo(client, vault):
    r = client.post("/raw", json={"texto": "Ideia: app de flashcards\ncom repetição espaçada"}).json()
    assert r["arquivo"] == "raw/2026-10-03-091512-ideia-app-de-flashcards.md"
    assert frontmatter.load(vault / r["arquivo"]).content.startswith("Ideia: app de flashcards")

    up = client.post("/raw/arquivo", files={"arquivo": ("Foto Quadro.PNG", b"\x89PNG...", "image/png")}).json()
    assert up["arquivo"] == "raw/2026-10-03-091512-foto-quadro.png"
    assert (vault / up["arquivo"]).read_bytes() == b"\x89PNG..."
