import io
import wave

import numpy as np

from app.speech import voz


def test_texto_para_fala_tira_markdown_e_resume():
    assert voz.texto_para_fala("**Hoje, sábado**\n- 09:00 Aula (Sala 204)\n- 14:00 Dentista") == (
        "Hoje, sábado. 09:00 Aula (Sala 204). 14:00 Dentista."
    )
    assert voz.texto_para_fala("Veja [[wiki/estudos/limites|limites]] e `raw/x.md`.") == "Veja limites e raw/x.md."
    longo = " ".join(f"Frase número {i} com algum conteúdo." for i in range(40))
    falado = voz.texto_para_fala(longo)
    assert len(falado) < 400 and falado.endswith("Os detalhes estão na tela.")


def test_wav_mono_16_bits():
    dados = voz._wav(np.zeros(2400, dtype=np.float32), 24000)
    with wave.open(io.BytesIO(dados)) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()) == (1, 2, 24000, 2400)


def test_sem_modelos_responde_503(client):
    assert client.get("/voz/status").json()["stt"] is False
    r = client.post("/voz/ouvir", files={"audio": ("fala.webm", b"x", "audio/webm")})
    assert r.status_code == 503 and "baixar_modelos" in r.json()["detail"]
    assert client.post("/voz/falar", json={"texto": "oi"}).status_code == 503


def test_ouvir_e_falar(client, monkeypatch):
    monkeypatch.setattr(voz, "transcrever", lambda dados: {"texto": "o que tenho hoje", "duracao_audio_s": 1.2})
    monkeypatch.setattr(voz, "sintetizar", lambda texto, v=None, vel=1.0: voz._wav(np.zeros(10, dtype=np.float32), 24000))
    r = client.post("/voz/ouvir", files={"audio": ("fala.webm", b"audio", "audio/webm")}).json()
    assert r["texto"] == "o que tenho hoje"
    r = client.post("/voz/falar", json={"texto": "**Pronto**, anotado."})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
    assert r.headers["x-texto-falado"] == "Pronto%2C%20anotado."
    assert client.post("/voz/ouvir", files={"audio": ("vazio.webm", b"", "audio/webm")}).status_code == 422


def test_pergunta_por_voz_fica_com_origem_voz(client, vault):
    import frontmatter

    client.post("/ask", json={"texto": "o que tenho hoje?", "origem": "voz"})
    [rec] = list((vault / "recibos").rglob("*.md"))
    assert frontmatter.load(rec)["origem"] == "voz"
