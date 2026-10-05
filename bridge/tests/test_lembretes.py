"""Fase 8: lembretes, triagem (lembrete × evento × tarefa × nota), propostas de evento e push."""

from datetime import timedelta

import pytest

from app import lembretes as agendador_lembretes
from app import propostas, push
from app.gandalf import tier3, triagem
from app.vault import lembretes
from conftest import AGORA, TZ
from test_tier2_tier3 import esperar_fim


# ---------- arquivo vida/lembretes.md ----------

def test_adicionar_ler_e_formatar(vault):
    x = lembretes.adicionar(vault, TZ, "Tirar a roupa da máquina", quando=AGORA.replace(hour=18, minute=30))
    r = lembretes.adicionar(vault, TZ, "Tomar remédio", recorrencia="0 22 * * *")
    texto = (vault / "vida/lembretes.md").read_text(encoding="utf-8")
    assert f"- [ ] Tirar a roupa da máquina ⏰ 2026-10-03 18:30 🆔 {x.id}" in texto
    assert f"- [ ] Tomar remédio 🔁 0 22 * * * 🆔 {r.id}" in texto
    lidos = lembretes.ler(vault, TZ)
    assert [y.texto for y in lidos] == ["Tirar a roupa da máquina", "Tomar remédio"]
    assert lidos[1].recorrente and lidos[0].quando.hour == 18


def test_linha_escrita_a_mao_ganha_id_ao_editar(vault):
    (vault / "vida/lembretes.md").write_text("# Lembretes\n\n- [ ] Regar plantas ⏰ 2026-10-04 08:00\n- [ ] item sem hora\n", encoding="utf-8")
    [x] = lembretes.ler(vault, TZ)  # checklist sem horário não é lembrete
    assert x.id.startswith("l")
    novo = lembretes.atualizar(vault, TZ, x.id, concluido=True, agora=AGORA)
    assert not novo.id.startswith("l") and novo.concluido
    assert "🆔 " + novo.id in (vault / "vida/lembretes.md").read_text(encoding="utf-8")


def test_validacoes(vault):
    with pytest.raises(lembretes.LembreteInvalido):
        lembretes.adicionar(vault, TZ, "x")  # sem horário
    with pytest.raises(lembretes.LembreteInvalido):
        lembretes.adicionar(vault, TZ, "x", recorrencia="isso não é cron")
    with pytest.raises(lembretes.LembreteInvalido):
        lembretes.adicionar(vault, TZ, "tem ⏰ dentro", quando=AGORA)


# ---------- Tier 1: lembretes sem IA ----------

@pytest.mark.parametrize(
    ("frase", "texto", "quando", "recorrencia"),
    [
        ("me lembre de pegar a roupa na máquina em 30 minutos", "Pegar a roupa na máquina", "2026-10-03 09:45", None),
        ("me avisa em meia hora de tirar o bolo do forno", "Tirar o bolo do forno", "2026-10-03 09:45", None),
        ("me avisa daqui a 2 horas pra ligar pra mãe", "Ligar pra mãe", "2026-10-03 11:15", None),
        ("Gandalf, me lembra amanhã às 9h de ligar pro banco", "Ligar pro banco", "2026-10-04 09:00", None),
        ("me lembra às 8 de acordar cedo", "Acordar cedo", "2026-10-04 08:00", None),  # 8h já passou: amanhã
        ("me lembra sexta às 8 da noite de ver o jogo", "Ver o jogo", "2026-10-09 20:00", None),
        ("me lembra de tomar remédio todo dia às 22h", "Tomar remédio", None, "0 22 * * *"),
        ("lembrete: academia toda segunda e quarta às 7h", "Academia", None, "0 7 * * 1,3"),
        ("me lembra de beber água em dias úteis às 15h", "Beber água", None, "0 15 * * 1,2,3,4,5"),
    ],
)
def test_interpretar_lembrete(frase, texto, quando, recorrencia):
    r = triagem.interpretar_lembrete(frase, AGORA)
    assert r is not None and r.texto == texto
    assert (f"{r.quando:%Y-%m-%d %H:%M}" if r.quando else None) == quando
    assert r.recorrencia == recorrencia


@pytest.mark.parametrize(
    "frase",
    [
        "me lembra que dia 3/10 é aniversário do Artur",  # data anual: Tier 2 (evento)
        "me lembra da consulta amanhã às 14h",  # compromisso: Tier 2 decide (agenda)
        "me lembra de comprar pão",  # sem horário: Tier 2 (tarefa)
        "me lembra hoje às 8 de algo",  # já passou: ambíguo
        "me notifica em 5 min",  # sem o que lembrar
    ],
)
def test_interpretar_deixa_para_o_tier2(frase):
    assert triagem.interpretar_lembrete(frase, AGORA) is None


def test_ask_lembrete_tier1_grava_e_responde(client, vault):
    r = client.post("/ask", json={"texto": "me lembra de pegar a roupa na máquina em 30 minutos"}).json()
    assert r["tier"] == 1 and r["intent"] == "lembrete"
    assert "hoje às 09:45 (em 30 min)" in r["resposta"]
    assert "Ative as notificações" in r["resposta"]  # nenhum aparelho inscrito
    [x] = lembretes.ler(vault, TZ)
    assert x.texto == "Pegar a roupa na máquina"
    r = client.post("/ask", json={"texto": "meus lembretes"}).json()
    assert r["intent"] == "lembretes" and "Pegar a roupa" in r["resposta"]


def test_anotacao_com_data_vai_para_o_tier2(client, vault):
    r = client.post("/ask", json={"texto": "anota que hoje é aniversário do meu irmão Artur"}).json()
    assert r["tier"] == 2  # não caiu no raw/ pelo Tier 1
    r = client.post("/ask", json={"texto": "anota: o livro Duna parece bom"}).json()
    assert r["tier"] == 1 and r["intent"] == "anotar"


# ---------- Tier 2: capturar ----------

def test_tier2_capturar_grava_cada_item_no_lugar_certo(client, vault):
    r = client.post("/ask", json={"texto": "CAPTURAR aniversário do Artur hoje"}).json()
    assert r["tier"] == 2 and r["intent"] == "capturar"
    d = r["dados"]
    # evento NÃO vai direto para a agenda: vira proposta para confirmar
    [p] = d["propostas"]
    assert p["evento"]["titulo"] == "Aniversário do Artur (irmão)" and p["evento"]["repetir"] == "anual"
    assert p["evento"]["dia_inteiro"] and p["evento"]["avisos_min"] == [900]
    assert "Criar na agenda" in r["resposta"]
    assert d["tarefas"][0]["texto"] == "Comprar presente" and d["tarefas"][0]["vence"] == "2026-10-09"
    textos = {x.texto: x for x in lembretes.ler(vault, TZ)}
    assert textos["Ligar pro Artur"].quando.hour == 18
    assert textos["Tomar remédio"].recorrencia == "0 22 * * *"


def test_executar_rejeita_lembrete_no_passado(vault):
    texto, dados = triagem.executar(vault, TZ, [{"tipo": "lembrete", "texto": "x", "quando": "2026-10-02T10:00"}], AGORA, "p", "hud")
    assert dados["erros"] and "já passou" in texto


# ---------- propostas de evento ----------

def test_argumentos_create_event():
    e = propostas.normalizar({"titulo": "Terapia", "data": "2026-10-06", "hora_inicio": "15:00", "repetir": "semanal"})
    assert e.hora_fim == "16:00" and e.avisos_min == [30]
    a = propostas.argumentos_create_event(e, "America/Sao_Paulo")
    assert a["startTime"] == "2026-10-06T15:00:00-03:00" and a["endTime"] == "2026-10-06T16:00:00-03:00"
    assert a["recurrenceData"] == ["RRULE:FREQ=WEEKLY"] and not a["allDay"]
    aniv = propostas.argumentos_create_event(propostas.normalizar({"titulo": "Aniv", "data": "2026-10-03", "dia_inteiro": True}), "America/Sao_Paulo")
    assert aniv["allDay"] and aniv["availability"] == "AVAILABILITY_FREE"
    assert aniv["endTime"].startswith("2026-10-04") and aniv["overrideReminders"] == [{"method": "popup", "minutes": 900}]


def test_confirmar_proposta_abre_sessao_agendar_restrita(client, vault):
    r = client.post("/ask", json={"texto": "CAPTURAR"}).json()
    pid = r["dados"]["propostas"][0]["id"]
    editado = {**r["dados"]["propostas"][0]["evento"], "titulo": "Niver do Artur"}
    c = client.post(f"/propostas/{pid}/confirmar", json={"evento": editado})
    assert c.status_code == 201
    sessao = c.json()["sessao"]
    assert sessao["skill"] == "agendar" and sessao["saida"] == "acao"
    assert '"summary": "Niver do Artur"' in sessao["tarefa"]
    s = tier3.gerenciador(vault).obter(sessao["id"])
    args = tier3.gerenciador(vault)._args(s)
    ferramentas = args[args.index("--allowedTools") + 1]
    assert "create_event" in ferramentas and "Write" not in ferramentas and "delete_event" not in ferramentas
    assert args[args.index("--model") + 1] == "haiku"
    esperar_fim(client, sessao["id"])
    assert client.post(f"/propostas/{pid}/confirmar", json={}).status_code == 409  # não cria duas vezes
    assert client.delete(f"/propostas/{pid}").status_code == 204


# ---------- agendador: disparo, atraso e recorrentes ----------

def test_disparar_unico_marca_concluido_e_publica(vault, agora, monkeypatch):
    enviados = []
    monkeypatch.setattr(push, "enviar", lambda n: enviados.append(n) or 1)
    x = lembretes.adicionar(vault, TZ, "Pegar a roupa", quando=AGORA - timedelta(minutes=40))
    ag = agendador_lembretes.AgendadorLembretes(vault, TZ)
    ev = ag.disparar(x.id, atrasado_de=x.quando)
    assert ev["atrasado"] and enviados[0].titulo == "⏰ Pegar a roupa"
    assert enviados[0].lembrete_id == x.id  # único: notificação com "Adiar"
    [y] = lembretes.ler(vault, TZ)
    assert y.concluido and y.concluido_em == AGORA.replace(second=0)  # o arquivo guarda HH:MM
    assert ag.disparar(x.id) is None  # não avisa duas vezes


def test_recarregar_recupera_unicos_vencidos_e_recorrente_perdido(vault, monkeypatch):
    agora = AGORA.replace(hour=22, minute=30)
    monkeypatch.setattr("app.clock.now", lambda: agora)
    vencido = lembretes.adicionar(vault, TZ, "Vencido", quando=agora - timedelta(hours=2))
    futuro = lembretes.adicionar(vault, TZ, "Futuro", quando=agora + timedelta(hours=1))
    remedio = lembretes.adicionar(vault, TZ, "Remédio", recorrencia="0 22 * * *")
    ag = agendador_lembretes.AgendadorLembretes(vault, TZ)
    ag._scheduler.start(paused=True)
    try:
        ag.recarregar(recuperar=True)
        ids = {j.id for j in ag._scheduler.get_jobs()}
        assert {f"atrasado-{vencido.id}", f"atrasado-{remedio.id}", futuro.id, remedio.id} <= ids
        # Já avisado depois das 22h: não recupera de novo
        agendador_lembretes._marcar_estado(remedio.id, agora.replace(minute=1))
        ag.recarregar(recuperar=True)
        assert f"atrasado-{remedio.id}" not in {j.id for j in ag._scheduler.get_jobs()}
    finally:
        ag.parar()


# ---------- API ----------

def test_api_lembretes_crud_e_adiar(client, vault):
    r = client.post("/lembretes", json={"texto": "Ligar pro João", "quando": "2026-10-03T10:00:00"})
    assert r.status_code == 201
    lid = r.json()["id"]
    assert r.json()["proximo"].startswith("2026-10-03T10:00")
    assert client.post("/lembretes", json={"texto": "x"}).status_code == 422
    r = client.patch(f"/lembretes/{lid}", json={"adiar_min": 10})
    assert r.json()["quando"].startswith("2026-10-03T09:25")
    client.patch(f"/lembretes/{lid}", json={"concluido": True})
    lista = client.get("/lembretes").json()
    assert lista[0]["concluido"] and lista[0]["proximo"] is None
    assert client.delete(f"/lembretes/{lid}").status_code == 204
    assert client.get("/lembretes").json() == []


def test_push_chave_inscricao_e_teste_sem_aparelho(client):
    chave = client.get("/push/chave").json()["chave"]
    assert len(chave) == 87  # ponto P-256 não comprimido em base64url
    assert client.get("/push/chave").json()["chave"] == chave  # chave persistida
    assert client.post("/push/teste").status_code == 409
    insc = {"endpoint": "https://push.exemplo/abc", "keys": {"p256dh": "x", "auth": "y"}}
    assert client.post("/push/inscrever", json={"inscricao": insc, "aparelho": "iPhone"}).status_code == 201
    assert client.get("/push/inscricoes").json()[0]["aparelho"] == "iPhone"
    assert client.post("/push/cancelar", json={"endpoint": insc["endpoint"]}).json()["removida"]


def test_push_remove_aparelho_desinscrito(monkeypatch):
    import pywebpush

    push.inscrever({"endpoint": "https://push.exemplo/morto", "keys": {"p256dh": "x", "auth": "y"}}, "velho")

    class Resp:
        status_code = 410

    def falha(*a, **k):
        raise pywebpush.WebPushException("gone", response=Resp())

    monkeypatch.setattr(pywebpush, "webpush", falha)
    assert push.enviar(push.Notificacao("t")) == 0
    assert push.inscricoes() == []


def test_aviso_do_dia(vault, monkeypatch):
    from app.routines.acoes import ACOES

    enviados = []
    monkeypatch.setattr(push, "enviar", lambda n: enviados.append(n) or 2)
    lembretes.adicionar(vault, TZ, "Algo", quando=AGORA + timedelta(hours=2))
    texto = ACOES["aviso-do-dia"][1](vault, AGORA)
    assert "lembrete" in enviados[0].corpo and "2 aparelho" in texto


def test_rotina_editar_horario_e_notificar(client, vault):
    r = client.post("/rotinas", json={"nome": "Teste push", "cron": "0 7 * * *", "tier": 1, "acao": "git-commit", "notificar": True})
    assert r.status_code == 201 and r.json()["notificar"]
    assert "notificar: true" in (vault / "vida/rotinas/teste-push.md").read_text(encoding="utf-8")
    r = client.patch("/rotinas/teste-push", json={"cron": "30 8 * * 1-5", "nome": "Teste", "notificar": False})
    assert r.json()["cron"] == "30 8 * * 1-5" and r.json()["quando"] == "seg–sex às 08:30" and not r.json()["notificar"]
    assert "notificar" not in (vault / "vida/rotinas/teste-push.md").read_text(encoding="utf-8")
