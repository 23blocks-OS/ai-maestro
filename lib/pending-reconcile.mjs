/**
 * Reconcile optimistic "Sending…" bubbles against what the transcript actually
 * contains. ONE implementation, used by both chat renderers.
 *
 * Getting this wrong fails in two opposite directions, and each renderer had a
 * different one:
 *
 *   ChatView — cleared only on the FIRST history load and required EXACT string
 *   equality on the incremental path. Every history push contains the sent
 *   message, so a reconnect or tab switch re-rendered the real message and left
 *   the bubble beside it. Persisting bubbles in v0.38.16 (so Retry survives a tab
 *   switch) turned that transient duplicate into a permanent one.
 *
 *   MobileChatView — cleared ALL pending on any incoming batch, so unrelated
 *   agent output marked your message delivered when it may never have landed.
 *   That is the same unearned-success pattern this codebase has spent a cycle
 *   removing, wearing a different hat.
 *
 * The rule: a bubble clears when ITS OWN text appears in the transcript, and
 * nothing else clears it. Matching is whitespace-insensitive because the text has
 * been through a terminal, which wraps and re-flows it.
 */

const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim()

/** Text of a transcript message, for echo comparison. */
export function transcriptText(message, extract) {
  return norm(extract ? extract(message) : '')
}

/**
 * @param pending  current bubbles: [{ id, text, status }]
 * @param msgs     newly arrived transcript messages
 * @param extract  (message) => string — renderer's own text extractor
 * @returns the bubbles that remain (same array identity when nothing changed)
 */
export function reconcilePending(pending, msgs, extract) {
  const echoed = (msgs || [])
    .filter((m) => m?.type === 'user' || (m?.type === 'queue-operation' && m.operation === 'enqueue'))
    .map((m) => transcriptText(m, extract))
    .filter(Boolean)
  if (echoed.length === 0) return pending

  const remaining = [...pending]
  for (const text of echoed) {
    const idx = remaining.findIndex((p) => norm(p.text) === text)
    if (idx !== -1) remaining.splice(idx, 1)
  }
  return remaining.length === pending.length ? pending : remaining
}
