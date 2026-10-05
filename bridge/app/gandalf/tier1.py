"""Tier 1 do Gandalf: intents por regras (PT-BR) respondidas direto do vault. Sem rede, sem IA."""

import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from app.vault import reader, writer
from app.vault.tasks import Prioridade, Task, ordenar_prioridades

DIAS_SEMANA = ["segunda", "terca", "quarta", "quinta", "sexta", "sabado", "domingo"]
NOMES_DIA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
             "agosto", "setembro", "outubro", "novembro", "dezembro"]


@dataclass
class Contexto:
    vault: Path
    agora: datetime
    tz: ZoneInfo
    origem: str = "hud"

    @property
    def hoje(self) -> date:
        return self.agora.date()


@dataclass
class Resposta:
    intent: str
    texto: str
    dados: dict = field(default_factory=dict)


def normalizar(texto: str) -> str:
    """Minúsculas, sem acentos e sem pontuação final, para casar regex de forma tolerante."""
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", sem_acento.lower()).strip(" ?!.")


def data_por_extenso(d: date) -> str:
    return f"{NOMES_DIA[d.weekday()]}, {d.day} de {NOMES_MES[d.month - 1]}"


# ---------- interpretação de datas e prioridade em texto livre ----------

DATA_DDMM_RE = re.compile(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b")
DATA_ISO_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")


def extrair_data(texto_norm: str, hoje: date) -> tuple[date | None, str]:
    """Acha uma data no texto normalizado e devolve (data, texto sem a expressão)."""
    padroes: list[tuple[str, Callable[[re.Match], date]]] = [
        (r"\b(?:para |pra )?depois de amanha\b", lambda m: hoje + timedelta(days=2)),
        (r"\b(?:para |pra )?amanha\b", lambda m: hoje + timedelta(days=1)),
        (r"\b(?:para |pra )?hoje\b", lambda m: hoje),
    ]
    for i, dia in enumerate(DIAS_SEMANA):
        def proximo(m, i=i):
            delta = (i - hoje.weekday()) % 7 or 7
            return hoje + timedelta(days=delta)
        padroes.append((rf"\b(?:para |pra |na |no |ate )?(?:proxim[oa] )?{dia}(?:-feira)?\b", proximo))

    for padrao, calcular in padroes:
        if m := re.search(padrao, texto_norm):
            return calcular(m), (texto_norm[: m.start()] + texto_norm[m.end():])
    if m := DATA_ISO_RE.search(texto_norm):
        return date.fromisoformat(m.group(1)), texto_norm.replace(m.group(0), "")
    if m := DATA_DDMM_RE.search(texto_norm):
        dia, mes, ano = int(m.group(1)), int(m.group(2)), m.group(3)
        ano_i = int(ano) + (2000 if ano and len(ano) == 2 else 0) if ano else hoje.year
        try:
            d = date(ano_i, mes, dia)
        except ValueError:
            return None, texto_norm
        if not ano and d < hoje:
            d = d.replace(year=d.year + 1)
        return d, texto_norm.replace(m.group(0), "")
    return None, texto_norm


def _limpar_conectores(texto: str) -> str:
    texto = re.sub(r"\s+(para|pra|ate|no|na|em)\s*$", "", texto.strip())
    return re.sub(r"\s{2,}", " ", texto).strip(" ,:-")


# ---------- intents ----------

def _formatar_eventos(eventos: list[reader.Evento]) -> list[str]:
    linhas = []
    for e in eventos:
        if e.inicio:
            hora = f"{e.inicio}–{e.fim}" if e.fim else e.inicio
        else:
            hora = "dia todo"
        local = f" ({e.local})" if e.local else ""
        linhas.append(f"- {hora} {e.titulo}{local}")
    return linhas


def tarefa_dict(t: Task) -> dict:
    return {
        "id": t.id,
        "texto": t.texto,
        "concluida": t.concluida,
        "vence": t.vence.isoformat() if t.vence else None,
        "concluida_em": t.concluida_em.isoformat() if t.concluida_em else None,
        "prioridade": t.prioridade,
        "tags": t.tags,
    }


def _formatar_tarefa(t: Task, hoje: date) -> str:
    extra = []
    if t.vence:
        if t.vence < hoje:
            extra.append(f"atrasada desde {t.vence:%d/%m}")
        elif t.vence == hoje:
            extra.append("hoje")
        else:
            extra.append(f"até {t.vence:%d/%m}")
    if t.prioridade in ("maxima", "alta"):
        extra.append("prioridade alta")
    return f"- {t.texto}" + (f" ({', '.join(extra)})" if extra else "")


def intent_agenda(ctx: Contexto, m: re.Match) -> Resposta:
    dia = ctx.hoje + timedelta(days=1) if m.group("quando") and "amanha" in m.group("quando") else ctx.hoje
    rotulo = "amanhã" if dia != ctx.hoje else "hoje"
    eventos = reader.ler_agenda(ctx.vault, dia)
    tarefas = [t for t in ordenar_prioridades(reader.ler_tarefas(ctx.vault), dia) if t.vence and t.vence <= dia]

    linhas = [f"**{rotulo.capitalize()}, {data_por_extenso(dia)}**"]
    linhas += _formatar_eventos(eventos) if eventos else ["- Nenhum compromisso na agenda."]
    if tarefas:
        linhas += ["", f"Tarefas para {rotulo}:"] + [_formatar_tarefa(t, ctx.hoje) for t in tarefas]
    return Resposta(
        "agenda",
        "\n".join(linhas),
        {"data": dia.isoformat(), "eventos": [e.__dict__ for e in eventos], "tarefas": [tarefa_dict(t) for t in tarefas]},
    )


def intent_prioridades(ctx: Contexto, m: re.Match) -> Resposta:
    top = ordenar_prioridades(reader.ler_tarefas(ctx.vault), ctx.hoje)[:3]
    if not top:
        return Resposta("prioridades", "Nenhuma tarefa aberta. 🌱", {"tarefas": []})
    linhas = ["Suas 3 prioridades:"] + [_formatar_tarefa(t, ctx.hoje) for t in top]
    return Resposta("prioridades", "\n".join(linhas), {"tarefas": [tarefa_dict(t) for t in top]})


def intent_tarefas(ctx: Contexto, m: re.Match) -> Resposta:
    abertas = ordenar_prioridades(reader.ler_tarefas(ctx.vault), ctx.hoje)
    if not abertas:
        return Resposta("tarefas", "Nenhuma tarefa aberta. 🌱", {"tarefas": []})
    mostrar = abertas[:10]
    linhas = [f"Você tem {len(abertas)} tarefa(s) aberta(s):"] + [_formatar_tarefa(t, ctx.hoje) for t in mostrar]
    if len(abertas) > len(mostrar):
        linhas.append(f"…e mais {len(abertas) - len(mostrar)}.")
    return Resposta("tarefas", "\n".join(linhas), {"tarefas": [tarefa_dict(t) for t in abertas]})


def intent_adicionar_tarefa(ctx: Contexto, m: re.Match) -> Resposta:
    original = m.group("resto")
    # Trabalhamos no texto normalizado só para achar data/prioridade; o texto salvo mantém acentos.
    norm = normalizar(original)
    vence, sem_data = extrair_data(norm, ctx.hoje)
    prioridade: Prioridade | None = None
    if re.search(r"\b(urgente|importante|prioridade alta)\b", sem_data):
        prioridade = "alta"
        sem_data = re.sub(r"\b(urgente|importante|prioridade alta)\b", "", sem_data)
    tags = re.findall(r"#([\w/-]+)", original)

    # Recupera o texto com acentos: remove do original as mesmas palavras que saíram do normalizado.
    palavras_mantidas = set(_limpar_conectores(re.sub(r"#[\w/-]+", "", sem_data)).split())
    texto = " ".join(
        p for p in re.sub(r"#[\w/-]+", "", original).split() if normalizar(p) in palavras_mantidas
    )
    texto = _limpar_conectores(texto) or original.strip()

    tarefa = writer.adicionar_tarefa(ctx.vault, texto, vence=vence, prioridade=prioridade, tags=tags)
    detalhe = f" para {tarefa.vence:%d/%m}" if tarefa.vence else ""
    return Resposta("adicionar_tarefa", f"Tarefa adicionada{detalhe}: {tarefa.texto}", {"tarefa": tarefa_dict(tarefa)})


# Data, hora ou cara de compromisso numa anotação: pode ser lembrete/evento, o Tier 2 decide.
SINAL_DE_DATA_RE = re.compile(
    r"\b(hoje|amanha|ontem|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|"
    r"aniversario|niver|consulta|reuniao|terapia|prova|lembra|lembrar|avisa|todo dia|toda|todos os|"
    r"janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b"
    r"|\b\d{1,2}/\d{1,2}\b|\b\d{1,2}(?::\d{2}|h\d{0,2})\b"
)


def intent_anotar(ctx: Contexto, m: re.Match) -> Resposta | None:
    texto = m.group("resto").strip()
    if SINAL_DE_DATA_RE.search(normalizar(texto)):
        return None
    caminho = writer.salvar_raw(ctx.vault, texto, ctx.agora, ctx.origem)
    rel = caminho.relative_to(ctx.vault).as_posix()
    return Resposta("anotar", f"Anotado em `{rel}`.", {"arquivo": rel})


def intent_lembretes(ctx: Contexto, m: re.Match) -> Resposta:
    from app.gandalf.triagem import descrever_quando, descrever_recorrencia
    from app.lembretes import lembrete_json
    from app.vault import lembretes

    pendentes = [x for x in lembretes.ler(ctx.vault, ctx.tz) if not x.concluido]
    if not pendentes:
        return Resposta("lembretes", "Nenhum lembrete pendente.", {"lembretes": []})
    unicos = sorted((x for x in pendentes if x.quando), key=lambda x: x.quando)
    recorrentes = [x for x in pendentes if x.recorrente]
    linhas = ["Seus lembretes:"]
    linhas += [f"- {descrever_quando(x.quando, ctx.agora)}: {x.texto}" for x in unicos]
    linhas += [f"- {descrever_recorrencia(x.recorrencia)}: {x.texto}" for x in recorrentes]
    return Resposta("lembretes", "\n".join(linhas), {"lembretes": [lembrete_json(x) for x in unicos + recorrentes]})


def intent_rotinas(ctx: Contexto, m: re.Match) -> Resposta:
    rotinas = reader.ler_rotinas(ctx.vault)
    if not rotinas:
        return Resposta("rotinas", "Nenhuma rotina cadastrada em vida/rotinas/.", {"rotinas": []})
    linhas = ["Suas rotinas:"] + [
        f"- {r.nome}: {r.quando} ({'ativa' if r.ativa else 'pausada'})" for r in rotinas
    ]
    return Resposta("rotinas", "\n".join(linhas), {"rotinas": [r.__dict__ for r in rotinas]})


# Ordem importa: adicionar/anotar antes de "tarefas" (que é mais genérico).
# Os padrões rodam sobre o texto normalizado; grupos "resto" são recortados do texto original.
INTENTS: list[tuple[re.Pattern, Callable[[Contexto, re.Match], Resposta]]] = [
    (re.compile(r"^(?:(?:gandalf|jev),? )?(?:adiciona|adicionar|adicione|add|cria|criar|crie|nova|novo)(?: uma)? tarefa:? (?P<resto>.+)$"), intent_adicionar_tarefa),
    (re.compile(r"^(?:(?:gandalf|jev),? )?(?:anota|anote|anotar|captura|capturar):? (?P<resto>.+)$"), intent_anotar),
    (re.compile(r"^(?:(?:gandalf|jev),? )?(?:quais (?:sao )?(?:os )?)?(?:meus )?lembretes(?: pendentes| de hoje)?$"), intent_lembretes),
    (re.compile(r"^(?:(?:gandalf|jev),? )?(?:o que (?:eu )?tenho|qual (?:e )?(?:a )?minha agenda|minha agenda|agenda|compromissos|meus compromissos)(?: (?:para |pra |de )?(?P<quando>hoje|amanha))?$"), intent_agenda),
    (re.compile(r"^(?:(?:gandalf|jev),? )?(?:quais (?:sao )?(?:as )?)?(?:minhas )?prioridades(?: de hoje| do dia)?$"), intent_prioridades),
    (re.compile(r"^(?:(?:gandalf|jev),? )?(?:quais (?:sao )?(?:as )?)?(?:minhas )?tarefas(?: (?:de hoje|pendentes|abertas))?$"), intent_tarefas),
    (re.compile(r"^(?:(?:gandalf|jev),? )?(?:quais (?:sao )?(?:as )?)?(?:minhas )?rotinas$"), intent_rotinas),
]


def responder(texto: str, ctx: Contexto) -> Resposta | None:
    """Tenta casar o pedido com um intent. None = não é Tier 1."""
    from app.gandalf import triagem

    if lembrete := triagem.interpretar_lembrete(texto, ctx.agora):
        resposta, dados = triagem.criar_lembrete(ctx.vault, ctx.tz, lembrete, ctx.agora)
        return Resposta("lembrete", resposta, {"lembretes": [dados]})
    norm = normalizar(texto)
    for padrao, handler in INTENTS:
        m = padrao.match(norm)
        if not m:
            continue
        if "resto" in padrao.groupindex:
            # Recorta o "resto" do texto original (mesmo comprimento final, já que só tiramos acentos).
            m = _MatchOriginal(m, texto, norm)
        if (r := handler(ctx, m)) is not None:  # handler pode recusar (ex.: anotação com data)
            return r
    return None


class _MatchOriginal:
    """Faz `group('resto')` devolver o trecho com acentos/maiúsculas do texto original."""

    def __init__(self, m: re.Match, original: str, norm: str):
        self._m = m
        palavras_norm = norm.split()
        palavras_orig = re.sub(r"\s+", " ", original.strip()).rstrip(" ?!.").split()
        inicio = len(norm[: m.start("resto")].split())
        self._resto = " ".join(palavras_orig[inicio:]) if len(palavras_orig) == len(palavras_norm) else m.group("resto")

    def group(self, nome):
        return self._resto if nome == "resto" else self._m.group(nome)
