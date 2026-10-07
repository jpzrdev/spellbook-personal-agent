import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router'
import remarkGfm from 'remark-gfm'
import { cn } from '../lib/cn'
import { remarkCallouts, wikilinks } from '../lib/markdown'

/** Markdown for notes and receipts (read-only), in the design system's style. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 leading-relaxed break-words',
        '[&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold',
        '[&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
        '[&_blockquote]:rounded-control [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:shadow-sunken-sm',
        '[&_code]:rounded-md [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:shadow-sunken-sm',
        '[&_pre]:overflow-x-auto [&_pre]:rounded-control [&_pre]:p-3 [&_pre]:shadow-sunken-sm [&_pre_code]:shadow-none',
        '[&_table]:w-full [&_table]:text-sm [&_td]:border-b [&_td]:border-shade/40 [&_td]:p-1.5 [&_th]:p-1.5 [&_th]:text-left',
        '[&_hr]:border-shade/50 [&_input]:mr-2 [&_input]:accent-primary',
        // Callouts (> [!note]- Answer) become collapsible blocks
        '[&_details]:rounded-control [&_details]:px-4 [&_details]:py-2 [&_details]:shadow-sunken-sm [&_details>*+*]:mt-2',
        '[&_summary]:cursor-pointer [&_summary]:text-sm [&_summary]:font-semibold [&_summary]:text-primary-text',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCallouts]}
        components={{
          a: ({ href = '', children }) =>
            href.startsWith('/') ? (
              <Link to={href} className="font-semibold text-primary-text underline underline-offset-2">
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-primary-text underline underline-offset-2">
                {children}
              </a>
            ),
        }}
      >
        {wikilinks(text)}
      </ReactMarkdown>
    </div>
  )
}
