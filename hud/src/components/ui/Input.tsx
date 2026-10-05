import { Search } from 'lucide-react'
import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { cavado, foco } from './styles'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  rotulo?: string
  dica?: string
  erro?: string
}

const campo = cn(
  cavado,
  'h-11 w-full rounded-controle px-4 font-corpo placeholder:text-tinta-suave/70',
  'disabled:cursor-not-allowed disabled:opacity-45',
  foco,
)

/** Campo de texto cavado. */
export function Input({ rotulo, dica, erro, id, className, ...props }: Props) {
  const gerado = useId()
  const inputId = id ?? gerado
  const descricaoId = `${inputId}-desc`
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {rotulo && (
        <label htmlFor={inputId} className="text-sm font-semibold">
          {rotulo}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro || dica ? descricaoId : undefined}
        className={cn(campo, erro && 'outline-2 outline-terracota/70')}
        {...props}
      />
      {(erro || dica) && (
        <p id={descricaoId} className={cn('text-sm', erro ? 'font-semibold text-erro' : 'text-tinta-suave')}>
          {erro ?? dica}
        </p>
      )}
    </div>
  )
}

type SearchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { rotulo: string }

/** Campo de busca com ícone. O rótulo vira aria-label. */
export function SearchInput({ rotulo, className, ...props }: SearchProps) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-tinta-suave"
      />
      <input type="search" aria-label={rotulo} className={cn(campo, 'rounded-pilula pl-11')} {...props} />
    </div>
  )
}
