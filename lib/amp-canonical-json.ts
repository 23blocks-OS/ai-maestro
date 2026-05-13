// AMP signing canonicalization. Spec §2 step 7: keys sorted lexicographically
// at all nesting levels, compact separators. Bare JSON.stringify follows
// insertion order — silent interop break with any compliant peer (e.g.
// crabmail). Used wherever a payload feeds into HMAC/signature input.
//
// Compact separators (`,` and `:` with no spaces) are Node's default when no
// `space` argument is passed, so the only behavior change vs JSON.stringify
// is the deterministic key ordering.
//
// Arrays are NOT reordered — element order is data, not metadata.

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, sortedKeysReplacer)
}

function sortedKeysReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }
  const obj = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = obj[k]
  }
  return sorted
}
