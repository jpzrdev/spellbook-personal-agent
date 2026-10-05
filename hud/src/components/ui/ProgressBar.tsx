import { cn } from '../../lib/cn'
import { solido, type Cor } from './styles'

type Props = {
  valor: number
  max?: number
  rotulo: string
  cor?: Cor
  mostrarValor?: boolean
  className?: string
}

/** Trilha cavada com preenchimento arredondado. */
export function ProgressBar({ valor, max = 100, rotulo, cor = 'musgo', mostrarValor = true, className }: Props) {
  const pct = Math.round((Math.min(Math.max(valor, 0), max) / max) * 100)
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex justify-between text-sm font-semibold">
        <span>{rotulo}</span>
        {mostrarValor && <span className="text-tinta-suave tabular-nums">{pct}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={rotulo}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={valor}
        className="h-3.5 overflow-hidden rounded-pilula bg-pergaminho p-0.5 shadow-cavado-sm"
      >
        <div
          className={cn('h-full rounded-pilula transition-[width] duration-300', solido[cor])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
