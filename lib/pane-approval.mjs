/**
 * Approval prompts for programs that have no hook-fed question/permission state:
 * Grok Build and Codex. Their prompts live only in the terminal, so the chat
 * builds a clickable card from the pane, in the same shape parsePermissionMenu
 * returns for Claude Code (status 'permission_request' + options carrying the
 * key to send).
 *
 * Pure (no tmux, no IO). Input is a plain `capture-pane -p` capture. Nothing
 * semantic is read from dim text, so an -e capture is not needed here; the keys
 * we send are the digits, which both programs accept (verified live).
 *
 * Staleness: a live prompt is the LAST thing on the pane. Each program draws its
 * menu as an overlay with a footer line (Grok `1/5:select │ ...`, Codex `Press
 * enter to confirm or esc to cancel`). Once answered the overlay is gone and the
 * footer with it, so no footer at the bottom means no card. Conversation output
 * below the footer rejects it too.
 */

/** Which approval parser applies to an agent's program, or null. */
export function approvalKindForProgram(program) {
  const p = String(program || '').toLowerCase()
  if (p.includes('grok')) return 'grok'
  if (p.includes('codex')) return 'codex'
  return null
}

const CONVERSATION = /^\s*(?:•|✔|✗|└|■)/

function cleanLines(paneText) {
  return String(paneText || '').split('\n').map((l) => l.replace(/\s+$/, ''))
}

/** Index of the footer line matching `re`, if at most 2 non-blank lines follow it. */
function footerIndex(lines, re) {
  let seen = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue
    if (re.test(lines[i])) return i
    if (++seen > 2 || CONVERSATION.test(lines[i])) return -1
  }
  return -1
}

function buildOptions(raw) {
  const options = raw.map((o) => ({
    key: o.key,
    label: o.label.length > 200 ? o.label.slice(0, 197) + '…' : o.label,
    value: /^(no\b|never\b|reject|decline|cancel)/i.test(o.label) ? 'no' : 'yes',
  }))
  if (options.length < 2) return null
  for (let i = 0; i < options.length; i++) if (Number(options[i].key) !== i + 1) return null
  return options
}

/**
 * Grok Build:
 *   ┃  <title>
 *   ┃  <command or detail>
 *   ┃  ← → narrow scope  ·  e edit pattern
 *   ┃  1 (○) Yes, and don't ask again ...
 *   ┃  3 (●) Yes, proceed
 *   1/5:select  │  Tab:next option  │ ...
 */
export function parseGrokApproval(paneText) {
  const lines = cleanLines(paneText)
  const foot = footerIndex(lines, /^\s*\d+\/\d+:select\b/)
  if (foot < 0) return null

  // Walk up from the footer collecting the ┃ block.
  let end = foot - 1
  while (end >= 0 && !/┃/.test(lines[end])) {
    if (lines[end].trim()) return null
    end--
  }
  if (end < 0) return null
  let start = end
  while (start > 0 && /┃/.test(lines[start - 1])) start--
  const block = lines.slice(start, end + 1)
    .map((l) => l.replace(/^[^┃]*┃/, '').replace(/\s+$/, '').replace(/^ {1,2}/, ''))

  const optRe = /^(\d+) \((?:●|○)\) (.+)$/
  const raw = []
  const head = []
  for (const l of block) {
    const m = l.match(optRe)
    if (m) raw.push({ key: m[1], label: m[2].replace(/\s+/g, ' ').trim() })
    else if (!raw.length && l.trim() && !/narrow scope|edit pattern/.test(l)) head.push(l.trim())
  }
  const options = buildOptions(raw)
  if (!options || head.length === 0) return null

  const title = head[0]
  const body = head.slice(1).join('\n')
  const card = { status: 'permission_request', message: title, description: title, options, source: 'pane', answerByKey: true }
  // The "Always allow: <cmd>" option names the command pattern; when the detail
  // line starts with it, the detail is a shell command and renders as one.
  const allow = options.find((o) => /^always allow:/i.test(o.label))
  const pattern = allow ? allow.label.replace(/^always allow:\s*/i, '') : ''
  if (body && pattern && body.startsWith(pattern)) {
    card.toolName = 'Bash'
    card.toolInput = { command: body }
  } else if (body) {
    card.description = `${title}\n${body}`
  }
  return card
}

/**
 * Codex:
 *   Would you like to run the following command?
 *   Environment: local
 *   Reason: ...
 *   $ touch askme.txt
 *   › 1. Yes, proceed (y)
 *     2. Yes, and don't ask again for commands that start with `touch askme.txt` (p)
 *     3. No, and tell Codex what to do differently (esc)
 *   Press enter to confirm or esc to cancel
 */
export function parseCodexApproval(paneText) {
  const lines = cleanLines(paneText)
  const foot = footerIndex(lines, /^\s*Press enter to confirm or esc to cancel/i)
  if (foot < 0) return null

  const optRe = /^\s*[›>]?\s*(\d+)\.\s+(.+?)\s*$/
  const found = []
  let i = foot - 1
  while (i >= 0 && !lines[i].trim()) i--
  for (; i >= 0; i--) {
    const m = lines[i].match(optRe)
    if (!m) break
    found.unshift({
      idx: i,
      key: m[1],
      label: m[2].replace(/\s+\((?:y|p|esc|[a-z])\)$/i, '').replace(/\s+/g, ' ').trim(),
    })
  }
  if (!found.length || found[0].key !== '1') return null
  const options = buildOptions(found)
  if (!options) return null

  // Header: walk up to the question line.
  const head = []
  for (let j = found[0].idx - 1; j >= 0; j--) {
    const t = lines[j].trim()
    head.unshift(t)
    if (/^(would you like|do you want)\b/i.test(t)) break
    if (found[0].idx - j > 14) return null
  }
  const qi = head.findIndex((t) => /^(would you like|do you want)\b/i.test(t))
  if (qi < 0) return null // not a codex approval header; do not guess
  const q = head[qi]
  const detail = head.slice(qi + 1).filter(Boolean)
  const cmdLine = detail.find((t) => /^\$ /.test(t))
  const card = { status: 'permission_request', message: q, description: q, options, source: 'pane', answerByKey: true }
  if (cmdLine) {
    card.toolName = 'Bash'
    card.toolInput = { command: cmdLine.replace(/^\$ /, '') }
    const reason = detail.find((t) => /^Reason:/i.test(t))
    if (reason) card.description = `${q}\n${reason}`
  } else if (detail.length) {
    card.description = `${q}\n${detail.join('\n')}`
  }
  return card
}

/** Parse the approval prompt for `program` (grok | codex), or null. */
export function parseApprovalForProgram(program, paneText) {
  const kind = approvalKindForProgram(program)
  if (kind === 'grok') return parseGrokApproval(paneText)
  if (kind === 'codex') return parseCodexApproval(paneText)
  return null
}
