"""Bridge: app FastAPI que recebe pedidos de todas as portas (HUD, Obsidian, voz)."""

import asyncio
import json
import logging
import os
import re
import secrets
from contextlib import asynccontextmanager
import threading
import time
from dataclasses import asdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    WebSocketException,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.requests import HTTPConnection

from app import biblioteca, clock, efemeros, propostas, push
from app import lembretes as lembretes_ag
from app.config import get_settings
from app import estudos as estudos_mod
from app.estudos import listar_materias
from app.eventos import eventos_gerais
from app.gandalf import claude_cli, tier3
from app.gandalf import router as gandalf
from app.gandalf.tier1 import data_por_extenso, tarefa_dict
from app.recibos_index import custos_por_dia, ler_recibos, para_json
from app.routines import arquivos as rotinas_arq
from app.routines import scheduler, status as rotinas_status
from app.routines.acoes import ACOES
from app.skills.catalog import listar_skills
from app.speech import voz
from app.vault import lembretes as lembretes_vault
from app.vault import navegar, reader, writer
from app.vault.tasks import ordenar_prioridades

Origem = Literal["hud", "obsidian", "voz", "rotina"]
Prioridade = Literal["maxima", "alta", "media", "baixa", "minima"]


def require_token(conn: HTTPConnection) -> None:
    """Bearer no header; em WebSocket (o navegador não manda header) aceita ?token=."""
    expected = get_settings().token
    eh_ws = conn.scope["type"] == "websocket"
    if not expected:
        if eh_ws:
            raise WebSocketException(status.WS_1011_INTERNAL_ERROR, "BRIDGE_TOKEN não configurado")
        raise HTTPException(500, "BRIDGE_TOKEN não configurado no .env")
    scheme, _, received = conn.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" and eh_ws:
        received = conn.query_params.get("token", "")
    elif scheme.lower() != "bearer":
        received = ""
    if not received or not secrets.compare_digest(received, expected):
        if eh_ws:
            raise WebSocketException(status.WS_1008_POLICY_VIOLATION, "token inválido")
        raise HTTPException(401, "token inválido")


def get_vault() -> Path:
    vault = get_settings().vault_path
    if not vault.is_dir():
        raise HTTPException(503, f"vault não encontrado em {vault}")
    return vault


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Liga os agendadores (rotinas e lembretes) junto com o Bridge (LIFEOS_AGENDADOR=0 desliga, ex.: testes)."""
    ags = []
    vault = get_settings().vault_path
    if os.getenv("LIFEOS_VOZ_PRECARGA", "1") != "0":
        voz.pre_carregar()
    if os.getenv("LIFEOS_AGENDADOR", "1") != "0" and vault.is_dir():
        ags = [scheduler.agendador(vault), lembretes_ag.agendador(vault)]
        for ag in ags:
            ag.iniciar()
    yield
    for ag in ags:
        ag.parar()


logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Gandalf Bridge", version="0.5.0", dependencies=[Depends(require_token)], lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)

# Status do Claude Code em cache: `claude auth status` leva ~1 s, e o /health é chamado direto.
_claude_status: dict = {"quando": 0.0, "dados": None}
_claude_lock = threading.Lock()


def status_claude(forcar: bool = False) -> dict:
    with _claude_lock:
        if forcar or not _claude_status["dados"] or time.monotonic() - _claude_status["quando"] > 60:
            _claude_status["dados"] = claude_cli.status_login()
            _claude_status["quando"] = time.monotonic()
        return _claude_status["dados"]


@app.get("/health")
def health(claude: bool = False) -> dict:
    settings = get_settings()
    dados = {
        "status": "ok",
        "versao": app.version,
        "vault": str(settings.vault_path),
        "vault_existe": (settings.vault_path / "CLAUDE.md").is_file(),
    }
    if claude:
        dados["claude"] = status_claude()
    return dados


# ---------- Gandalf ----------

class TrocaAnterior(BaseModel):
    pergunta: str = Field(max_length=1000)
    resposta: str = Field(max_length=1500)


class Pedido(BaseModel):
    texto: str = Field(min_length=1, max_length=4000)
    origem: Origem = "hud"
    forcar_tier: Literal[1, 2, 3] | None = None
    confirmar: bool = False
    # Últimas trocas da conversa (o HUD manda até 2 recentes) para o Tier 2 entender continuações.
    anterior: list[TrocaAnterior] = Field(default_factory=list, max_length=2)
    # Nota de estudo aberta no HUD ("perguntar ao Gandalf sobre este tópico"): vai como contexto do Tier 2.
    nota: str | None = Field(default=None, max_length=500)


@app.post("/ask")
def ask(pedido: Pedido, vault: Path = Depends(get_vault)) -> dict:
    anterior = [t.model_dump() for t in pedido.anterior]
    nota = None
    if pedido.nota:
        arquivo = (vault / pedido.nota).resolve()
        if not arquivo.is_relative_to((vault / "wiki").resolve()) or arquivo.suffix != ".md" or not arquivo.is_file():
            raise HTTPException(400, "nota inválida (só notas de wiki/)")
        texto_nota = reader.ler_texto(arquivo)
        # Nota de estudo: as anotações do usuário sobre o tópico vão junto.
        if m := re.fullmatch(r"wiki/estudos/([\w-]+)/[^_].*\.md", pedido.nota):
            try:
                minhas = estudos_mod.listar_anotacoes(vault, m.group(1), pedido.nota)
            except (FileNotFoundError, estudos_mod.CaminhoInvalido):
                minhas = []
            if minhas:
                texto_nota += "\n\n## Anotações do usuário sobre este tópico\n" + "\n\n".join(a["texto"] for a in minhas)
        nota = (pedido.nota, texto_nota)
    try:
        r = gandalf.perguntar(vault, pedido.texto, pedido.origem, pedido.forcar_tier, pedido.confirmar, anterior, nota)
    except claude_cli.ClaudeIndisponivel as e:
        raise HTTPException(503, str(e)) from e
    except claude_cli.ClaudeFalhou as e:
        raise HTTPException(502, str(e)) from e
    return asdict(r)


# ---------- Sessões do Claude Code (Tier 3) ----------

class Continuacao(BaseModel):
    texto: str = Field(min_length=1, max_length=4000)


def _sessao_ou_404(vault: Path, sessao_id: str) -> tier3.Sessao:
    s = tier3.gerenciador(vault).obter(sessao_id)
    if not s:
        raise HTTPException(404, "sessão não encontrada (as sessões ficam só na memória do Bridge)")
    return s


@app.get("/sessoes")
def listar_sessoes(vault: Path = Depends(get_vault)) -> list[dict]:
    return [s.resumo() for s in tier3.gerenciador(vault).listar()]


@app.get("/sessoes/{sessao_id}")
def obter_sessao(sessao_id: str, vault: Path = Depends(get_vault)) -> dict:
    return _sessao_ou_404(vault, sessao_id).resumo()


@app.delete("/sessoes/{sessao_id}")
def cancelar_sessao(sessao_id: str, vault: Path = Depends(get_vault)) -> dict:
    _sessao_ou_404(vault, sessao_id)
    return tier3.gerenciador(vault).cancelar(sessao_id).resumo()


@app.post("/sessoes/{sessao_id}/continuar", status_code=201)
def continuar_sessao(sessao_id: str, c: Continuacao, vault: Path = Depends(get_vault)) -> dict:
    anterior = _sessao_ou_404(vault, sessao_id)
    if anterior.status in tier3.ATIVAS:
        raise HTTPException(409, "a sessão ainda está rodando")
    if not anterior.claude_session_id:
        raise HTTPException(409, "essa sessão não tem id do Claude Code para retomar")
    nova = tier3.gerenciador(vault).criar(c.texto, origem=anterior.origem, retomada_de=anterior.id)
    return nova.resumo()


@app.websocket("/ws/stream/{sessao_id}")
async def ws_stream(ws: WebSocket, sessao_id: str):
    vault = get_settings().vault_path
    g = tier3.gerenciador(vault)
    s = g.obter(sessao_id)
    await ws.accept()
    if not s:
        # Fecha depois de aceitar: recusar no handshake chega ao navegador como 1006 genérico,
        # e o HUD não saberia que não adianta reconectar.
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="sessão não encontrada")
        return
    passados, fila = g.assinar(s, asyncio.get_running_loop())
    try:
        await ws.send_json({"type": "lifeos_status", "status": s.status, "resumo": s.resumo()})
        for ev in passados:
            await ws.send_json(ev)
        if s.status not in tier3.ATIVAS and not any(e.get("type") == "lifeos_fim" for e in passados):
            await ws.send_json({"type": "lifeos_fim", "status": s.status, "resumo": s.resumo()})
        while True:
            await ws.send_json(await fila.get())
    except WebSocketDisconnect:
        pass
    finally:
        s.canal.cancelar(fila)


@app.websocket("/ws/events")
async def ws_eventos(ws: WebSocket):
    await ws.accept()
    fila = eventos_gerais.assinar(asyncio.get_running_loop())
    try:
        while True:
            await ws.send_json(await fila.get())
    except WebSocketDisconnect:
        pass
    finally:
        eventos_gerais.cancelar(fila)


# ---------- Skills ----------

class ExecucaoSkill(BaseModel):
    instrucao: str = Field(default="", max_length=4000)


def _ultima_por_intent(vault: Path, prefixo: str) -> dict[str, dict]:
    agora = clock.now()
    ultimas: dict[str, dict] = {}
    for r in ler_recibos(vault, (agora - timedelta(days=60)).date(), agora.date()):
        intent = r["intent"] or ""
        if intent.startswith(prefixo):
            ultimas[intent[len(prefixo):]] = para_json(r)
    return ultimas


@app.get("/skills")
def skills(vault: Path = Depends(get_vault)) -> list[dict]:
    ultimas = _ultima_por_intent(vault, "skill:")
    return [{**asdict(s), "ultima_execucao": ultimas.get(s.nome)} for s in listar_skills(vault)]


@app.post("/skills/{nome}/executar", status_code=201)
def executar_skill(nome: str, e: ExecucaoSkill, vault: Path = Depends(get_vault)) -> dict:
    if not any(s.nome == nome for s in listar_skills(vault)):
        raise HTTPException(404, f"skill não encontrada: {nome}")
    tarefa = e.instrucao.strip() or "Execute esta skill com os padrões dela."
    s = tier3.gerenciador(vault).criar(tarefa, pedido=f"Skill /{nome}" + (f": {e.instrucao.strip()}" if e.instrucao.strip() else ""), skill=nome)
    return s.resumo()


# ---------- Rotinas ----------

class NovaRotina(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    cron: str = Field(min_length=9, max_length=100)
    tier: Literal[1, 3] = 3
    ativa: bool = True
    skill: str | None = None
    acao: str | None = None
    descricao: str = Field(default="", max_length=4000)
    saida: Literal["vault", "efemera"] = "vault"
    notificar: bool = False


class EdicaoRotina(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=80)
    cron: str | None = Field(default=None, min_length=9, max_length=100)
    ativa: bool | None = None
    skill: str | None = None
    acao: str | None = None
    descricao: str | None = Field(default=None, max_length=4000)
    saida: Literal["vault", "efemera"] | None = None
    notificar: bool | None = None


def _rotina_json(vault: Path, r, historico: dict[str, list[dict]]) -> dict:
    ag = scheduler.agendador(vault)
    proxima = ag.proxima(r)
    execs = historico.get(r.slug, [])
    hist = [
        {**e, "quando": e["quando"].isoformat(timespec="seconds")}
        for e in reversed(execs[-10:])
    ]
    return {**asdict(r), "proxima": proxima.isoformat(timespec="seconds") if proxima else None, "historico": hist}


@app.get("/rotinas")
def listar_rotinas(vault: Path = Depends(get_vault)) -> list[dict]:
    hist = rotinas_status.historico(vault, clock.now())
    return [_rotina_json(vault, r, hist) for r in reader.ler_rotinas(vault)]


@app.get("/rotinas/acoes")
def acoes_internas() -> list[dict]:
    return [{"nome": nome, "descricao": desc} for nome, (desc, _) in ACOES.items()]


@app.post("/rotinas", status_code=201)
def criar_rotina(n: NovaRotina, vault: Path = Depends(get_vault)) -> dict:
    try:
        slug = rotinas_arq.criar(
            vault, clock.tz(), nome=n.nome, cron_expr=n.cron, tier=n.tier, ativa=n.ativa,
            skill=n.skill, acao=n.acao, descricao=n.descricao, saida=n.saida, notificar=n.notificar,
        )
    except rotinas_arq.RotinaExiste as e:
        raise HTTPException(409, f"já existe uma rotina com esse nome ({e})") from e
    except rotinas_arq.RotinaInvalida as e:
        raise HTTPException(422, str(e)) from e
    scheduler.agendador(vault).recarregar()
    r = next(x for x in reader.ler_rotinas(vault) if x.slug == slug)
    return _rotina_json(vault, r, {})


@app.patch("/rotinas/{slug}")
def editar_rotina(slug: str, e: EdicaoRotina, vault: Path = Depends(get_vault)) -> dict:
    campos = {k: getattr(e, k) for k in e.model_fields_set if k != "descricao"}
    try:
        rotinas_arq.atualizar(vault, clock.tz(), slug, campos, e.descricao if "descricao" in e.model_fields_set else None)
    except rotinas_arq.RotinaNaoEncontrada as ex:
        raise HTTPException(404, "rotina não encontrada") from ex
    except rotinas_arq.RotinaInvalida as ex:
        raise HTTPException(422, str(ex)) from ex
    scheduler.agendador(vault).recarregar()
    r = next(x for x in reader.ler_rotinas(vault) if x.slug == slug)
    return _rotina_json(vault, r, rotinas_status.historico(vault, clock.now()))


@app.delete("/rotinas/{slug}", status_code=204)
def remover_rotina(slug: str, vault: Path = Depends(get_vault)) -> None:
    try:
        rotinas_arq.remover(vault, slug)
    except rotinas_arq.RotinaNaoEncontrada as ex:
        raise HTTPException(404, "rotina não encontrada") from ex
    scheduler.agendador(vault).recarregar()


@app.post("/rotinas/{slug}/executar")
def executar_rotina(slug: str, vault: Path = Depends(get_vault)) -> dict:
    try:
        return scheduler.agendador(vault).executar(slug, manual=True)
    except KeyError as ex:
        raise HTTPException(404, "rotina não encontrada") from ex


# ---------- Saídas efêmeras ----------

class Guardar(BaseModel):
    destino: Literal["raw", "tarefa"]
    texto: str | None = Field(default=None, max_length=20000)


def _efemero_ou_404(efemero_id: str) -> efemeros.Efemero:
    e = efemeros.obter(efemero_id)
    if not e:
        raise HTTPException(404, "item não encontrado (pode ter expirado)")
    return e


@app.get("/efemeros")
def listar_efemeros() -> list[dict]:
    return [asdict(e) for e in efemeros.listar()]


@app.delete("/efemeros/{efemero_id}", status_code=204)
def descartar_efemero(efemero_id: str) -> None:
    if not efemeros.remover(efemero_id):
        raise HTTPException(404, "item não encontrado (pode ter expirado)")


@app.post("/efemeros/{efemero_id}/guardar", status_code=201)
def guardar_efemero(efemero_id: str, g: Guardar, vault: Path = Depends(get_vault)) -> dict:
    """Guarda no vault, por decisão do usuário, um trecho (ou o todo) de um item efêmero."""
    e = _efemero_ou_404(efemero_id)
    texto = (g.texto or e.texto).strip()
    if g.destino == "tarefa":
        if not g.texto or len(texto) > 500:
            raise HTTPException(422, "informe o texto da tarefa (até 500 caracteres)")
        return {"tarefa": tarefa_dict(writer.adicionar_tarefa(vault, texto))}
    caminho = writer.salvar_raw(vault, texto, clock.now(), "hud", titulo=e.titulo)
    return {"arquivo": caminho.relative_to(vault).as_posix()}


@app.get("/efemeros/{efemero_id}")
def obter_efemero(efemero_id: str) -> dict:
    return asdict(_efemero_ou_404(efemero_id))


# ---------- Pesquisas (web) e Biblioteca ----------

class NovaPesquisa(BaseModel):
    pedido: str = Field(min_length=1, max_length=2000)
    tema: str | None = Field(default=None, max_length=80)
    tipo: Literal["pesquisa", "plano"] = "pesquisa"
    atualizar: str | None = Field(default=None, max_length=80)  # slug de um tema da Biblioteca


@app.post("/pesquisas", status_code=201)
def nova_pesquisa(p: NovaPesquisa, vault: Path = Depends(get_vault)) -> dict:
    """Pesquisa direta (ex.: "Atualizar" na Biblioteca), sem passar pelo Tier 2. Só web, sem vault."""
    tarefa = p.pedido
    if p.atualizar:
        try:
            guardado = biblioteca.contexto_para_atualizar(vault, p.atualizar)
        except (FileNotFoundError, biblioteca.TemaInvalido) as e:
            raise HTTPException(404, "tema não encontrado na Biblioteca") from e
        tarefa += (
            "\n\nO usuário já tem um material guardado sobre isso (abaixo). Pesquise o que falta ou mudou "
            "e entregue só o que é novo ou corrigido, dizendo o que mudou.\n\n<ja_guardado>\n" + guardado + "\n</ja_guardado>"
        )
    tema = p.tema or (biblioteca.detalhe(vault, p.atualizar)["titulo"] if p.atualizar else p.pedido[:60])
    s = tier3.gerenciador(vault).criar(
        tarefa, pedido=p.pedido, skill="pesquisar", saida="pesquisa",
        pesquisa={"tema": tema, "tipo": p.tipo, "pedido": p.pedido, "slug": p.atualizar},
    )
    return s.resumo()


@app.post("/pesquisas/{efemero_id}/guardar", status_code=201)
def guardar_pesquisa(efemero_id: str, vault: Path = Depends(get_vault)) -> dict:
    """O usuário aprovou: outra sessão (sem web, só escreve em wiki/biblioteca/) organiza por tema."""
    e = _efemero_ou_404(efemero_id)
    if not e.pesquisa:
        raise HTTPException(422, "esse item não é uma pesquisa")
    meta = e.pesquisa
    destino = f"Atualize o tema existente `{meta['slug']}`." if meta.get("slug") else "Crie um tema novo."
    tarefa = (
        f"Guarde esta {meta.get('tipo', 'pesquisa')} na Biblioteca. Tema: {meta.get('tema')}. {destino}\n"
        f"Pedido original do usuário: {meta.get('pedido', '')}\n\n<relatorio>\n{e.texto}\n</relatorio>"
    )
    s = tier3.gerenciador(vault).criar(
        tarefa, pedido=f"Guardar na Biblioteca: {meta.get('tema')}", skill="guardar-pesquisa", saida="biblioteca",
        pesquisa={**meta, "efemero_id": e.id},
    )
    return s.resumo()


@app.get("/biblioteca")
def listar_biblioteca(vault: Path = Depends(get_vault)) -> list[dict]:
    return biblioteca.listar(vault)


@app.get("/biblioteca/{slug}")
def tema_biblioteca(slug: str, vault: Path = Depends(get_vault)) -> dict:
    try:
        return biblioteca.detalhe(vault, slug)
    except (FileNotFoundError, biblioteca.TemaInvalido) as e:
        raise HTTPException(404, "tema não encontrado") from e


@app.post("/biblioteca/{slug}/tarefas", status_code=201)
def tarefas_da_biblioteca(slug: str, vault: Path = Depends(get_vault)) -> dict:
    """Itens abertos do checklist do tema viram tarefas (sem IA)."""
    try:
        return {"criadas": biblioteca.tarefas_do_checklist(vault, slug, clock.now().date())}
    except (FileNotFoundError, biblioteca.TemaInvalido) as e:
        raise HTTPException(404, "tema ou checklist não encontrado") from e


# ---------- Estudos ----------

class NotaDeEstudo(BaseModel):
    nota: str = Field(min_length=1, max_length=500)


class Revisao(NotaDeEstudo):
    nivel: Literal["errei", "dificil", "facil"]


class PedidoEstudo(BaseModel):
    pedido: str = Field(min_length=1, max_length=2000)
    tipo: Literal["materia", "nota", "perguntas"] = "materia"
    nota: str | None = Field(default=None, max_length=500)


def _estudo(fn):
    """Traduz os erros de caminho do módulo de estudos em 404/400."""
    try:
        return fn()
    except FileNotFoundError as e:
        raise HTTPException(404, "matéria não encontrada") from e
    except estudos_mod.CaminhoInvalido as e:
        raise HTTPException(400, f"nota inválida: {e}") from e


@app.get("/estudos")
def estudos(vault: Path = Depends(get_vault)) -> list[dict]:
    return listar_materias(vault, clock.now().date())


@app.get("/estudos/{materia}")
def estudos_materia(materia: str, vault: Path = Depends(get_vault)) -> dict:
    return _estudo(lambda: estudos_mod.detalhe(vault, materia, clock.now().date()))


@app.get("/estudos/{materia}/cartas")
def estudos_cartas(materia: str, nota: str | None = None, todas: bool = False, vault: Path = Depends(get_vault)) -> list[dict]:
    """Flashcards (pergunta/resposta) das notas: uma nota, as com revisão vencida, ou todas."""
    return _estudo(lambda: estudos_mod.cartas(vault, materia, clock.now().date(), nota=nota, todas=todas))


@app.post("/estudos/{materia}/estudado")
def estudos_estudado(materia: str, n: NotaDeEstudo, vault: Path = Depends(get_vault)) -> dict:
    return _estudo(lambda: estudos_mod.marcar_estudado(vault, materia, n.nota, clock.now().date()))


@app.post("/estudos/{materia}/revisao")
def estudos_revisao(materia: str, r: Revisao, vault: Path = Depends(get_vault)) -> dict:
    """Resultado da revisão de um tópico (o pior nível entre as cartas dele): agenda a próxima."""
    return _estudo(lambda: estudos_mod.registrar_revisao(vault, materia, r.nota, r.nivel, clock.now().date()))


class NovaAnotacao(BaseModel):
    texto: str = Field(min_length=1, max_length=50_000)
    titulo: str | None = Field(default=None, max_length=120)
    topico: str | None = Field(default=None, max_length=500)


class EdicaoAnotacao(BaseModel):
    arquivo: str = Field(min_length=1, max_length=500)
    texto: str = Field(min_length=1, max_length=50_000)
    titulo: str | None = Field(default=None, max_length=120)


@app.get("/estudos/{materia}/anotacoes")
def estudos_anotacoes(materia: str, topico: str | None = None, vault: Path = Depends(get_vault)) -> list[dict]:
    """Anotações do usuário: de um tópico, ou todas (as gerais têm `topico` vazio)."""
    return _estudo(lambda: estudos_mod.listar_anotacoes(vault, materia, topico))


@app.post("/estudos/{materia}/anotacoes", status_code=201)
def estudos_criar_anotacao(materia: str, a: NovaAnotacao, vault: Path = Depends(get_vault)) -> dict:
    return _estudo(lambda: estudos_mod.criar_anotacao(vault, materia, a.texto, clock.now(), a.titulo, a.topico))


@app.put("/estudos/{materia}/anotacoes")
def estudos_editar_anotacao(materia: str, a: EdicaoAnotacao, vault: Path = Depends(get_vault)) -> dict:
    return _estudo(lambda: estudos_mod.atualizar_anotacao(vault, materia, a.arquivo, a.texto, clock.now(), a.titulo))


@app.delete("/estudos/{materia}/anotacoes", status_code=204)
def estudos_remover_anotacao(materia: str, arquivo: str, vault: Path = Depends(get_vault)) -> None:
    _estudo(lambda: estudos_mod.remover_anotacao(vault, materia, arquivo))


@app.post("/estudos/{materia}/material", status_code=201)
async def estudos_material(
    materia: str,
    arquivos: list[UploadFile] = File(default=[]),
    texto: str = Form(default=""),
    topico: str = Form(default=""),
    estruturar: bool = Form(default=True),
    vault: Path = Depends(get_vault),
) -> dict:
    """Documentos e/ou texto sobre a matéria: guarda em `_fontes/` e (por padrão) pede ao Gandalf para
    estruturar em tópicos novos ou acrescentar aos existentes (skill estruturar-material)."""
    agora = clock.now()
    _estudo(lambda: estudos_mod.pasta_materia(vault, materia))
    if topico:
        _estudo(lambda: estudos_mod.nota_da_materia(vault, materia, topico))
    if not arquivos and not texto.strip():
        raise HTTPException(422, "envie um arquivo ou cole um texto")
    salvos: list[str] = []
    for arq in arquivos[:10]:
        dados = await arq.read()
        if len(dados) > 25 * 1024 * 1024:
            raise HTTPException(413, f"{arq.filename}: maior que 25 MB")
        try:
            salvos += estudos_mod.salvar_fonte(vault, materia, arq.filename or "arquivo", dados, agora)
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
    if texto.strip():
        primeira = texto.strip().splitlines()[0][:50] or "texto"
        salvos += estudos_mod.salvar_fonte(vault, materia, f"{primeira}.md", texto.strip().encode("utf-8"), agora)
    if not estruturar:
        return {"fontes": salvos, "sessao": None}
    alvo = f" O usuário enviou isso pensando no tópico `{topico}`: priorize acrescentar a ele." if topico else ""
    tarefa = (
        f"Estruture o material novo da matéria `wiki/estudos/{materia}/`. Arquivos enviados agora:\n"
        + "\n".join(f"- `{s}`" for s in salvos)
        + f"\n{alvo}"
    )
    skill = "estruturar-material" if any(x.nome == "estruturar-material" for x in listar_skills(vault)) else None
    s = tier3.gerenciador(vault).criar(tarefa, pedido=f"Material para {materia}: {', '.join(x.split('/')[-1] for x in salvos)[:120]}", skill=skill)
    return {"fontes": salvos, "sessao": s.resumo()}


@app.post("/estudos/gerar", status_code=201)
def estudos_gerar(p: PedidoEstudo, vault: Path = Depends(get_vault)) -> dict:
    """Gera material com o Claude Code: matéria nova/completar (skill preparar-estudos), nota nova ou mais perguntas."""
    if p.tipo == "perguntas":
        if not p.nota or not p.nota.startswith("wiki/estudos/") or ".." in p.nota:
            raise HTTPException(400, "informe a nota (wiki/estudos/...)")
        tarefa = (
            f"Acrescente à nota `{p.nota}` de 3 a 5 perguntas novas de autoavaliação, no formato já usado nela "
            "(item numerado + resposta num callout recolhido `> [!note]- Resposta`). Não mexa no resto da nota. "
            f"Pedido do usuário: {p.pedido}"
        )
        s = tier3.gerenciador(vault).criar(tarefa, pedido=f"Mais perguntas: {p.nota.split('/')[-1]}")
    else:
        skill = "preparar-estudos" if any(x.nome == "preparar-estudos" for x in listar_skills(vault)) else None
        prefixo = "Complete a matéria existente com um tópico novo" if p.tipo == "nota" else "Monte o material de estudo"
        s = tier3.gerenciador(vault).criar(f"{prefixo}: {p.pedido}", pedido=f"Estudos: {p.pedido[:80]}", skill=skill)
    return s.resumo()


# ---------- Voz (offline) ----------

class Fala(BaseModel):
    texto: str = Field(min_length=1, max_length=8000)
    resumir: bool = True
    voz: str | None = Field(default=None, max_length=40)
    velocidade: float = Field(default=1.0, ge=0.5, le=2.0)


@app.get("/voz/status")
def voz_status() -> dict:
    return voz.status()


@app.post("/voz/ouvir")
async def voz_ouvir(audio: UploadFile = File(...)) -> dict:
    """Áudio gravado no HUD → texto (Whisper, pt)."""
    dados = await audio.read()
    if not dados:
        raise HTTPException(422, "áudio vazio")
    if len(dados) > 15 * 1024 * 1024:
        raise HTTPException(413, "áudio maior que 15 MB")
    inicio = time.perf_counter()
    try:
        r = await asyncio.to_thread(voz.transcrever, dados)
    except voz.VozIndisponivel as e:
        raise HTTPException(503, str(e)) from e
    return {**r, "duracao_ms": round((time.perf_counter() - inicio) * 1000)}


@app.post("/voz/falar")
def voz_falar(f: Fala) -> Response:
    """Texto → WAV (Kokoro, pt-BR). Respostas longas viram só o começo + "os detalhes estão na tela"."""
    texto = voz.texto_para_fala(f.texto) if f.resumir else f.texto
    try:
        wav = voz.sintetizar(texto, f.voz, f.velocidade)
    except voz.VozIndisponivel as e:
        raise HTTPException(503, str(e)) from e
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    # Cabeçalho só com ASCII: o texto falado vai em URL-encoding.
    from urllib.parse import quote

    return Response(wav, media_type="audio/wav", headers={"X-Texto-Falado": quote(texto)})


# ---------- Recibos e custos ----------

@app.get("/recibos")
def listar_recibos(
    dias: int = 30,
    limite: int = 200,
    tier: int | None = None,
    origem: str | None = None,
    vault: Path = Depends(get_vault),
) -> list[dict]:
    """Recibos dos últimos `dias`, do mais novo para o mais antigo."""
    hoje = clock.now().date()
    itens = ler_recibos(vault, hoje - timedelta(days=max(0, min(dias, 366))), hoje)
    if tier is not None:
        itens = [r for r in itens if r["tier"] == tier]
    if origem:
        itens = [r for r in itens if r["origem"] == origem]
    return [para_json(r) for r in reversed(itens)][: max(1, min(limite, 2000))]


@app.get("/recibos/{recibo_id}")
def ler_recibo(recibo_id: str, vault: Path = Depends(get_vault)) -> dict:
    if not re.fullmatch(r"[0-9A-Z]{26}", recibo_id):
        raise HTTPException(404, "recibo não encontrado")
    hoje = clock.now().date()
    r = next((x for x in ler_recibos(vault, hoje - timedelta(days=366), hoje) if x["id"] == recibo_id), None)
    if not r:
        raise HTTPException(404, "recibo não encontrado")
    return {**para_json(r), **navegar.ler_nota(vault, r["arquivo"])}


@app.get("/custos")
def custos(dias: int = 30, vault: Path = Depends(get_vault)) -> dict:
    """Uso por dia e totais. O custo é o "equivalente em API" informado pelo Claude Code (referência)."""
    agora = clock.now()
    hoje = agora.date()
    por_dia = custos_por_dia(ler_recibos(vault, hoje - timedelta(days=max(1, min(dias, 366)) - 1), hoje))
    mes = custos_por_dia(ler_recibos(vault, hoje.replace(day=1), hoje))

    def total(lista: list[dict]) -> dict:
        return {
            "chamadas": {t: sum(d["chamadas"][t] for d in lista) for t in ("1", "2", "3")},
            "tokens": sum(d["tokens_entrada"] + d["tokens_saida"] for d in lista),
            "custo_estimado_usd": round(sum(d["custo_estimado_usd"] for d in lista), 4),
        }

    hoje_iso = hoje.isoformat()
    de_hoje = [d for d in por_dia if d["dia"] == hoje_iso]
    return {
        "data": hoje_iso,
        "por_dia": por_dia,
        "periodo": total(por_dia),
        "mes": total(mes),
        "hoje": total(de_hoje),
        "limite_diario_chamadas": get_settings().limite_diario_chamadas,
    }


# ---------- Vault (somente leitura) ----------

@app.get("/vault/arvore")
def vault_arvore(vault: Path = Depends(get_vault)) -> list[dict]:
    return navegar.arvore(vault)


@app.get("/vault/nota")
def vault_nota(caminho: str, vault: Path = Depends(get_vault)) -> dict:
    try:
        return navegar.ler_nota(vault, caminho)
    except navegar.CaminhoInvalido as e:
        raise HTTPException(400, f"caminho inválido: {e}") from e
    except FileNotFoundError as e:
        raise HTTPException(404, "arquivo não encontrado") from e


# ---------- Hoje ----------

@app.get("/hoje")
def hoje(vault: Path = Depends(get_vault)) -> dict:
    """Painel do dia, só com leitura do vault (Tier 1 puro)."""
    agora = clock.now()
    dia = agora.date()
    tarefas = reader.ler_tarefas(vault)
    abertas = ordenar_prioridades(tarefas, dia)
    return {
        "data": dia.isoformat(),
        "data_extenso": data_por_extenso(dia),
        "agora": agora.isoformat(timespec="seconds"),
        "agenda": [asdict(e) for e in reader.ler_agenda(vault, dia)],
        "prioridades": [tarefa_dict(t) for t in abertas[:3]],
        "tarefas": {
            "abertas": len(abertas),
            "hoje": sum(1 for t in abertas if t.vence == dia),
            "atrasadas": sum(1 for t in abertas if t.vence and t.vence < dia),
            "concluidas_hoje": sum(1 for t in tarefas if t.concluida and t.concluida_em == dia),
        },
        "rotinas": rotinas_status.rotinas_do_dia(vault, agora, clock.tz()),
    }


# ---------- Tarefas ----------

class NovaTarefa(BaseModel):
    texto: str = Field(min_length=1, max_length=500)
    vence: date | None = None
    prioridade: Prioridade | None = None
    tags: list[str] = []


class EdicaoTarefa(BaseModel):
    concluida: bool | None = None
    texto: str | None = Field(default=None, min_length=1, max_length=500)
    vence: date | None = None
    prioridade: Prioridade | None = None


@app.get("/tarefas")
def listar_tarefas(incluir_concluidas: bool = False, vault: Path = Depends(get_vault)) -> list[dict]:
    dia = clock.now().date()
    tarefas = reader.ler_tarefas(vault)
    abertas = ordenar_prioridades(tarefas, dia)
    concluidas = [t for t in tarefas if t.concluida] if incluir_concluidas else []
    return [tarefa_dict(t) for t in abertas + concluidas]


@app.post("/tarefas", status_code=201)
def criar_tarefa(nova: NovaTarefa, vault: Path = Depends(get_vault)) -> dict:
    tags = [t.lstrip("#") for t in nova.tags]
    t = writer.adicionar_tarefa(vault, nova.texto, vence=nova.vence, prioridade=nova.prioridade, tags=tags)
    return tarefa_dict(t)


@app.patch("/tarefas/{tarefa_id}")
def editar_tarefa(tarefa_id: str, edicao: EdicaoTarefa, vault: Path = Depends(get_vault)) -> dict:
    campos = edicao.model_fields_set
    try:
        t = writer.atualizar_tarefa(
            vault,
            tarefa_id,
            clock.now().date(),
            concluida=edicao.concluida,
            texto=edicao.texto,
            vence=edicao.vence if "vence" in campos else ...,
            prioridade=edicao.prioridade if "prioridade" in campos else ...,
        )
    except writer.TarefaNaoEncontrada as e:
        raise HTTPException(404, "tarefa não encontrada (o arquivo pode ter mudado; recarregue)") from e
    return tarefa_dict(t)


# ---------- Lembretes ----------

class NovoLembrete(BaseModel):
    texto: str = Field(min_length=1, max_length=300)
    quando: datetime | None = None
    recorrencia: str | None = Field(default=None, max_length=100)


class EdicaoLembrete(BaseModel):
    concluido: bool | None = None
    texto: str | None = Field(default=None, min_length=1, max_length=300)
    quando: datetime | None = None
    adiar_min: int | None = Field(default=None, ge=1, le=7 * 24 * 60)


def _lembretes_json(vault: Path) -> list[dict]:
    ag = lembretes_ag.agendador(vault)
    agora = clock.now()
    itens = lembretes_vault.ler(vault, clock.tz())
    pendentes = sorted((x for x in itens if not x.concluido), key=lambda x: ag.proximo(x, agora) or agora)
    feitos = sorted((x for x in itens if x.concluido and not x.recorrente), key=lambda x: x.concluido_em or agora, reverse=True)
    # "Avisado agora": o HUD oferece adiar (no iPhone a notificação não tem botões).
    recente = lambda x: bool(x.concluido and x.concluido_em and agora - x.concluido_em <= timedelta(hours=2))  # noqa: E731
    return [
        {**lembretes_ag.lembrete_json(x, ag.proximo(x, agora)), "avisado_recente": recente(x)}
        for x in pendentes + feitos[:10]
    ]


@app.get("/lembretes")
def listar_lembretes(vault: Path = Depends(get_vault)) -> list[dict]:
    """Pendentes (do próximo para o mais distante) e os 10 últimos avisados."""
    return _lembretes_json(vault)


@app.post("/lembretes", status_code=201)
def criar_lembrete(n: NovoLembrete, vault: Path = Depends(get_vault)) -> dict:
    tz = clock.tz()
    quando = n.quando.astimezone(tz) if n.quando and n.quando.tzinfo else (n.quando.replace(tzinfo=tz) if n.quando else None)
    try:
        x = lembretes_vault.adicionar(vault, tz, n.texto, quando=quando, recorrencia=n.recorrencia)
    except lembretes_vault.LembreteInvalido as e:
        raise HTTPException(422, str(e)) from e
    lembretes_ag.recarregar_se_ativo(vault)
    return lembretes_ag.lembrete_json(x, lembretes_ag.agendador(vault).proximo(x))


@app.patch("/lembretes/{lembrete_id}")
def editar_lembrete(lembrete_id: str, e: EdicaoLembrete, vault: Path = Depends(get_vault)) -> dict:
    """Concluir/reabrir, trocar texto, reagendar ou adiar N minutos a partir de agora."""
    tz = clock.tz()
    agora = clock.now()
    quando = e.quando
    if e.adiar_min:
        quando = (agora + timedelta(minutes=e.adiar_min)).replace(second=0, microsecond=0)
    elif quando is not None:
        quando = quando.astimezone(tz) if quando.tzinfo else quando.replace(tzinfo=tz)
    try:
        x = lembretes_vault.atualizar(vault, tz, lembrete_id, concluido=e.concluido, texto=e.texto, quando=quando, agora=agora)
    except lembretes_vault.LembreteNaoEncontrado as ex:
        raise HTTPException(404, "lembrete não encontrado (o arquivo pode ter mudado; recarregue)") from ex
    except lembretes_vault.LembreteInvalido as ex:
        raise HTTPException(422, str(ex)) from ex
    lembretes_ag.recarregar_se_ativo(vault)
    return lembretes_ag.lembrete_json(x, lembretes_ag.agendador(vault).proximo(x))


@app.delete("/lembretes/{lembrete_id}", status_code=204)
def remover_lembrete(lembrete_id: str, vault: Path = Depends(get_vault)) -> None:
    try:
        lembretes_vault.remover(vault, clock.tz(), lembrete_id)
    except lembretes_vault.LembreteNaoEncontrado as ex:
        raise HTTPException(404, "lembrete não encontrado") from ex
    lembretes_ag.recarregar_se_ativo(vault)


# ---------- Pomodoro ----------

class Pomodoro(BaseModel):
    fim: datetime
    titulo: str = Field(min_length=1, max_length=120)
    corpo: str = Field(default="", max_length=200)


@app.post("/pomodoro")
def pomodoro_agendar(p: Pomodoro, vault: Path = Depends(get_vault)) -> dict:
    """O HUD agenda o push do fim da fase: chega no celular mesmo com o app fechado (navegadores pausam timers)."""
    fim = p.fim if p.fim.tzinfo else p.fim.replace(tzinfo=clock.tz())
    if fim <= clock.now():
        raise HTTPException(422, "o fim já passou")
    return {"agendado": lembretes_ag.agendador(vault).agendar_aviso("pomodoro", fim, p.titulo, p.corpo)}


@app.delete("/pomodoro")
def pomodoro_cancelar(vault: Path = Depends(get_vault)) -> dict:
    return {"cancelado": lembretes_ag.agendador(vault).cancelar_aviso("pomodoro")}


# ---------- Notificações (Web Push) ----------

class Inscricao(BaseModel):
    inscricao: dict
    aparelho: str = Field(default="", max_length=80)


class Endpoint(BaseModel):
    endpoint: str = Field(min_length=10, max_length=2000)


@app.get("/push/chave")
def push_chave() -> dict:
    return {"chave": push.chave_publica()}


@app.get("/push/inscricoes")
def push_inscricoes() -> list[dict]:
    return push.inscricoes()


@app.post("/push/inscrever", status_code=201)
def push_inscrever(i: Inscricao) -> dict:
    try:
        return push.inscrever(i.inscricao, i.aparelho or "aparelho")
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@app.post("/push/cancelar")
def push_cancelar(e: Endpoint) -> dict:
    return {"removida": push.cancelar(e.endpoint)}


@app.post("/push/teste")
def push_teste() -> dict:
    enviados = push.enviar(push.Notificacao("🌱 Notificações do Gandalf ligadas", "É assim que os lembretes vão chegar.", "/", tag="teste"))
    if not enviados:
        raise HTTPException(409, "nenhum aparelho recebeu (ative as notificações neste aparelho primeiro)")
    return {"enviados": enviados}


# ---------- Propostas de evento (Google Agenda, com confirmação) ----------

class EventoProposto(BaseModel):
    titulo: str = Field(min_length=1, max_length=200)
    data: date
    dia_inteiro: bool = False
    hora_inicio: str | None = None
    hora_fim: str | None = None
    repetir: Literal["anual", "mensal", "semanal", "diaria"] | None = None
    avisos_min: list[int] | None = None
    local: str | None = Field(default=None, max_length=200)
    descricao: str | None = Field(default=None, max_length=1000)


class Confirmacao(BaseModel):
    evento: EventoProposto | None = None  # campos editados no HUD; sem isso, usa a proposta como veio


def _proposta_ou_404(proposta_id: str) -> propostas.Proposta:
    p = propostas.obter(proposta_id)
    if not p:
        raise HTTPException(404, "proposta não encontrada (pode ter expirado)")
    return p


@app.get("/propostas/{proposta_id}")
def obter_proposta(proposta_id: str) -> dict:
    return asdict(_proposta_ou_404(proposta_id))


@app.post("/propostas/{proposta_id}/confirmar", status_code=201)
def confirmar_proposta(proposta_id: str, c: Confirmacao, vault: Path = Depends(get_vault)) -> dict:
    """O usuário confirmou: abre uma sessão curta com a skill `agendar` para criar exatamente este evento."""
    p = _proposta_ou_404(proposta_id)
    if p.status == "confirmada":
        raise HTTPException(409, "essa proposta já foi confirmada")
    if not any(s.nome == "agendar" for s in listar_skills(vault)):
        raise HTTPException(503, "skill agendar não encontrada no vault (rode o setup do vault)")
    try:
        evento = propostas.normalizar(c.evento.model_dump(mode="json") if c.evento else asdict(p.evento))
    except propostas.PropostaInvalida as e:
        raise HTTPException(422, str(e)) from e
    args = propostas.argumentos_create_event(evento, get_settings().timezone)
    tarefa = (
        "Crie este evento no Google Agenda principal, exatamente com estes parâmetros da ferramenta create_event "
        "(não mude nada):\n```json\n" + json.dumps(args, ensure_ascii=False, indent=1) + "\n```"
    )
    s = tier3.gerenciador(vault).criar(
        tarefa,
        pedido=f"Criar na agenda: {evento.titulo} ({data_por_extenso(date.fromisoformat(evento.data))})",
        origem=p.origem if p.origem in ("hud", "voz") else "hud",
        skill="agendar",
        saida="acao",
        modelo=get_settings().agendar_modelo,
    )
    p = propostas.confirmar(p, evento, s.id)
    return {"proposta": asdict(p), "sessao": s.resumo()}


@app.delete("/propostas/{proposta_id}", status_code=204)
def descartar_proposta(proposta_id: str) -> None:
    if not propostas.remover(proposta_id):
        raise HTTPException(404, "proposta não encontrada")


# ---------- Captura rápida ----------

class Captura(BaseModel):
    texto: str = Field(min_length=1, max_length=20000)
    titulo: str | None = None
    origem: Origem = "hud"


@app.post("/raw", status_code=201)
def capturar(captura: Captura, vault: Path = Depends(get_vault)) -> dict:
    caminho = writer.salvar_raw(vault, captura.texto, clock.now(), captura.origem, captura.titulo)
    return {"arquivo": caminho.relative_to(vault).as_posix()}


@app.post("/raw/arquivo", status_code=201)
async def capturar_arquivo(arquivo: UploadFile = File(...), vault: Path = Depends(get_vault)) -> dict:
    dados = await arquivo.read()
    if len(dados) > 25 * 1024 * 1024:
        raise HTTPException(413, "arquivo maior que 25 MB")
    caminho = writer.salvar_raw_arquivo(vault, arquivo.filename or "arquivo", dados, clock.now())
    return {"arquivo": caminho.relative_to(vault).as_posix()}


def run() -> None:
    """`python -m app.main` (desenvolvimento, recarrega ao editar) ou `--producao` (sem recarga)."""
    import sys

    import uvicorn

    settings = get_settings()
    producao = "--producao" in sys.argv
    # app.servidor: API em /api + HUD compilado na raiz (uma origem só, para o celular).
    uvicorn.run(
        "app.servidor:aplicacao",
        host=settings.host,
        port=settings.port,
        # Recarrega só com mudanças no código do app (vigiar o .venv trava o reloader ao instalar pacotes).
        reload=not producao,
        reload_dirs=None if producao else [str(Path(__file__).parent)],
        # Sem isso o reload espera para sempre os WebSockets abertos do HUD.
        timeout_graceful_shutdown=2,
    )


if __name__ == "__main__":
    run()
