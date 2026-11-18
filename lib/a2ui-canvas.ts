/**
 * A2UI surfaces as canvas pages (F114). An agent writes `canvas/<name>.a2ui.json` (a JSON array of A2UI v1.0
 * messages, or `{ "messages": [...] }`) or `<name>.a2ui.jsonl` (one message per line). The Canvas tab renders it
 * with our own locked component set, and a button's action goes to the same interactions record as `maestro.send`.
 *
 * Pure functions only: the renderer is in components/canvas/A2uiCanvasView.tsx.
 */

export const A2UI_FILE_RE = /\.a2ui\.jsonl?$/i

/** Basic-catalog components a canvas may use. Image, Video and AudioPlayer are left out: they load outside URLs. */
export const A2UI_ALLOWED_COMPONENTS = new Set([
  'Text', 'Icon', 'Row', 'Column', 'List', 'Card', 'Tabs', 'Modal', 'Divider',
  'Button', 'TextField', 'CheckBox', 'ChoicePicker', 'Slider', 'DateTimeInput',
])

/** Client-side functions a canvas may not call: openUrl leaves the dashboard. */
export const A2UI_BLOCKED_FUNCTIONS = new Set(['openUrl'])

/** Limits against a page that would freeze the dashboard. */
export const A2UI_MAX_MESSAGES = 500
export const A2UI_MAX_COMPONENTS = 2000

export function isA2uiFile(name: string): boolean {
  return A2UI_FILE_RE.test(name)
}

/** Reads the file text into a list of messages. Throws an Error a person can read. */
export function parseA2uiMessages(text: string, fileName = ''): unknown[] {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('The file is empty')
  if (/\.jsonl$/i.test(fileName)) {
    return trimmed.split('\n').filter(l => l.trim()).map((line, i) => {
      try { return JSON.parse(line) } catch { throw new Error(`Line ${i + 1} is not valid JSON`) }
    })
  }
  let parsed: unknown
  try { parsed = JSON.parse(trimmed) } catch (e) { throw new Error(`Not valid JSON: ${(e as Error).message}`) }
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { messages?: unknown }).messages)) {
    return (parsed as { messages: unknown[] }).messages
  }
  if (parsed && typeof parsed === 'object') return [parsed]
  throw new Error('Expected a list of A2UI messages')
}

/**
 * Checks messages against the locked set before they reach the renderer. Returns the problems found;
 * an empty list means the page may render. Every problem names where it is, so the agent can fix its file.
 */
export function checkA2uiMessages(messages: unknown[]): string[] {
  const problems: string[] = []
  if (messages.length > A2UI_MAX_MESSAGES) problems.push(`Too many messages (${messages.length}, at most ${A2UI_MAX_MESSAGES})`)
  let components = 0

  const walk = (value: unknown, where: string) => {
    if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${where}[${i}]`)); return }
    if (!value || typeof value !== 'object') return
    const obj = value as Record<string, unknown>
    const call = obj['@call'] ?? obj.call
    if (typeof call === 'string' && A2UI_BLOCKED_FUNCTIONS.has(call)) problems.push(`${where}: the function "${call}" is not allowed in a canvas`)
    for (const [k, v] of Object.entries(obj)) walk(v, `${where}.${k}`)
  }

  messages.forEach((msg, i) => {
    if (!msg || typeof msg !== 'object') { problems.push(`Message ${i + 1} is not an object`); return }
    const update = (msg as { updateComponents?: { components?: unknown } }).updateComponents
    const list = update && Array.isArray(update.components) ? update.components : []
    components += list.length
    list.forEach((c, j) => {
      const type = (c as { component?: unknown })?.component
      if (typeof type !== 'string' || !A2UI_ALLOWED_COMPONENTS.has(type)) {
        problems.push(`Message ${i + 1}, component ${j + 1}: "${String(type)}" is not available in a canvas`)
      }
    })
    walk(msg, `Message ${i + 1}`)
  })
  if (components > A2UI_MAX_COMPONENTS) problems.push(`Too many components (${components}, at most ${A2UI_MAX_COMPONENTS})`)
  return problems
}

/** The fields of an A2UI action the dashboard uses. */
export interface A2uiAction {
  name: string
  sourceComponentId?: string
  surfaceId?: string
  context?: Record<string, unknown>
}

/** An A2UI action as a canvas interaction (the body of POST /api/agents/:id/canvas/interactions). */
export function actionToInteraction(canvasFile: string, action: A2uiAction) {
  return {
    canvasFile,
    action: action.name,
    element: action.sourceComponentId || undefined,
    data: action.context && Object.keys(action.context).length > 0 ? action.context : undefined,
  }
}
