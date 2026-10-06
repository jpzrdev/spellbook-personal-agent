import io
import wave

import numpy as np

from app.speech import voice


def test_text_for_speech_strips_markdown_and_summarizes():
    assert voice.text_for_speech("**Today, Saturday**\n- 09:00 Lecture (Room 204)\n- 14:00 Dentist") == (
        "Today, Saturday. 09:00 Lecture (Room 204). 14:00 Dentist."
    )
    assert voice.text_for_speech("See [[wiki/studies/limits|limits]] and `raw/x.md`.") == "See limits and raw/x.md."
    long = " ".join(f"Sentence number {i} with some content." for i in range(40))
    spoken = voice.text_for_speech(long)
    assert len(spoken) < 400 and spoken.endswith("The details are on the screen.")


def test_speech_summary_ending_follows_the_language(pt_br):
    long = " ".join(f"Frase número {i} com algum conteúdo." for i in range(40))
    assert voice.text_for_speech(long).endswith("Os detalhes estão na tela.")


def test_wav_mono_16_bit():
    data = voice._wav(np.zeros(2400, dtype=np.float32), 24000)
    with wave.open(io.BytesIO(data)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()) == (1, 2, 24000, 2400)


def test_without_models_answers_503(client):
    status = client.get("/voice/status").json()
    assert status["stt"] is False and status["language"] == "en"
    r = client.post("/voice/listen", files={"audio": ("speech.webm", b"x", "audio/webm")})
    assert r.status_code == 503 and "download_models" in r.json()["detail"]
    assert client.post("/voice/speak", json={"text": "hi"}).status_code == 503


def test_listen_and_speak(client, monkeypatch):
    monkeypatch.setattr(voice, "transcribe", lambda data: {"text": "what do I have today", "audio_duration_s": 1.2})
    monkeypatch.setattr(voice, "synthesize", lambda text, v=None, s=1.0: voice._wav(np.zeros(10, dtype=np.float32), 24000))
    r = client.post("/voice/listen", files={"audio": ("speech.webm", b"audio", "audio/webm")}).json()
    assert r["text"] == "what do I have today"
    r = client.post("/voice/speak", json={"text": "**Done**, noted."})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
    assert r.headers["x-spoken-text"] == "Done%2C%20noted."
    assert client.post("/voice/listen", files={"audio": ("empty.webm", b"", "audio/webm")}).status_code == 422


def test_a_voice_question_keeps_the_voice_source(client, vault):
    import frontmatter

    client.post("/ask", json={"text": "what do I have today?", "source": "voice"})
    [rec] = list((vault / "receipts").rglob("*.md"))
    assert frontmatter.load(rec)["source"] == "voice"
