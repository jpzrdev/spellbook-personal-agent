"""Downloads the voice models to bridge/data/models/ (outside git). Safe to run again: skips what already exists.

Usage: uv run python -m app.speech.download_models
"""

import sys
import urllib.request
from pathlib import Path

from app.config import get_settings

KOKORO = {
    "kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
    "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}


def models_folder() -> Path:
    folder = get_settings().data_path / "models"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def _download(url: str, target: Path) -> None:
    if target.exists() and target.stat().st_size > 0:
        print(f"  already exists: {target.name}")
        return
    tmp = target.with_suffix(target.suffix + ".partial")
    print(f"  downloading {target.name} …", flush=True)

    def progress(blocks, block_size, total):
        if total > 0 and blocks % 200 == 0:
            print(f"    {min(100, blocks * block_size * 100 // total)}%", flush=True)

    urllib.request.urlretrieve(url, tmp, progress)
    tmp.replace(target)
    print(f"  ok: {target.name} ({target.stat().st_size // 1_000_000} MB)")


def main() -> None:
    cfg = get_settings()
    folder = models_folder()
    print(f"Models in {folder}")
    print("Kokoro (speech):")
    for name, url in KOKORO.items():
        _download(url, folder / name)

    print(f"Whisper {cfg.whisper_model} (speech recognition):")
    from faster_whisper import download_model

    path = download_model(cfg.whisper_model, output_dir=str(folder / f"whisper-{cfg.whisper_model}"))
    print(f"  ok: {path}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
