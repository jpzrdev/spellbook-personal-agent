/** [[path/note|alias]] (wiki link) → a markdown link to the Memory screen. */
export function wikilinks(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => {
    const path = target.trim().endsWith('.md') ? target.trim() : `${target.trim()}.md`
    const label = (alias ?? target.split('/').pop() ?? target).trim()
    return `[${label}](/memory?note=${encodeURIComponent(path)})`
  })
}

type Node = { type: string; value?: string; children?: Node[]; data?: Record<string, unknown> }

/** remark plugin: callouts (`> [!note]- Title`) become <details>/<summary>.
 * With `-` they start closed (e.g. the answer to a review question); without it, open. */
export function remarkCallouts() {
  const visit = (node: Node) => {
    node.children?.forEach(visit)
    if (node.type !== 'blockquote') return
    const first = node.children?.[0]
    const text = first?.type === 'paragraph' ? first.children?.[0] : undefined
    const m = text?.type === 'text' ? /^\[!(\w+)\]([+-]?)[ \t]*([^\n]*)\n?/.exec(text.value ?? '') : null
    if (!m || !text || !first) return
    const [whole, kind, fold, title] = m
    text.value = (text.value ?? '').slice(whole.length)
    if (!text.value && first.children?.length === 1) node.children!.shift()
    else if (!text.value) first.children!.shift()
    node.data = { hName: 'details', hProperties: { className: ['callout', `callout-${kind.toLowerCase()}`], open: fold !== '-' } }
    node.children!.unshift({ type: 'paragraph', data: { hName: 'summary' }, children: [{ type: 'text', value: title || kind }] })
  }
  return (tree: Node) => visit(tree)
}
