/**
 * Parse a Claude Code permission / choice menu out of captured tmux pane text.
 *
 * Pure (no tmux, no IO) so it is unit-testable. Returns the permission-card shape
 * that chat clients render, or null when there is no complete, active menu.
 *
 * Fixes for the bug where TALL prompts silently drop option 1 (usually "Yes"):
 *  1. Anchor on the menu STRUCTURE. Find the live "1." and walk the key sequence
 *     1,2,3,… instead of trusting a fixed line window (a long tool preview pushes
 *     the menu's top line far above any slice, and option 1 is the first casualty).
 *  2. Reject a TRUNCATED parse. A real menu is 1..N with no gaps; anything else
 *     means lines were lost, so return null and let the caller retry rather than
 *     render a menu that is quietly missing "Yes".
 *  3. TRUNCATE long labels instead of dropping them. Dropping a >90-char label
 *     punched a hole in the middle of the menu that the completeness check would
 *     then reject; long AskUserQuestion choices now survive.
 */
export function parsePermissionMenu(paneText) {
  if (!paneText) return null

  // Strip the box-drawing borders Claude Code wraps the menu in, and trailing ws.
  const lines = paneText.split('\n').map((l) =>
    l.replace(/[│┃╎╏┆┇]/g, ' ').replace(/\s+$/, ''))

  // Every numbered option line, with its position in the capture.
  const optRe = /^[\s❯>▶*]*(\d+)\.\s+(.+?)\s*$/
  const optLines = []
  lines.forEach((l, idx) => {
    const m = l.match(optRe)
    if (m) optLines.push({ idx, key: m[1], label: m[2].replace(/\s+/g, ' ').trim() })
  })
  if (optLines.length < 2) return null

  // The live menu starts at the LAST "1." in view (older menus and prose lists sit
  // above it). Walk the key sequence downward, matching by KEY, so wrapped label
  // lines between options do not break the run.
  let startI = -1
  for (let i = optLines.length - 1; i >= 0; i--) {
    if (optLines[i].key === '1') { startI = i; break }
  }
  if (startI === -1) return null // no option 1 in view means the parse is truncated

  const block = [optLines[startI]]
  let expected = 2
  for (let i = startI + 1; i < optLines.length; i++) {
    const n = Number(optLines[i].key)
    if (n === 1) break // a newer menu began
    if (n === expected) { block.push(optLines[i]); expected++ }
  }

  // Guard against a gapped menu (e.g. a mangled middle option): if a numbered line
  // that is not the start of a new menu sits just below the block, the run broke.
  const lastIdx = block[block.length - 1].idx
  const trailing = optLines.find((o) => o.idx > lastIdx && o.idx - lastIdx <= 4)
  if (trailing && trailing.key !== '1') return null

  // Confirm an ACTIVE prompt near the menu (footer, phrasing, or the ❯ selector),
  // not a stale numbered list somewhere in scrollback.
  const near = lines.slice(Math.max(0, block[0].idx - 8)).join('\n')
  const activeMarker =
    /tab to amend|ctrl\+e to explain|esc to cancel|do you want to proceed|would you like to proceed|yes, and don'?t ask/i
  const hasSelector = /[❯▶]\s*\d+\.\s/.test(near)
  if (!activeMarker.test(near) && !hasSelector) return null

  const byKey = new Map()
  for (const o of block) {
    if (!o.label) continue
    const label = o.label.length > 200 ? o.label.slice(0, 197) + '…' : o.label
    byKey.set(o.key, {
      key: o.key,
      label,
      value: /^no\b|decline|cancel|don'?t/i.test(label) ? 'no' : 'yes',
    })
  }
  const options = Array.from(byKey.values()).sort((a, b) => Number(a.key) - Number(b.key))

  // Completeness: keys must be exactly 1..N. Reject a truncated/corrupt scrape.
  if (options.length < 2) return null
  for (let i = 0; i < options.length; i++) {
    if (Number(options[i].key) !== i + 1) return null
  }

  const qMatch = near.match(/((?:Do you want|Would you like)[^\n?]*\??)/i)
  const question = qMatch ? qMatch[1].trim() : 'The agent is asking to run a tool'
  return { status: 'permission_request', message: question, description: question, options, source: 'pane' }
}
