/**
 * The name to show for an agent in a message list. A message carries only the sender's technical
 * name (from the AMP address), so the label (Emilia for 3m-gm) is looked up in the agents of every
 * host. Two agents with the same name and different labels are ambiguous: show the plain name.
 */
export function labelLookup(agents: Array<{ name: string; alias: string }>): (name?: string) => string | undefined {
  const found = new Map<string, string | null>()
  for (const a of agents) {
    if (!a.name || !a.alias || a.alias === a.name) continue
    const key = a.name.toLowerCase()
    const prev = found.get(key)
    found.set(key, prev === undefined || prev === a.alias ? a.alias : null)
  }
  return (name?: string) => (name ? found.get(name.toLowerCase()) || undefined : undefined)
}
