"""Claude Code falso para testes: imita `claude -p --output-format json|stream-json`.

O comportamento sai do texto do pedido (stdin):
- Tier 2 (json): "ESCALAR" → decide escalar; "INVALIDO" → texto que não é JSON; senão responde.
- Tier 3 (stream-json): escreve um arquivo em output/ e termina; "DEMORA" → fica parado 30 s;
  "FALHA" → termina com erro.
"""

import json
import os
import sys
import time
import uuid
from pathlib import Path


LENTO = os.environ.get("FAKE_CLAUDE_LENTO") == "1"  # pausas para demonstrar o stream ao vivo


def emitir(obj: dict) -> None:
    if LENTO:
        time.sleep(0.8)
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> None:
    args = sys.argv[1:]
    prompt = sys.stdin.read()
    formato = args[args.index("--output-format") + 1]
    session_id = str(uuid.uuid4())
    if "--resume" in args:
        session_id = args[args.index("--resume") + 1]
    usage = {"input_tokens": 100, "cache_read_input_tokens": 50, "output_tokens": 20}

    if formato == "json":
        if "ESCALAR" in prompt:
            dados = {"acao": "escalar", "motivo": "Precisa mexer no vault.", "tarefa": "Organize o raw/ (ESCALADO)", "skill": None}
            emitir({"type": "result", "subtype": "success", "is_error": False, "result": json.dumps(dados),
                    "structured_output": dados, "session_id": session_id, "duration_ms": 900,
                    "total_cost_usd": 0.0012, "usage": usage, "modelUsage": {"claude-haiku-4-5": {}}})
        elif "PESQUISAR" in prompt:
            dados = {"acao": "pesquisar", "tema": "Mudança para o Canadá", "tipo": "pesquisa",
                     "consulta": "Pesquise vistos, custo de vida e trabalho para morar no Canadá.", "atualizar": None}
            emitir({"type": "result", "subtype": "success", "is_error": False, "result": json.dumps(dados),
                    "structured_output": dados, "session_id": session_id, "duration_ms": 800,
                    "total_cost_usd": 0.001, "usage": usage, "modelUsage": {"claude-haiku-4-5": {}}})
        elif "CAPTURAR" in prompt:
            dados = {"acao": "capturar", "itens": [
                {"tipo": "evento", "titulo": "Aniversário do Artur (irmão)", "data": "2026-10-03", "dia_inteiro": True, "repetir": "anual"},
                {"tipo": "tarefa", "texto": "Comprar presente", "vence": "2026-10-09"},
                {"tipo": "lembrete", "texto": "Ligar pro Artur", "quando": "2026-10-03T18:00"},
                {"tipo": "lembrete", "texto": "Tomar remédio", "hora": "22:00", "dias_semana": []},
            ]}
            emitir({"type": "result", "subtype": "success", "is_error": False, "result": json.dumps(dados),
                    "structured_output": dados, "session_id": session_id, "duration_ms": 800,
                    "total_cost_usd": 0.001, "usage": usage, "modelUsage": {"claude-haiku-4-5": {}}})
        elif "INVALIDO" in prompt:
            emitir({"type": "result", "subtype": "success", "is_error": False, "result": "Olá! Não sei JSON.",
                    "session_id": session_id, "duration_ms": 500, "total_cost_usd": 0.001, "usage": usage})
        else:
            dados = {"acao": "responder", "resposta": "Derivada é a taxa de variação instantânea."}
            # Sem structured_output: o Bridge deve extrair o JSON do texto (inclusive de um bloco ```json).
            emitir({"type": "result", "subtype": "success", "is_error": False,
                    "result": "```json\n" + json.dumps(dados, ensure_ascii=False) + "\n```",
                    "session_id": session_id, "duration_ms": 700, "total_cost_usd": 0.0011, "usage": usage,
                    "modelUsage": {"claude-haiku-4-5": {}}})
        return

    # stream-json (Tier 3)
    emitir({"type": "system", "subtype": "init", "session_id": session_id, "model": "claude-sonnet-5-5", "cwd": str(Path.cwd())})
    if "DEMORA" in prompt:
        time.sleep(30)
    destino = Path.cwd() / "output" / "relatorio-teste.md"
    emitir({"type": "assistant", "message": {"content": [
        {"type": "text", "text": "Vou criar o relatório."},
        {"type": "tool_use", "id": "t1", "name": "Write", "input": {"file_path": str(destino), "content": "# Relatório"}},
    ]}})
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(f"# Relatório\n\nPedido: {prompt.strip()}\n", encoding="utf-8")
    sys.stdout.write("linha que não é json\n")
    sys.stdout.flush()
    if "FALHA" in prompt:
        emitir({"type": "result", "subtype": "error_during_execution", "is_error": True, "result": "",
                "session_id": session_id, "duration_ms": 300, "total_cost_usd": 0.002, "usage": usage})
        sys.exit(1)
    emitir({"type": "result", "subtype": "success", "is_error": False, "result": "Pronto: criei output/relatorio-teste.md.",
            "session_id": session_id, "duration_ms": 1500, "total_cost_usd": 0.02, "usage": usage,
            "modelUsage": {"claude-sonnet-5-5": {}}})


if __name__ == "__main__":
    main()
