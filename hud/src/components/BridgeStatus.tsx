import { useQuery } from '@tanstack/react-query'
import { api, type Health } from '../lib/api'
import { cn } from '../lib/cn'
import { useAgent } from '../lib/queries'

/** A status dot in the header: Bridge + memory + Claude Code (green = all set). */
export function BridgeStatus() {
  const agentName = useAgent().name
  const { data, error, isPending } = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/health?claude=true'),
    refetchInterval: 15_000,
    retry: false,
  })
  const [color, text] = isPending
    ? ['bg-gold', 'connecting to the Bridge…']
    : error
      ? ['bg-ember', `no connection to the Bridge: ${error.message}`]
      : !data?.memory_exists
        ? ['bg-gold', 'Bridge connected, but the memory was not found']
        : !data.claude?.installed
          ? ['bg-gold', 'Bridge ok, but Claude Code is not installed (tiers 2 and 3 unavailable)']
          : !data.claude.logged_in
            ? ['bg-gold', 'Bridge ok, but Claude Code is not logged in: run `claude auth login`']
            : ['bg-primary', `Bridge ${data.version} and Claude Code ready · ${agentName} speaks ${data.language}`]

  return (
    <span
      role="status"
      title={text}
      className="flex items-center gap-2 rounded-pill px-3 py-1.5 text-xs font-semibold text-ink-muted shadow-sunken-sm"
    >
      <span aria-hidden className={cn('size-2.5 rounded-pill', color)} />
      <span className="hidden lg:inline">Bridge</span>
      <span className="sr-only">{text}</span>
    </span>
  )
}
