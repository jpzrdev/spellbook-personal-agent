"""Offline voice: Whisper (faster-whisper) to listen and Kokoro (ONNX) to speak, in the user's language.

The models live in bridge/data/models/ (download with `python -m app.speech.download_models`).
They are loaded once, on demand (or in the background when the Bridge starts), and reused.
"""

import io
import logging
import re
import threading
import wave
from pathlib import Path

import numpy as np

from app import locales
from app.config import get_settings
from app.locales import t

log = logging.getLogger("gandalf.voice")

_stt_lock = threading.Lock()
_tts_lock = threading.Lock()
_whisper = None
_kokoro = None

# Answers longer than this are not read in full ("speak only the summary").
SPEECH_LIMIT = 320


class VoiceUnavailable(Exception):
    pass


def _folder() -> Path:
    return get_settings().data_path / "models"


def _whisper_folder() -> Path:
    return _folder() / f"whisper-{get_settings().whisper_model}"


def status() -> dict:
    p = _folder()
    cfg = get_settings()
    return {
        "stt": (_whisper_folder() / "model.bin").is_file(),
        "tts": (p / "kokoro-v1.0.onnx").is_file() and (p / "voices-v1.0.bin").is_file(),
        "whisper_model": cfg.whisper_model,
        "voice": cfg.tts_voice,
        "language": cfg.language,
        "loaded": {"stt": _whisper is not None, "tts": _kokoro is not None},
    }


def _whisper_model():
    global _whisper
    with _stt_lock:
        if _whisper is None:
            folder = _whisper_folder()
            if not (folder / "model.bin").is_file():
                raise VoiceUnavailable(
                    f"Whisper model '{get_settings().whisper_model}' not downloaded; run `uv run python -m app.speech.download_models`"
                )
            from faster_whisper import WhisperModel

            log.info("loading Whisper from %s", folder)
            # int8 on the CPU: a good balance of speed and quality without a GPU.
            _whisper = WhisperModel(str(folder), device="cpu", compute_type="int8")
        return _whisper


def _kokoro_model():
    global _kokoro
    with _tts_lock:
        if _kokoro is None:
            p = _folder()
            model, voices = p / "kokoro-v1.0.onnx", p / "voices-v1.0.bin"
            if not (model.is_file() and voices.is_file()):
                raise VoiceUnavailable("Kokoro model not downloaded; run `uv run python -m app.speech.download_models`")
            from kokoro_onnx import Kokoro

            log.info("loading Kokoro from %s", p)
            _kokoro = Kokoro(str(model), str(voices))
        return _kokoro


def preload() -> None:
    """Loads the models in the background so the first answer isn't slow."""

    def load():
        for name, fn in (("Whisper", _whisper_model), ("Kokoro", _kokoro_model)):
            try:
                fn()
            except VoiceUnavailable as e:
                log.info("%s unavailable: %s", name, e)
            except Exception:
                log.exception("failed to load %s", name)

    threading.Thread(target=load, name="voice-preload", daemon=True).start()


def transcribe(audio: bytes) -> dict:
    """Audio (webm/ogg/mp4/wav…; decoded by PyAV) → text in the user's language."""
    model = _whisper_model()
    segments, info = model.transcribe(
        io.BytesIO(audio),
        language=locales.current().WHISPER_LANGUAGE,
        beam_size=2,
        vad_filter=True,  # trims silence at the start/end from whoever held the button
        condition_on_previous_text=False,
    )
    text = " ".join(s.text.strip() for s in segments).strip()
    return {"text": text, "audio_duration_s": round(info.duration, 2)}


_MARKDOWN = [
    (re.compile(r"```.*?```", re.S), " "),
    (re.compile(r"`([^`]*)`"), r"\1"),
    (re.compile(r"\*\*([^*]+)\*\*"), r"\1"),
    (re.compile(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]"), r"\1"),
    (re.compile(r"\[([^\]]+)\]\([^)]+\)"), r"\1"),
    (re.compile(r"^#+\s*", re.M), ""),
    (re.compile(r"^\s*[-*]\s+", re.M), ""),
]


def text_for_speech(text: str, limit: int = SPEECH_LIMIT) -> str:
    """Strips markdown and, if it's long, speaks only the beginning (the rest stays on screen)."""
    clean = text
    for regex, replacement in _MARKDOWN:
        clean = regex.sub(replacement, clean)
    # List items become sentences.
    lines = [line.strip().rstrip(".") for line in clean.splitlines() if line.strip()]
    clean = ". ".join(lines)
    clean = re.sub(r"\s+", " ", clean).strip()
    if clean and clean[-1] not in ".!?":
        clean += "."  # ending with punctuation makes Kokoro's intonation more natural
    if len(clean) <= limit:
        return clean
    sentences = re.split(r"(?<=[.!?])\s+", clean)
    summary = ""
    for s in sentences:
        if len(summary) + len(s) > limit:
            break
        summary += s + " "
    summary = summary.strip() or clean[:limit].rsplit(" ", 1)[0] + "."
    return f"{summary} {t('speech.details_on_screen')}"


def _wav(samples: np.ndarray, rate: int) -> bytes:
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def voice_style(kokoro, voice: str):
    """One voice ("pm_santa") or a weighted mix ("pm_santa:0.5+bm_lewis:0.5").

    The pronunciation comes from the language; the mix only changes the timbre. Gandalf's Portuguese
    voice blends the older Brazilian voice (pm_santa) with a deep British one (bm_lewis)."""
    if "+" not in voice and ":" not in voice:
        return voice
    parts = []
    for item in voice.split("+"):
        name, _, weight = item.strip().partition(":")
        parts.append((name.strip(), float(weight or 1)))
    total = sum(w for _, w in parts)
    if total <= 0:
        raise ValueError(f"invalid voice mix: {voice!r}")
    return sum(kokoro.get_voice_style(n) * (w / total) for n, w in parts)


def synthesize(text: str, voice: str | None = None, speed: float = 1.0) -> bytes:
    """Text → WAV (mono, 16-bit). The requested speed is multiplied by the configured one (Gandalf speaks slowly)."""
    if not text.strip():
        raise ValueError("empty text")
    kokoro = _kokoro_model()
    cfg = get_settings()
    try:
        style = voice_style(kokoro, voice or cfg.tts_voice)
    except (KeyError, ValueError) as e:
        raise ValueError(f"invalid voice: {voice or cfg.tts_voice!r}") from e
    samples, rate = kokoro.create(text, voice=style, speed=speed * cfg.voice_speed, lang=locales.current().KOKORO_LANGUAGE)
    return _wav(samples, rate)
