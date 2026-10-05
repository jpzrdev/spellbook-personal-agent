import { Monitor, Moon, Sun } from 'lucide-react'
import { useTema, type Tema } from '../lib/tema'
import { Button } from './ui'

const ordem: Tema[] = ['sistema', 'claro', 'escuro']
const icones = { sistema: Monitor, claro: Sun, escuro: Moon }

/** Botão que alterna o tema: sistema → claro → escuro. */
export function SeletorTema() {
  const { tema, setTema } = useTema()
  const proximo = ordem[(ordem.indexOf(tema) + 1) % ordem.length]
  const Icone = icones[tema]
  const rotulo = `Tema: ${tema}. Mudar para: ${proximo}`
  return (
    <Button variante="icone" tamanho="sm" aria-label={rotulo} title={rotulo} onClick={() => setTema(proximo)}>
      <Icone className="size-4" aria-hidden />
    </Button>
  )
}
