"""Execução do Claude Code CLI (`claude -p`) como subprocesso.

- O pedido vai pelo stdin (evita limites e problemas de aspas da linha de comando no Windows).
- No Windows, preferimos o `claude.exe` nativo ao `claude.cmd` do npm (que passa pelo cmd.exe).
- Tudo é síncrono e roda em threads: o loop asyncio do uvicorn com reload no Windows não
  suporta subprocessos, então o Tier 3 lê o stdout numa thread e repassa os eventos.
"""

import json
import os
import shutil
import signal
import subprocess
import sys
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

from app.config import get_settings


class ClaudeIndisponivel(Exception):
    """CLI não encontrado ou sem login."""


class ClaudeFalhou(Exception):
    pass


def resolver_comando() -> list[str]:
    """Prefixo do comando. `CLAUDE_BIN` (opcional) é o caminho do executável."""
    configurado = get_settings().claude_bin.strip().strip('"')
    if configurado:
        # Um .py roda com o Python do Bridge (ex.: o CLI falso dos testes, para demonstrações).
        # Caminho relativo vale a partir do diretório do Bridge (o subprocesso roda dentro do vault).
        caminho = str(Path(configurado).resolve()) if ("/" in configurado or "\\" in configurado) else configurado
        return [sys.executable, caminho] if caminho.endswith(".py") else [caminho]
    caminho = shutil.which("claude")
    if not caminho:
        raise ClaudeIndisponivel(
            "Claude Code não encontrado. Instale com `npm install -g @anthropic-ai/claude-code` "
            "e faça login com `claude auth login`."
        )
    if caminho.lower().endswith((".cmd", ".ps1")):
        exe = Path(caminho).parent / "node_modules" / "@anthropic-ai" / "claude-code" / "bin" / "claude.exe"
        if exe.is_file():
            return [str(exe)]
    return [caminho]


def _ambiente() -> dict[str, str]:
    env = os.environ.copy()
    # Não deixamos uma API key do ambiente desviar o uso da assinatura do usuário.
    env.pop("ANTHROPIC_API_KEY", None)
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return env


def _flags_criacao() -> dict:
    if os.name == "nt":
        # Grupo próprio para poder encerrar a árvore de processos; sem janela de console.
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW}
    return {"start_new_session": True}


def encerrar(proc: subprocess.Popen) -> None:
    """Mata o processo e os filhos (o CLI pode abrir subprocessos para ferramentas)."""
    if proc.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            capture_output=True,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    else:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass


@dataclass
class ResultadoJson:
    """Saída de `--output-format json`."""

    texto: str
    estruturado: dict | None
    erro: bool
    session_id: str | None
    duracao_ms: int
    tokens_entrada: int
    tokens_saida: int
    custo_usd: float
    modelo: str | None
    bruto: dict


def _tokens(usage: dict | None) -> tuple[int, int]:
    usage = usage or {}
    entrada = (
        int(usage.get("input_tokens") or 0)
        + int(usage.get("cache_creation_input_tokens") or 0)
        + int(usage.get("cache_read_input_tokens") or 0)
    )
    return entrada, int(usage.get("output_tokens") or 0)


def _modelo(dados: dict) -> str | None:
    uso = dados.get("modelUsage")
    if isinstance(uso, dict) and uso:
        return next(iter(uso))
    return dados.get("model")


def interpretar_resultado(dados: dict) -> ResultadoJson:
    entrada, saida = _tokens(dados.get("usage"))
    estruturado = dados.get("structured_output")
    return ResultadoJson(
        texto=str(dados.get("result") or ""),
        estruturado=estruturado if isinstance(estruturado, dict) else None,
        erro=bool(dados.get("is_error")) or dados.get("subtype") not in (None, "success"),
        session_id=dados.get("session_id"),
        duracao_ms=int(dados.get("duration_ms") or 0),
        tokens_entrada=entrada,
        tokens_saida=saida,
        custo_usd=float(dados.get("total_cost_usd") or 0.0),
        modelo=_modelo(dados),
        bruto=dados,
    )


def rodar_json(prompt: str, args: list[str], cwd: Path, timeout_s: float = 120) -> ResultadoJson:
    """Uma chamada curta e bloqueante (Tier 2). Levanta ClaudeFalhou em erro."""
    cmd = resolver_comando() + ["-p", "--output-format", "json", *args]
    try:
        proc = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=cwd,
            env=_ambiente(),
            timeout=timeout_s,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    except FileNotFoundError as e:
        raise ClaudeIndisponivel(str(e)) from e
    except subprocess.TimeoutExpired as e:
        raise ClaudeFalhou(f"Claude Code não respondeu em {timeout_s:.0f}s") from e

    saida = proc.stdout.strip()
    try:
        dados = json.loads(saida.splitlines()[-1]) if saida else None
    except json.JSONDecodeError:
        dados = None
    if not isinstance(dados, dict):
        detalhe = (proc.stderr or saida or "sem saída").strip()[-500:]
        if "login" in detalhe.lower() or "auth" in detalhe.lower():
            raise ClaudeIndisponivel(f"Claude Code sem login. Rode `claude auth login`. ({detalhe})")
        raise ClaudeFalhou(f"saída inesperada do Claude Code (código {proc.returncode}): {detalhe}")
    resultado = interpretar_resultado(dados)
    if resultado.erro and not resultado.texto:
        raise ClaudeFalhou(f"Claude Code terminou com erro: {dados.get('subtype')}")
    return resultado


def iniciar_stream(prompt: str, args: list[str], cwd: Path) -> subprocess.Popen:
    """Inicia uma sessão com `--output-format stream-json` (Tier 3). O chamador lê o stdout."""
    cmd = resolver_comando() + ["-p", "--output-format", "stream-json", "--verbose", *args]
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=cwd,
            env=_ambiente(),
            bufsize=1,
            **_flags_criacao(),
        )
    except FileNotFoundError as e:
        raise ClaudeIndisponivel(str(e)) from e
    assert proc.stdin is not None
    proc.stdin.write(prompt)
    proc.stdin.close()
    return proc


def ler_eventos(proc: subprocess.Popen, ao_ler_linha_invalida: Callable[[str], None] | None = None) -> Iterator[dict]:
    """Gera os eventos JSON (uma linha cada) do stdout até o processo terminar."""
    assert proc.stdout is not None
    for linha in proc.stdout:
        linha = linha.strip()
        if not linha:
            continue
        try:
            evento = json.loads(linha)
        except json.JSONDecodeError:
            if ao_ler_linha_invalida:
                ao_ler_linha_invalida(linha)
            continue
        if isinstance(evento, dict):
            yield evento


def status_login() -> dict:
    """`claude auth status` em JSON (usado pelo /health)."""
    try:
        cmd = resolver_comando() + ["auth", "status"]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
            env=_ambiente(),
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        dados = json.loads(proc.stdout or "{}")
        return {"instalado": True, "logado": bool(dados.get("loggedIn")), "metodo": dados.get("authMethod")}
    except ClaudeIndisponivel:
        return {"instalado": False, "logado": False, "metodo": None}
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        return {"instalado": True, "logado": False, "metodo": None}

