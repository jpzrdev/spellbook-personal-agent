import type { ReactNode } from 'react'

// Renderiza o markdown simples das respostas do Gandalf: linhas, listas "- ", **negrito** e `código`.
function inline(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((parte, i) => {
    if (parte.startsWith('**') && parte.endsWith('**')) return <strong key={i}>{parte.slice(2, -2)}</strong>
    if (parte.startsWith('`') && parte.endsWith('`'))
      return (
        <code key={i} className="rounded-md px-1 font-mono text-[0.85em] shadow-cavado-sm">
          {parte.slice(1, -1)}
        </code>
      )
    return parte
  })
}

export function TextoGandalf({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm leading-relaxed">
      {texto.split('\n').map((linha, i) =>
        linha.startsWith('- ') ? (
          <p key={i} className="flex gap-2 pl-1">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-pilula bg-musgo" />
            <span>{inline(linha.slice(2))}</span>
          </p>
        ) : linha.trim() === '' ? (
          <span key={i} className="h-1" />
        ) : (
          <p key={i}>{inline(linha)}</p>
        ),
      )}
    </div>
  )
}
