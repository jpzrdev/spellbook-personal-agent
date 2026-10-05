/** [[caminho/nota|apelido]] (Obsidian) → link markdown para a tela Vault. */
export function wikilinks(texto: string): string {
  return texto.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, alvo: string, apelido?: string) => {
    const caminho = alvo.trim().endsWith('.md') ? alvo.trim() : `${alvo.trim()}.md`
    const rotulo = (apelido ?? alvo.split('/').pop() ?? alvo).trim()
    return `[${rotulo}](/vault?nota=${encodeURIComponent(caminho)})`
  })
}

type No = { type: string; value?: string; children?: No[]; data?: Record<string, unknown> }

/** Plugin remark: callouts do Obsidian (`> [!note]- Título`) viram <details>/<summary>.
 * Com `-` começam fechados (ex.: a resposta de uma pergunta de revisão); sem, abertos. */
export function remarkCallouts() {
  const visitar = (no: No) => {
    no.children?.forEach(visitar)
    if (no.type !== 'blockquote') return
    const primeiro = no.children?.[0]
    const texto = primeiro?.type === 'paragraph' ? primeiro.children?.[0] : undefined
    const m = texto?.type === 'text' ? /^\[!(\w+)\]([+-]?)[ \t]*([^\n]*)\n?/.exec(texto.value ?? '') : null
    if (!m || !texto || !primeiro) return
    const [inteiro, tipo, dobra, titulo] = m
    texto.value = (texto.value ?? '').slice(inteiro.length)
    if (!texto.value && primeiro.children?.length === 1) no.children!.shift()
    else if (!texto.value) primeiro.children!.shift()
    no.data = { hName: 'details', hProperties: { className: ['callout', `callout-${tipo.toLowerCase()}`], open: dobra !== '-' } }
    no.children!.unshift({ type: 'paragraph', data: { hName: 'summary' }, children: [{ type: 'text', value: titulo || tipo }] })
  }
  return (arvore: No) => visitar(arvore)
}
