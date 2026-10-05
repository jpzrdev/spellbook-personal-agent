import { useCallback, useEffect, useRef, useState } from 'react'
import { buscarFala, postArquivo } from './api'
import { chat } from './chatStore'
import { mascote } from './mascote'
import { usePerguntar } from './queries'

export type EstadoVoz = 'parado' | 'ouvindo' | 'pensando' | 'falando'

const TIPOS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

function extensao(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

type Opcoes = {
  /** Chamado quando uma pergunta por voz recebe resposta (ex.: abrir a conversa). */
  aoResponder?: () => void
  aoErro?: (mensagem: string) => void
}

/** Ciclo da voz: gravar → transcrever (Whisper) → perguntar ao Gandalf → falar a resposta (Kokoro). */
export function useVoz({ aoResponder, aoErro }: Opcoes = {}) {
  const [estado, setEstado] = useState<EstadoVoz>('parado')
  const perguntar = usePerguntar()
  const gravador = useRef<MediaRecorder | null>(null)
  const partes = useRef<Blob[]>([])
  const audio = useRef<HTMLAudioElement | null>(null)
  const cancelado = useRef(false)

  const falhar = useCallback(
    (mensagem: string) => {
      setEstado('parado')
      aoErro?.(mensagem)
    },
    [aoErro],
  )

  const pararFala = useCallback(() => {
    audio.current?.pause()
    audio.current = null
    mascote.calar()
    setEstado('parado')
  }, [])

  const falar = useCallback(
    async (texto: string) => {
      try {
        setEstado('falando')
        mascote.reagir('falando')
        const blob = await buscarFala(texto)
        const url = URL.createObjectURL(blob)
        const el = new Audio(url)
        audio.current = el
        el.onended = () => {
          URL.revokeObjectURL(url)
          if (audio.current === el) pararFala()
        }
        await el.play()
      } catch (e) {
        // Sem TTS a resposta continua na tela; só avisa.
        falhar(`Não consegui falar a resposta: ${(e as Error).message}`)
      }
    },
    [falhar, pararFala],
  )

  const processar = useCallback(
    async (gravacao: Blob, mime: string) => {
      setEstado('pensando')
      let texto: string
      try {
        const r = await postArquivo<{ texto: string }>('/voz/ouvir', 'audio', gravacao, `fala.${extensao(mime)}`)
        texto = r.texto.trim()
      } catch (e) {
        return falhar(`Não consegui ouvir: ${(e as Error).message}`)
      }
      if (!texto) return falhar('Não entendi nada. Segure o botão enquanto fala.')

      const id = chat.adicionar(texto)
      aoResponder?.()
      mascote.alimentar(15)
      perguntar.mutate(
        { texto, origem: 'voz' },
        {
          onSuccess: (resposta) => {
            chat.atualizar(id, { resposta })
            void falar(resposta.resposta)
          },
          onError: (err) => {
            chat.atualizar(id, { erro: err.message })
            falhar(err.message)
          },
        },
      )
    },
    [aoResponder, falar, falhar, perguntar],
  )

  const iniciar = useCallback(async () => {
    if (estado === 'falando') return pararFala()
    if (estado !== 'parado') return
    if (!navigator.mediaDevices?.getUserMedia) {
      return falhar('Este navegador não deixa usar o microfone aqui (precisa de HTTPS ou localhost).')
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mime = TIPOS.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      partes.current = []
      cancelado.current = false
      rec.ondataavailable = (e) => e.data.size > 0 && partes.current.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(partes.current, { type: rec.mimeType })
        if (cancelado.current) return setEstado('parado')
        // Menos de ~0,4 s de áudio: foi um toque sem querer.
        if (blob.size < 2000) return falhar('Gravação muito curta. Segure o botão enquanto fala.')
        void processar(blob, rec.mimeType)
      }
      gravador.current = rec
      rec.start()
      setEstado('ouvindo')
    } catch (e) {
      falhar(
        (e as Error).name === 'NotAllowedError'
          ? 'Permissão do microfone negada. Libere nas configurações do navegador.'
          : `Microfone indisponível: ${(e as Error).message}`,
      )
    }
  }, [estado, falhar, pararFala, processar])

  const terminar = useCallback(() => {
    if (gravador.current?.state === 'recording') gravador.current.stop()
    gravador.current = null
  }, [])

  const cancelar = useCallback(() => {
    cancelado.current = true
    terminar()
    pararFala()
  }, [pararFala, terminar])

  // Esc cancela a gravação ou para a fala.
  useEffect(() => {
    if (estado !== 'ouvindo' && estado !== 'falando') return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && cancelar()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [estado, cancelar])

  return { estado, iniciar, terminar, cancelar }
}
