import { ChevronDown } from 'lucide-react'
import { useId, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { cavado, foco } from './styles'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  rotulo: string
  opcoes: Array<{ valor: string; texto: string }>
  dica?: string
}

/** Select nativo (acessível) com o visual cavado. */
export function Select({ rotulo, opcoes, dica, id, className, ...props }: SelectProps) {
  const gerado = useId()
  const selectId = id ?? gerado
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={selectId} className="text-sm font-semibold">
        {rotulo}
      </label>
      <div className="relative">
        <select
          id={selectId}
          aria-describedby={dica ? `${selectId}-dica` : undefined}
          className={cn(cavado, 'h-11 w-full cursor-pointer appearance-none rounded-controle pr-10 pl-4', foco)}
          {...props}
        >
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-tinta-suave" />
      </div>
      {dica && (
        <p id={`${selectId}-dica`} className="text-sm text-tinta-suave">
          {dica}
        </p>
      )}
    </div>
  )
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo: string; dica?: string }

export function Textarea({ rotulo, dica, id, className, ...props }: TextareaProps) {
  const gerado = useId()
  const areaId = id ?? gerado
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={areaId} className="text-sm font-semibold">
        {rotulo}
      </label>
      <textarea
        id={areaId}
        aria-describedby={dica ? `${areaId}-dica` : undefined}
        className={cn(cavado, 'min-h-24 w-full resize-y rounded-controle px-4 py-3 placeholder:text-tinta-suave/70', foco)}
        {...props}
      />
      {dica && (
        <p id={`${areaId}-dica`} className="text-sm text-tinta-suave">
          {dica}
        </p>
      )}
    </div>
  )
}
