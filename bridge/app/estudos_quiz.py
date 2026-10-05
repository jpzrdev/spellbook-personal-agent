"""Quiz efêmero da aba Estudos: a IA gera perguntas a partir do acervo da matéria e corrige as respostas.

Nada do quiz é guardado: as perguntas vão para o HUD e somem quando ele termina. O usuário pode salvar
uma questão como anotação (rota normal de anotações). Os recibos registram só o custo, sem o conteúdo.
"""

import json
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import frontmatter

from app.config import get_settings
from app.estudos import _titulo_md, listar_anotacoes, nota_da_materia, pasta_materia, topicos
from app.gandalf import claude_cli
from app.gandalf.tier2 import _extrair_json
from app.receipts import Recibo, gravar_recibo

MAX_PERGUNTAS = 15
TIPOS = ("texto", "multipla")
LIMITE_TOPICO = 24_000  # caracteres de uma nota de tópico mandados à IA
LIMITE_MATERIA = 60_000  # caracteres da matéria inteira (quiz geral)

SISTEMA_GERAR = """Você cria quizzes de estudo em português do Brasil a partir do material de estudo do usuário.

Regras:
- Use só o que o material sustenta; não invente fatos. As anotações do usuário também contam como material.
- Perguntas que testam entendimento e aplicação (por quê, como, compare, o que aconteceria se, cenário prático), não só definição decorada. Varie a dificuldade.
- Sem perguntas repetidas ou quase iguais. Cubra partes diferentes do material.
- Tipo "texto": pergunta de resposta livre e curta (1 a 4 frases). Em `resposta`, a resposta-modelo completa.
- Tipo "multipla": exatamente 4 opções em `opcoes`, uma só correta (índice 0–3 em `correta`), distratores plausíveis e do mesmo tamanho aproximado da correta; varie a posição da correta. Em `resposta`, o texto da opção correta.
- `explicacao`: 1 a 3 frases explicando por que a resposta está certa (e, na múltipla escolha, por que as outras não estão), com algum detalhe a mais do material.
- `topico`: o caminho (atributo `caminho`) do tópico de onde a pergunta saiu.
- Responda só com o JSON pedido."""

SISTEMA_CORRIGIR = """Você corrige respostas de quiz de estudo, em português do Brasil, como um professor justo e direto.

Compare a resposta do usuário com a resposta-modelo e com o material (se houver). Avalie o conteúdo, não a escrita:
sinônimos, outra ordem ou outras palavras valem. Resposta vazia ou "não sei" é errada.
- `veredito`: "certo" (pegou o essencial), "parcial" (parte certa, faltou algo importante ou tem um erro menor) ou "errado".
- `comentario`: 1 a 3 frases falando com o usuário (você): o que ele acertou e o que faltou ou está errado.
- `complemento`: a resposta certa explicada, com um detalhe a mais do material que ajude a fixar (2 a 5 frases, Markdown simples).
Responda só com o JSON pedido."""

ESQUEMA_GERAR = {
    "type": "object",
    "properties": {
        "perguntas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "pergunta": {"type": "string"},
                    "opcoes": {"type": "array", "items": {"type": "string"}},
                    "correta": {"type": "integer"},
                    "resposta": {"type": "string"},
                    "explicacao": {"type": "string"},
                    "topico": {"type": "string"},
                },
                "required": ["pergunta", "resposta"],
            },
        }
    },
    "required": ["perguntas"],
}

ESQUEMA_CORRIGIR = {
    "type": "object",
    "properties": {
        "veredito": {"type": "string", "enum": ["certo", "parcial", "errado"]},
        "comentario": {"type": "string"},
        "complemento": {"type": "string"},
    },
    "required": ["veredito", "comentario"],
}


@dataclass
class Fonte:
    nota: str
    titulo: str
    texto: str


def _texto_nota(arquivo: Path) -> str:
    return frontmatter.load(arquivo).content.strip()


def _anotacoes_texto(vault: Path, materia: str, topico: str | None) -> str:
    itens = listar_anotacoes(vault, materia, topico) if topico else [a for a in listar_anotacoes(vault, materia) if not a["topico"]]
    return "\n\n".join(f"- {a['titulo'] + ': ' if a['titulo'] else ''}{a['texto']}" for a in itens)


def material(vault: Path, materia: str, topico: str | None) -> list[Fonte]:
    """Notas que entram no quiz: o tópico escolhido, ou todos (cortados para caber no limite)."""
    if topico:
        arquivo = nota_da_materia(vault, materia, topico)
        texto = _texto_nota(arquivo)[:LIMITE_TOPICO]
        if minhas := _anotacoes_texto(vault, materia, topico):
            texto += f"\n\n## Anotações do usuário\n{minhas[:6000]}"
        return [Fonte(topico, _titulo_md(texto, arquivo.stem), texto)]
    tops = topicos(vault, materia)
    if not tops:
        return []
    por_topico = max(2_000, LIMITE_MATERIA // len(tops))
    fontes = []
    for t in tops:
        texto = _texto_nota(vault / t.nota)[:por_topico]
        if minhas := _anotacoes_texto(vault, materia, t.nota):
            texto += f"\n\n## Anotações do usuário\n{minhas[:1500]}"
        fontes.append(Fonte(t.nota, t.titulo, texto))
    return fontes


def _args(sistema: str, esquema: dict) -> list[str]:
    return [
        "--model", get_settings().tier2_model,
        "--tools", "",
        "--no-session-persistence",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--system-prompt", sistema,
        "--json-schema", json.dumps(esquema, ensure_ascii=False),
    ]


def _recibo(vault: Path, agora: datetime, pedido: str, intent: str, r: claude_cli.ResultadoJson, inicio: float) -> None:
    gravar_recibo(vault, Recibo(
        pedido, "(quiz efêmero: o conteúdo não é guardado)", "hud", 2, agora, int((time.monotonic() - inicio) * 1000),
        intent=intent, modelo=r.modelo, tokens_entrada=r.tokens_entrada, tokens_saida=r.tokens_saida,
        custo_estimado_usd=round(r.custo_usd, 6),
    ))


def _limpar(p: dict, tipo: str, notas: set[str], padrao: str | None) -> dict | None:
    pergunta = str(p.get("pergunta") or "").strip()
    resposta = str(p.get("resposta") or "").strip()
    if not pergunta or not resposta:
        return None
    topico = str(p.get("topico") or "").strip()
    item = {
        "pergunta": pergunta,
        "resposta": resposta,
        "explicacao": str(p.get("explicacao") or "").strip(),
        "topico": topico if topico in notas else padrao,
        "opcoes": None,
        "correta": None,
    }
    if tipo == "multipla":
        opcoes = [str(o).strip() for o in p.get("opcoes") or [] if str(o).strip()][:6]
        correta = p.get("correta")
        if len(opcoes) < 2 or not isinstance(correta, int) or not 0 <= correta < len(opcoes):
            return None
        item.update(opcoes=opcoes, correta=correta)
    return item


def gerar(vault: Path, materia: str, quantidade: int, tipo: str, agora: datetime, topico: str | None = None) -> dict:
    """Gera `quantidade` perguntas (texto livre ou múltipla escolha) do tópico ou da matéria inteira."""
    if tipo not in TIPOS:
        raise ValueError(f"tipo inválido: {tipo}")
    quantidade = max(1, min(MAX_PERGUNTAS, quantidade))
    pasta_materia(vault, materia)
    fontes = material(vault, materia, topico)
    if not fontes:
        raise ValueError("esta matéria ainda não tem tópicos")
    blocos = "\n\n".join(f'<topico caminho="{f.nota}" titulo="{f.titulo}">\n{f.texto}\n</topico>' for f in fontes)
    escopo = f'o tópico "{fontes[0].titulo}"' if topico else "a matéria inteira (misture tópicos diferentes, ao acaso)"
    prompt = (
        f'<quiz_gerar quantidade="{quantidade}" tipo="{tipo}">\n'
        f"Crie {quantidade} pergunta(s) do tipo \"{tipo}\" sobre {escopo}.\n\n{blocos}\n</quiz_gerar>"
    )
    notas = {f.nota for f in fontes}
    inicio = time.monotonic()
    perguntas: list[dict] = []
    for _ in (1, 2):  # JSON inválido ou nenhuma pergunta aproveitável: tenta mais uma vez
        r = claude_cli.rodar_json(prompt, _args(SISTEMA_GERAR, ESQUEMA_GERAR), cwd=vault, timeout_s=240)
        dados = r.estruturado if r.estruturado and "perguntas" in r.estruturado else _extrair_json(r.texto)
        brutas = (dados or {}).get("perguntas") if isinstance(dados, dict) else None
        perguntas = [x for x in (_limpar(p, tipo, notas, topico) for p in brutas or [] if isinstance(p, dict)) if x]
        if perguntas:
            break
    _recibo(vault, agora, f"Quiz de {materia}{' (' + fontes[0].titulo + ')' if topico else ''}: {quantidade} {tipo}", "estudos.quiz", r, inicio)
    if not perguntas:
        raise claude_cli.ClaudeFalhou("a IA não devolveu perguntas válidas; tente de novo")
    titulos = {f.nota: f.titulo for f in fontes}
    return {
        "tipo": tipo,
        "topico": topico,
        "perguntas": [{**p, "titulo_topico": titulos.get(p["topico"]) if p["topico"] else None} for p in perguntas[:quantidade]],
    }


def corrigir(vault: Path, materia: str, pergunta: str, resposta_modelo: str, resposta: str, agora: datetime,
             topico: str | None = None) -> dict:
    """Corrige uma resposta de texto livre comparando com a resposta-modelo (e com o tópico, se houver)."""
    pasta_materia(vault, materia)
    contexto = ""
    if topico:
        arquivo = nota_da_materia(vault, materia, topico)
        contexto = f'<material caminho="{topico}">\n{_texto_nota(arquivo)[:12_000]}\n</material>\n\n'
    prompt = (
        f"<quiz_corrigir>\n{contexto}<pergunta>\n{pergunta.strip()}\n</pergunta>\n\n"
        f"<resposta_modelo>\n{resposta_modelo.strip()}\n</resposta_modelo>\n\n"
        f"<resposta_do_usuario>\n{resposta.strip() or '(em branco)'}\n</resposta_do_usuario>\n</quiz_corrigir>"
    )
    inicio = time.monotonic()
    dados = None
    for _ in (1, 2):
        r = claude_cli.rodar_json(prompt, _args(SISTEMA_CORRIGIR, ESQUEMA_CORRIGIR), cwd=vault, timeout_s=120)
        dados = r.estruturado if r.estruturado and r.estruturado.get("veredito") else _extrair_json(r.texto)
        if dados and dados.get("veredito") in ("certo", "parcial", "errado"):
            break
        dados = None
    _recibo(vault, agora, f"Correção de quiz de {materia}", "estudos.quiz.corrigir", r, inicio)
    if not dados:
        raise claude_cli.ClaudeFalhou("a IA não conseguiu corrigir a resposta; tente de novo")
    return {
        "veredito": dados["veredito"],
        "comentario": str(dados.get("comentario") or "").strip(),
        "complemento": re.sub(r"\n{3,}", "\n\n", str(dados.get("complemento") or "").strip()),
    }
