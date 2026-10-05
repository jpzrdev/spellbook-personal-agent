import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router'
import remarkGfm from 'remark-gfm'
import { cn } from '../lib/cn'
import { remarkCallouts, wikilinks } from '../lib/markdown'

/** Markdown das notas e recibos (somente leitura), no estilo do design system. */
export function Markdown({ texto, className }: { texto: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 leading-relaxed break-words',
        '[&_h1]:font-titulo [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:font-titulo [&_h2]:text-xl [&_h2]:font-semibold',
        '[&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
        '[&_blockquote]:rounded-controle [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:shadow-cavado-sm',
        '[&_code]:rounded-md [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:shadow-cavado-sm',
        '[&_pre]:overflow-x-auto [&_pre]:rounded-controle [&_pre]:p-3 [&_pre]:shadow-cavado-sm [&_pre_code]:shadow-none',
        '[&_table]:w-full [&_table]:text-sm [&_td]:border-b [&_td]:border-sombra/40 [&_td]:p-1.5 [&_th]:p-1.5 [&_th]:text-left',
        '[&_hr]:border-sombra/50 [&_input]:mr-2 [&_input]:accent-musgo',
        // callouts do Obsidian (> [!note]- Resposta) viram blocos recolhíveis
        '[&_details]:rounded-controle [&_details]:px-4 [&_details]:py-2 [&_details]:shadow-cavado-sm [&_details>*+*]:mt-2',
        '[&_summary]:cursor-pointer [&_summary]:text-sm [&_summary]:font-semibold [&_summary]:text-musgo-texto',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCallouts]}
        components={{
          a: ({ href = '', children }) =>
            href.startsWith('/') ? (
              <Link to={href} className="font-semibold text-musgo-texto underline underline-offset-2">
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-musgo-texto underline underline-offset-2">
                {children}
              </a>
            ),
        }}
      >
        {wikilinks(texto)}
      </ReactMarkdown>
    </div>
  )
}
