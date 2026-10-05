"""Triagem de capturas: decide para onde vai cada coisa que o usuário pede para lembrar.

| Destino | Quando |
|---|---|
| lembrete (vida/lembretes.md + push) | cutucada num momento: "em 30 min", "amanhã 9h ligar pro banco", "todo dia 22h remédio" |
| evento (Google Agenda, com confirmação) | compromisso que ocupa tempo / tem lugar / outras pessoas, datas anuais (aniversário) |
| tarefa (vida/tarefas.md) | algo a fazer sem horário exato ("pagar boleto até sexta") |
| nota (raw/) | informação para guardar, sem ação nem data |

O Tier 1 resolve só os lembretes inequívocos (com hora clara e sem cara de compromisso), sem IA.
O resto vai para o Tier 2, que devolve `{"acao": "capturar", "itens": [...]}`; `executar` grava.
"""

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from app import lembretes as agendador_lembretes
from app import propostas, push
from app.gandalf.tier1 import data_por_extenso, extrair_data, tarefa_dict
from app.vault import lembretes, writer

DIAS_CRON = {"domingo": 0, "segunda": 1, "terca": 2, "quarta": 3, "quinta": 4, "sexta": 5, "sabado": 6}
NUMEROS = {"um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4, "cinco": 5, "dez": 10, "quinze": 15, "vinte": 20}

# Cara de compromisso: com data/hora absoluta, deixa o Tier 2 decidir (pode ser evento da agenda).
COMPROMISSO_RE = re.compile(
    r"\b(consulta|reuniao|terapia|terapeuta|psicolog[oa]|aniversario|niver|dentista|medic[oa]|prova|entrevista|"
    r"voo|aula|compromisso|evento|festa|casamento|formatura|exame|show|viagem|call|meeting|"
    r"(?:jantar|almoco|cafe|encontro) com)\b"
)

GATILHO_RE = re.compile(
    r"^(?:(?:gandalf|jev),? )?(?:(?:me )?(?:lembra|lembre|lembrar|avisa|avise|notifica|notifique|alerta|alerte)(?:-me| me)?"
    r"|(?:cria|crie|criar|adiciona|adicione|coloca|coloque|poe|ponha|novo|nova)?\s*(?:um |uma )?lembrete:?)\s+(?P<resto>.+)$"
)
RELATIVO_RE = re.compile(
    r"\b(?:em|daqui a|daqui|dentro de)\s+"
    r"(?:(?P<meia>meia hora)|(?P<n>\d+|um|uma|dois|duas|tres|quatro|cinco|dez|quinze|vinte)\s*"
    r"(?P<u>minutos?|mins?|min|m|horas?|hrs?|hr|h)\b(?:\s*e\s*(?:(?P<emeia>meia)|(?P<n2>\d+)\s*(?:minutos?|mins?|min|m)?))?"
    r"|(?P<hm_h>\d+)h(?P<hm_m>\d{2}))"
)
PERIODO = r"(?:\s+(?:da|de)\s+(?P<per>manha|tarde|noite|madrugada))?"
ABSOLUTO_RE = re.compile(
    r"\b(?:(?:as|a|ao|pelas|pela)\s+)?"
    r"(?:(?P<meio>meio-dia|meio dia|meia-noite|meia noite)"
    r"|(?P<h>\d{1,2})(?::(?P<m>\d{2})|h(?P<m2>\d{2})?\b|(?=\s+(?:da|de)\s+(?:manha|tarde|noite|madrugada))))" + PERIODO
)
ABSOLUTO_AS_RE = re.compile(r"\b(?:as|pelas)\s+(?P<h>\d{1,2})\b(?!/)" + PERIODO)
TODO_DIA_RE = re.compile(r"\b(?:todo dia|todos os dias|diariamente|toda noite|toda manha)\b")
UTEIS_RE = re.compile(r"\b(?:(?:em |nos )?dias? (?:uteis|de semana)|de segunda a sexta)\b")
FIM_SEMANA_RE = re.compile(r"\b(?:(?:no|nos|todo|todos os) )?fins? de semana\b")
DIA_NOME = r"(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?"
TODA_RE = re.compile(rf"\b(?:toda|todo|todas as|todos os)\s+{DIA_NOME}s?((?:\s*(?:,|e)\s*(?:toda\s+|todo\s+)?{DIA_NOME}s?)*)")
CONECTORES_INICIO = re.compile(r"^(?:(?:de|que|pra|para|da|do|sobre)\s+(?:eu\s+)?)+")
CONECTORES_FIM = re.compile(r"(?:\s+(?:de|que|pra|para|e|as|a|no|na|em|hoje))+$")


def norm_alinhado(texto: str) -> str:
    """Minúsculas sem acento com o MESMO comprimento do original (para recortar trechos)."""
    saida = []
    for c in texto:
        n = unicodedata.normalize("NFKD", c).encode("ascii", "ignore").decode().lower()
        saida.append(n[0] if n else " ")
    return "".join(saida)


@dataclass
class LembreteInterpretado:
    texto: str
    quando: datetime | None = None
    recorrencia: str | None = None


def _num(v: str) -> int:
    return int(v) if v.isdigit() else NUMEROS[v]


def _hora(m: re.Match) -> time | None:
    if m.groupdict().get("meio"):
        return time(12, 0) if "dia" in m.group("meio") else time(0, 0)
    h = int(m.group("h"))
    minuto = int(m.groupdict().get("m") or m.groupdict().get("m2") or 0)
    per = m.group("per")
    if per in ("tarde", "noite") and h < 12:
        h += 12
    if per == "noite" and h == 24:
        h = 0
    if h > 23 or minuto > 59:
        return None
    return time(h, minuto)


def _recorte(original: str, spans: list[tuple[int, int]]) -> str:
    texto = original
    for a, b in sorted(spans, reverse=True):
        texto = texto[:a] + " " + texto[b:]
    texto = re.sub(r"\s{2,}", " ", texto).strip(" ,.;:-!?")
    n = norm_alinhado(texto)
    if m := CONECTORES_INICIO.match(n):
        texto, n = texto[m.end():], n[m.end():]
    if m := CONECTORES_FIM.search(n):
        texto = texto[: m.start()]
    texto = texto.strip(" ,.;:-!?")
    return texto[:1].upper() + texto[1:] if texto else texto


def interpretar_lembrete(texto: str, agora: datetime) -> LembreteInterpretado | None:
    """Lembrete inequívoco ("me lembra de X em 30 min", "me avisa amanhã às 9h de Y",
    "lembrete: remédio todo dia 22h"). None = deixa para o Tier 2."""
    original = re.sub(r"\s+", " ", texto.strip()).rstrip(" ?!.")
    n = norm_alinhado(original)
    g = GATILHO_RE.match(n)
    if not g:
        return None
    ini = g.start("resto")
    resto_o, resto_n = original[ini:], n[ini:]

    # 1) relativo: "em 30 min", "daqui a 2 horas", "em meia hora", "em 1h30"
    if m := RELATIVO_RE.search(resto_n):
        if m.group("meia"):
            delta = timedelta(minutes=30)
        elif m.group("hm_h"):
            delta = timedelta(hours=int(m.group("hm_h")), minutes=int(m.group("hm_m")))
        else:
            qtd = _num(m.group("n"))
            delta = timedelta(hours=qtd) if m.group("u").startswith("h") else timedelta(minutes=qtd)
            if m.group("emeia"):
                delta += timedelta(minutes=30)
            elif m.group("n2"):
                delta += timedelta(minutes=int(m.group("n2")))
        if not timedelta(minutes=1) <= delta <= timedelta(days=7):
            return None
        texto_l = _recorte(resto_o, [m.span()])
        return LembreteInterpretado(texto_l, quando=(agora + delta).replace(second=0, microsecond=0)) if texto_l else None

    # 2) horário absoluto (obrigatório daqui em diante)
    spans: list[tuple[int, int]] = []
    m = ABSOLUTO_RE.search(resto_n) or ABSOLUTO_AS_RE.search(resto_n)
    if not m:
        return None
    hora = _hora(m)
    if hora is None:
        return None
    spans.append(m.span())

    # 3) recorrência
    dias: list[int] | None = None  # [] = todo dia
    if r := TODO_DIA_RE.search(resto_n):
        dias = []
    elif r := UTEIS_RE.search(resto_n):
        dias = [1, 2, 3, 4, 5]
    elif r := FIM_SEMANA_RE.search(resto_n):
        dias = [0, 6]
    elif r := TODA_RE.search(resto_n):
        dias = sorted({DIAS_CRON[x] for x in re.findall(DIA_NOME, r.group(0))})
    if r:
        spans.append(r.span())

    if COMPROMISSO_RE.search(resto_n):
        return None  # pode ser compromisso de agenda: o Tier 2 decide

    if dias is not None:
        dow = ",".join(map(str, dias)) if dias else "*"
        texto_l = _recorte(resto_o, spans)
        return LembreteInterpretado(texto_l, recorrencia=f"{hora.minute} {hora.hour} * * {dow}") if texto_l else None

    # 4) data (hoje, amanhã, sexta, 10/10…) sem recorrência
    sem_hora = resto_n[: m.start()] + " " * (m.end() - m.start()) + resto_n[m.end():]
    dia, depois = extrair_data(sem_hora, agora.date())
    if dia is not None:
        # extrair_data devolve o texto sem a expressão: acha o trecho removido comparando os dois
        a = next((i for i, (x, y) in enumerate(zip(sem_hora, depois)) if x != y), len(depois))
        spans.append((a, a + len(sem_hora) - len(depois)))
    quando = datetime.combine(dia or agora.date(), hora, agora.tzinfo)
    if quando <= agora:
        if dia is not None:
            return None  # "hoje às 8" quando já são 10: ambíguo
        quando += timedelta(days=1)
    texto_l = _recorte(resto_o, spans)
    return LembreteInterpretado(texto_l, quando=quando) if texto_l else None


# ---------- descrição para o usuário ----------

def descrever_quando(quando: datetime, agora: datetime) -> str:
    hora = f"{quando:%H:%M}"
    if quando.date() == agora.date():
        dia = "hoje"
    elif quando.date() == agora.date() + timedelta(days=1):
        dia = "amanhã"
    else:
        dia = data_por_extenso(quando.date())
    falta = quando - agora
    extra = ""
    if timedelta(0) < falta < timedelta(hours=3):
        minutos = round(falta.total_seconds() / 60)
        extra = f" (em {minutos} min)" if minutos < 60 else f" (em {minutos // 60}h{minutos % 60:02d})"
    return f"{dia} às {hora}{extra}"


def descrever_recorrencia(cron_expr: str) -> str:
    from app import cron

    return cron.descrever(cron_expr)


def descrever_evento(e: propostas.Evento) -> str:
    dia = data_por_extenso(date.fromisoformat(e.data))
    hora = "dia inteiro" if e.dia_inteiro else f"{e.hora_inicio}–{e.hora_fim}"
    rep = {"anual": "todo ano", "mensal": "todo mês", "semanal": "toda semana", "diaria": "todo dia"}.get(e.repetir or "", "")
    return f"**{e.titulo}**, {dia} ({hora}{', ' + rep if rep else ''})"


def _sem_aparelhos() -> str:
    return "" if push.inscricoes() else "\n\n_Ative as notificações na tela Hoje para receber o aviso no celular._"


# ---------- execução ----------

def criar_lembrete(vault: Path, tz: ZoneInfo, item: LembreteInterpretado, agora: datetime, dica: bool = True) -> tuple[str, dict]:
    x = lembretes.adicionar(vault, tz, item.texto, quando=item.quando, recorrencia=item.recorrencia)
    agendador_lembretes.recarregar_se_ativo(vault)
    quando = descrever_recorrencia(x.recorrencia) if x.recorrente else descrever_quando(x.quando, agora)
    texto = f"⏰ Lembrete: {x.texto} — {quando}."
    return texto + (_sem_aparelhos() if dica else ""), agendador_lembretes.lembrete_json(x)


def _lembrete_de_item(item: dict, agora: datetime) -> LembreteInterpretado:
    texto = str(item.get("texto") or "").strip()
    if not texto:
        raise ValueError("lembrete sem texto")
    if item.get("quando"):
        quando = datetime.fromisoformat(str(item["quando"]).replace("Z", ""))
        quando = (quando if quando.tzinfo else quando.replace(tzinfo=agora.tzinfo)).replace(second=0, microsecond=0)
        if quando <= agora - timedelta(minutes=1):
            raise ValueError(f"o horário do lembrete já passou ({quando:%d/%m %H:%M})")
        return LembreteInterpretado(texto, quando=quando)
    hora = str(item.get("hora") or "").strip()
    if not re.fullmatch(r"\d{1,2}:\d{2}", hora):
        raise ValueError("lembrete sem horário")
    h, m = map(int, hora.split(":"))
    dias = sorted({int(d) % 7 for d in item.get("dias_semana") or []})
    return LembreteInterpretado(texto, recorrencia=f"{m} {h} * * {','.join(map(str, dias)) if dias else '*'}")


def executar(vault: Path, tz: ZoneInfo, itens: list[dict], agora: datetime, pedido: str, origem: str) -> tuple[str, dict]:
    """Grava os itens decididos pelo Tier 2. Eventos viram propostas (não vão direto para a agenda)."""
    linhas: list[str] = []
    dados: dict = {"lembretes": [], "tarefas": [], "notas": [], "propostas": [], "erros": []}
    for item in itens[:6]:
        tipo = item.get("tipo")
        try:
            if tipo == "lembrete":
                texto, j = criar_lembrete(vault, tz, _lembrete_de_item(item, agora), agora, dica=False)
                linhas.append(texto)
                dados["lembretes"].append(j)
            elif tipo == "tarefa":
                texto = str(item.get("texto") or "").strip()
                if not texto:
                    raise ValueError("tarefa sem texto")
                vence = date.fromisoformat(item["vence"][:10]) if item.get("vence") else None
                prioridade = item.get("prioridade") if item.get("prioridade") in ("alta", "media", "baixa") else None
                t = writer.adicionar_tarefa(vault, texto[:300], vence=vence, prioridade=prioridade)
                linhas.append(f"✅ Tarefa: {t.texto}" + (f" — até {data_por_extenso(t.vence)}" if t.vence else "") + ".")
                dados["tarefas"].append(tarefa_dict(t))
            elif tipo == "nota":
                texto = str(item.get("texto") or "").strip()
                if not texto:
                    raise ValueError("nota sem texto")
                caminho = writer.salvar_raw(vault, texto, agora, origem)
                rel = caminho.relative_to(vault).as_posix()
                linhas.append(f"📝 Anotado em `{rel}`.")
                dados["notas"].append(rel)
            elif tipo == "evento":
                e = propostas.normalizar(item)
                p = propostas.criar(e, pedido, origem)
                linhas.append(f"📅 Proposta para o Google Agenda: {descrever_evento(e)}. Confira e toque em **Criar na agenda**.")
                dados["propostas"].append({"id": p.id, "evento": p.evento.__dict__, "status": p.status})
            else:
                raise ValueError(f"tipo desconhecido: {tipo}")
        except (ValueError, KeyError, TypeError, propostas.PropostaInvalida, lembretes.LembreteInvalido) as e:
            dados["erros"].append(f"{tipo}: {e}")
            linhas.append(f"⚠️ Não consegui registrar um item ({tipo}): {e}.")
    if dados["lembretes"]:
        linhas[-1] += _sem_aparelhos()
    return "\n".join(linhas) or "Nada para registrar.", {k: v for k, v in dados.items() if v}

