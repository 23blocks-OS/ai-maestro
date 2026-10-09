/**
 * Log a line only when a value changes. For polled paths (every /api/sessions
 * call, every index sweep) that would otherwise repeat the same line forever.
 * State is per process; `key` names the call site.
 */
const last = new Map<string, unknown>()

export function shouldLogChange(key: string, value: unknown): boolean {
  if (last.has(key) && last.get(key) === value) return false
  last.set(key, value)
  return true
}

/** Test hook. */
export function _resetLogOnChange(): void {
  last.clear()
}
