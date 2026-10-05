import { useQuery } from '@tanstack/react-query'
import { api, type Health } from '../lib/api'
import { cn } from '../lib/cn'

/** Ponto de status no header: Bridge + vault + Claude Code (verde = tudo pronto). */
export function StatusBridge() {
  const { data, error, isPending } = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/health?claude=true'),
    refetchInterval: 15_000,
    retry: false,
  })
  const [cor, texto] = isPending
    ? ['bg-ocre', 'conectando ao Bridge…']
    : error
      ? ['bg-terracota', `sem conexão com o Bridge: ${error.message}`]
      : !data?.vault_existe
        ? ['bg-ocre', 'Bridge conectado, mas o vault não foi encontrado']
        : !data.claude?.instalado
          ? ['bg-ocre', 'Bridge ok, mas o Claude Code não está instalado (tiers 2 e 3 indisponíveis)']
          : !data.claude.logado
            ? ['bg-ocre', 'Bridge ok, mas o Claude Code está sem login: rode `claude auth login`']
            : ['bg-musgo', `Bridge ${data.versao} e Claude Code prontos`]

  return (
    <span
      role="status"
      title={texto}
      className="flex items-center gap-2 rounded-pilula px-3 py-1.5 text-xs font-semibold text-tinta-suave shadow-cavado-sm"
    >
      <span aria-hidden className={cn('size-2.5 rounded-pilula', cor)} />
      <span className="hidden lg:inline">Bridge</span>
      <span className="sr-only">{texto}</span>
    </span>
  )
}
