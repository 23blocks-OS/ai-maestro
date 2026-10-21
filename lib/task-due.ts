/**
 * Due dates and extra owners for a card. No Node-only imports: the server validates with these and
 * the browser formats with them.
 *
 * `due` is a calendar date, "YYYY-MM-DD": no time and no timezone, so a card due "Oct 25" is due
 * Oct 25 wherever it is read. "Today" is the reader's own local date.
 *
 * `owners` are the agents that also own a card, besides its primary assignee: ids or names, any
 * host. They are not looked up (most live on other hosts); they are shown as given.
 */

const DUE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,99}$/
export const MAX_OWNERS = 10

/** A real calendar date: 2026-02-30 is not one, 2028-02-29 is */
export function isValidDue(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const m = DUE_RE.exec(value)
  if (!m) return false
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return false
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return d <= days
}

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

/** undefined = not given (leave as is); null or "" = clear; otherwise a valid date */
export function parseDueInput(input: unknown): Parsed<string | null | undefined> {
  if (input === undefined) return { ok: true, value: undefined }
  if (input === null || input === '') return { ok: true, value: null }
  if (!isValidDue(input)) return { ok: false, message: 'due must be a calendar date, YYYY-MM-DD (for example 2026-10-25), or null to clear it' }
  return { ok: true, value: input }
}

/**
 * undefined = not given (leave as is); null or [] = clear; otherwise the cleaned list: trimmed, deduplicated
 * (names compare without case), the primary assignee(s) removed. More than MAX_OWNERS is refused.
 */
export function parseOwnersInput(input: unknown, primaries: Array<string | null | undefined> = []): Parsed<string[] | null | undefined> {
  if (input === undefined) return { ok: true, value: undefined }
  if (input === null) return { ok: true, value: null }
  if (!Array.isArray(input)) return { ok: false, message: 'owners must be a list of agent ids or names, or null to clear it' }
  const skip = new Set(primaries.filter((p): p is string => !!p).map(p => p.toLowerCase()))
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') return { ok: false, message: 'owners must contain only agent ids or names' }
    const v = raw.trim()
    if (!OWNER_RE.test(v)) return { ok: false, message: `owners has an invalid agent id or name: letters, digits and . _ @ - (up to 100)` }
    const key = v.toLowerCase()
    if (seen.has(key) || skip.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  if (out.length > MAX_OWNERS) return { ok: false, message: `a card can have at most ${MAX_OWNERS} extra owners` }
  return { ok: true, value: out.length === 0 ? null : out }
}

/** Does this agent (by id, or any of its names) appear among a card's extra owners? */
export function isCoOwner(owners: string[] | undefined, ...names: Array<string | null | undefined>): boolean {
  if (!owners || owners.length === 0) return false
  const mine = new Set(names.filter((n): n is string => !!n).map(n => n.toLowerCase()))
  return owners.some(o => mine.has(o.toLowerCase()))
}

/** The reader's local calendar date, YYYY-MM-DD */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

const dayNumber = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

export type DueKind = 'overdue' | 'today' | 'soon' | 'later'
export interface DueState { kind: DueKind; /** Days from today: negative when overdue */ days: number }

/** Where a due date stands: overdue (before today), today, soon (within 3 days), later */
export function dueState(due: string, today: string): DueState {
  const days = dayNumber(due) - dayNumber(today)
  if (days < 0) return { kind: 'overdue', days }
  if (days === 0) return { kind: 'today', days }
  return { kind: days <= 3 ? 'soon' : 'later', days }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "due Oct 25", "due today", "overdue 2d" */
export function dueLabel(due: string, today: string): string {
  const s = dueState(due, today)
  if (s.kind === 'overdue') return `overdue ${-s.days}d`
  if (s.kind === 'today') return 'due today'
  const [, m, d] = due.split('-').map(Number)
  return `due ${MONTHS[m - 1]} ${d}`
}

/** Sort order for a quadrant: dated cards first by earliest due, undated after (0 = keep the current order) */
export function compareDue(a?: string | null, b?: string | null): number {
  if (a && b) return a < b ? -1 : a > b ? 1 : 0
  if (a) return -1
  if (b) return 1
  return 0
}

/** Stable sort by due date: dated first, earliest first; cards with equal due (or none) keep their order */
export function sortByDue<T extends { due?: string | null }>(cards: T[]): T[] {
  return cards.map((c, i) => ({ c, i })).sort((x, y) => compareDue(x.c.due, y.c.due) || x.i - y.i).map(r => r.c)
}
