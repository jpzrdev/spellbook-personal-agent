"""Baixa os modelos de voz para bridge/dados/modelos/ (fora do git). Pode rodar de novo: pula o que já existe.

Uso: uv run python -m app.speech.baixar_modelos
"""

import sys
import urllib.request
from pathlib import Path

from app.config import get_settings

KOKORO = {
    "kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
    "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}


def pasta_modelos() -> Path:
    pasta = get_settings().dados_path / "modelos"
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta


def _baixar(url: str, destino: Path) -> None:
    if destino.exists() and destino.stat().st_size > 0:
        print(f"  já existe: {destino.name}")
        return
    tmp = destino.with_suffix(destino.suffix + ".parcial")
    print(f"  baixando {destino.name} …", flush=True)

    def progresso(blocos, tam_bloco, total):
        if total > 0 and blocos % 200 == 0:
            print(f"    {min(100, blocos * tam_bloco * 100 // total)}%", flush=True)

    urllib.request.urlretrieve(url, tmp, progresso)
    tmp.replace(destino)
    print(f"  ok: {destino.name} ({destino.stat().st_size // 1_000_000} MB)")


def main() -> None:
    cfg = get_settings()
    pasta = pasta_modelos()
    print(f"Modelos em {pasta}")
    print("Kokoro (voz):")
    for nome, url in KOKORO.items():
        _baixar(url, pasta / nome)

    print(f"Whisper {cfg.whisper_modelo} (reconhecimento de fala):")
    from faster_whisper import download_model

    caminho = download_model(cfg.whisper_modelo, output_dir=str(pasta / f"whisper-{cfg.whisper_modelo}"))
    print(f"  ok: {caminho}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
