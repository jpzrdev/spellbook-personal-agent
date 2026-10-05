"""Voz offline: Whisper (faster-whisper) para ouvir e Kokoro (ONNX) para falar, em pt-BR.

Os modelos ficam em bridge/dados/modelos/ (baixe com `python -m app.speech.baixar_modelos`).
São carregados uma vez, sob demanda (ou em segundo plano no início do Bridge), e reaproveitados.
"""

import io
import logging
import re
import threading
import wave
from pathlib import Path

import numpy as np

from app.config import get_settings

log = logging.getLogger("lifeos.voz")

_lock_stt = threading.Lock()
_lock_tts = threading.Lock()
_whisper = None
_kokoro = None

# Respostas mais longas que isso não são lidas inteiras (o plano: "falar só o resumo").
LIMITE_FALA = 320


class VozIndisponivel(Exception):
    pass


def _pasta() -> Path:
    return get_settings().dados_path / "modelos"


def _pasta_whisper() -> Path:
    return _pasta() / f"whisper-{get_settings().whisper_modelo}"


def status() -> dict:
    p = _pasta()
    return {
        "stt": (_pasta_whisper() / "model.bin").is_file(),
        "tts": (p / "kokoro-v1.0.onnx").is_file() and (p / "voices-v1.0.bin").is_file(),
        "whisper_modelo": get_settings().whisper_modelo,
        "voz": get_settings().voz_tts,
        "carregado": {"stt": _whisper is not None, "tts": _kokoro is not None},
    }


def _modelo_whisper():
    global _whisper
    with _lock_stt:
        if _whisper is None:
            pasta = _pasta_whisper()
            if not (pasta / "model.bin").is_file():
                raise VozIndisponivel(
                    f"modelo Whisper '{get_settings().whisper_modelo}' não baixado; rode `uv run python -m app.speech.baixar_modelos`"
                )
            from faster_whisper import WhisperModel

            log.info("carregando Whisper de %s", pasta)
            # int8 na CPU: bom equilíbrio de velocidade e qualidade sem GPU.
            _whisper = WhisperModel(str(pasta), device="cpu", compute_type="int8")
        return _whisper


def _modelo_kokoro():
    global _kokoro
    with _lock_tts:
        if _kokoro is None:
            p = _pasta()
            modelo, vozes = p / "kokoro-v1.0.onnx", p / "voices-v1.0.bin"
            if not (modelo.is_file() and vozes.is_file()):
                raise VozIndisponivel("modelo Kokoro não baixado; rode `uv run python -m app.speech.baixar_modelos`")
            from kokoro_onnx import Kokoro

            log.info("carregando Kokoro de %s", p)
            _kokoro = Kokoro(str(modelo), str(vozes))
        return _kokoro


def pre_carregar() -> None:
    """Carrega os modelos em segundo plano para a primeira fala não demorar."""

    def carregar():
        for nome, fn in (("Whisper", _modelo_whisper), ("Kokoro", _modelo_kokoro)):
            try:
                fn()
            except VozIndisponivel as e:
                log.info("%s indisponível: %s", nome, e)
            except Exception:
                log.exception("falha ao carregar %s", nome)

    threading.Thread(target=carregar, name="voz-precarga", daemon=True).start()


def transcrever(audio: bytes) -> dict:
    """Áudio (webm/ogg/mp4/wav…; decodificado pelo PyAV) → texto em português."""
    modelo = _modelo_whisper()
    segmentos, info = modelo.transcribe(
        io.BytesIO(audio),
        language="pt",
        beam_size=2,
        vad_filter=True,  # corta silêncios do começo/fim de quem segurou o botão
        condition_on_previous_text=False,
    )
    texto = " ".join(s.text.strip() for s in segmentos).strip()
    return {"texto": texto, "duracao_audio_s": round(info.duration, 2)}


_MARKDOWN = [
    (re.compile(r"```.*?```", re.S), " "),
    (re.compile(r"`([^`]*)`"), r"\1"),
    (re.compile(r"\*\*([^*]+)\*\*"), r"\1"),
    (re.compile(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]"), r"\1"),
    (re.compile(r"\[([^\]]+)\]\([^)]+\)"), r"\1"),
    (re.compile(r"^#+\s*", re.M), ""),
    (re.compile(r"^\s*[-*]\s+", re.M), ""),
]


def texto_para_fala(texto: str, limite: int = LIMITE_FALA) -> str:
    """Tira o markdown e, se for longo, fala só o começo (o resto fica na tela)."""
    limpo = texto
    for regex, troca in _MARKDOWN:
        limpo = regex.sub(troca, limpo)
    # Itens de lista viram frases.
    linhas = [l.strip().rstrip(".") for l in limpo.splitlines() if l.strip()]
    limpo = ". ".join(linhas)
    limpo = re.sub(r"\s+", " ", limpo).strip()
    if limpo and limpo[-1] not in ".!?":
        limpo += "."  # termina com pontuação: a entonação do Kokoro fica mais natural
    if len(limpo) <= limite:
        return limpo
    frases = re.split(r"(?<=[.!?])\s+", limpo)
    resumo = ""
    for f in frases:
        if len(resumo) + len(f) > limite:
            break
        resumo += f + " "
    resumo = resumo.strip() or limpo[:limite].rsplit(" ", 1)[0] + "."
    return f"{resumo} Os detalhes estão na tela."


def _wav(amostras: np.ndarray, taxa: int) -> bytes:
    pcm = (np.clip(amostras, -1.0, 1.0) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(taxa)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def estilo_da_voz(kokoro, voz: str):
    """Uma voz ("pm_santa") ou uma mistura ponderada ("pm_santa:0.5+bm_lewis:0.5").

    A pronúncia vem do idioma (pt-br); a mistura muda só o timbre. A do Gandalf junta a voz
    brasileira mais velha (pm_santa) com uma britânica grave (bm_lewis)."""
    if "+" not in voz and ":" not in voz:
        return voz
    partes = []
    for item in voz.split("+"):
        nome, _, peso = item.strip().partition(":")
        partes.append((nome.strip(), float(peso or 1)))
    total = sum(p for _, p in partes)
    if total <= 0:
        raise ValueError(f"mistura de voz inválida: {voz!r}")
    return sum(kokoro.get_voice_style(n) * (p / total) for n, p in partes)


def sintetizar(texto: str, voz: str | None = None, velocidade: float = 1.0) -> bytes:
    """Texto → WAV (mono, 16 bits). A velocidade pedida é multiplicada pela da config (o Gandalf fala devagar)."""
    if not texto.strip():
        raise ValueError("texto vazio")
    kokoro = _modelo_kokoro()
    cfg = get_settings()
    try:
        estilo = estilo_da_voz(kokoro, voz or cfg.voz_tts)
    except (KeyError, ValueError) as e:
        raise ValueError(f"voz inválida: {voz or cfg.voz_tts!r}") from e
    amostras, taxa = kokoro.create(texto, voice=estilo, speed=velocidade * cfg.voz_velocidade, lang="pt-br")
    return _wav(amostras, taxa)
