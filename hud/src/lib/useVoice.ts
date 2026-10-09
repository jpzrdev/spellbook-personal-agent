import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSpeech, postFile } from './api'
import { chat } from './chatStore'
import { mascot } from './mascot'
import { useAsk } from './queries'

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

function extension(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

type Options = {
  /** Called when a voice question gets an answer (e.g. to open the conversation). */
  onReply?: () => void
  onError?: (message: string) => void
}

/** The voice cycle: record → transcribe (Whisper) → ask Gandalf → speak the answer (Kokoro). */
export function useVoice({ onReply, onError }: Options = {}) {
  const [state, setState] = useState<VoiceState>('idle')
  const ask = useAsk()
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const audio = useRef<HTMLAudioElement | null>(null)
  const cancelled = useRef(false)

  const fail = useCallback(
    (message: string) => {
      setState('idle')
      onError?.(message)
    },
    [onError],
  )

  const stopSpeaking = useCallback(() => {
    audio.current?.pause()
    audio.current = null
    mascot.hush()
    setState('idle')
  }, [])

  const speak = useCallback(
    async (text: string) => {
      try {
        setState('speaking')
        mascot.react('talking')
        const blob = await fetchSpeech(text)
        const url = URL.createObjectURL(blob)
        const el = new Audio(url)
        audio.current = el
        el.onended = () => {
          URL.revokeObjectURL(url)
          if (audio.current === el) stopSpeaking()
        }
        await el.play()
      } catch (e) {
        // Without TTS the answer stays on screen; just warn.
        fail(`I couldn't speak the answer: ${(e as Error).message}`)
      }
    },
    [fail, stopSpeaking],
  )

  const process = useCallback(
    async (recording: Blob, mime: string) => {
      setState('thinking')
      let text: string
      try {
        const r = await postFile<{ text: string }>('/voice/listen', 'audio', recording, `speech.${extension(mime)}`)
        text = r.text.trim()
      } catch (e) {
        return fail(`I couldn't hear you: ${(e as Error).message}`)
      }
      if (!text) return fail("I didn't catch anything. Hold the button while you talk.")

      const id = chat.add(text)
      onReply?.()
      mascot.feed(15)
      const { conversationId, deep } = chat.get()
      ask.mutate(
        { text, source: 'voice', conversationId, deep },
        {
          onSuccess: (reply) => {
            chat.settle(id, reply)
            void speak(reply.reply)
          },
          onError: (err) => {
            chat.update(id, { error: err.message })
            fail(err.message)
          },
        },
      )
    },
    [onReply, speak, fail, ask],
  )

  const start = useCallback(async () => {
    if (state === 'speaking') return stopSpeaking()
    if (state !== 'idle') return
    if (!navigator.mediaDevices?.getUserMedia) {
      return fail("This browser doesn't allow the microphone here (it needs HTTPS or localhost).")
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mime = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []
      cancelled.current = false
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks.current, { type: rec.mimeType })
        if (cancelled.current) return setState('idle')
        // Less than ~0.4 s of audio: an accidental tap.
        if (blob.size < 2000) return fail('Recording too short. Hold the button while you talk.')
        void process(blob, rec.mimeType)
      }
      recorder.current = rec
      rec.start()
      setState('listening')
    } catch (e) {
      fail(
        (e as Error).name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow it in the browser settings.'
          : `Microphone unavailable: ${(e as Error).message}`,
      )
    }
  }, [state, fail, stopSpeaking, process])

  const finish = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
    recorder.current = null
  }, [])

  const cancel = useCallback(() => {
    cancelled.current = true
    finish()
    stopSpeaking()
  }, [stopSpeaking, finish])

  // Esc cancels the recording or stops the speech.
  useEffect(() => {
    if (state !== 'listening' && state !== 'speaking') return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && cancel()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [state, cancel])

  return { state, start, finish, cancel }
}
