import type { ReactNode } from 'react'

// Renders the simple markdown of Gandalf's replies: lines, "- " lists, **bold** and `code`.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code key={i} className="rounded-md px-1 font-mono text-[0.85em] shadow-sunken-sm">
          {part.slice(1, -1)}
        </code>
      )
    return part
  })
}

export function GandalfText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm leading-relaxed">
      {text.split('\n').map((line, i) =>
        line.startsWith('- ') ? (
          <p key={i} className="flex gap-2 pl-1">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-pill bg-primary" />
            <span>{inline(line.slice(2))}</span>
          </p>
        ) : line.trim() === '' ? (
          <span key={i} className="h-1" />
        ) : (
          <p key={i}>{inline(line)}</p>
        ),
      )}
    </div>
  )
}
