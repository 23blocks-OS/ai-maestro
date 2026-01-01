/**
 * Shared CozoDB utilities
 *
 * IMPORTANT: Use these functions for ALL string values inserted into CozoDB queries.
 * Raw string interpolation will break on quotes, newlines, tabs, and backslashes.
 */

/**
 * Escape a string for safe insertion into CozoDB queries.
 * Handles: backslashes, single quotes, newlines, carriage returns, tabs
 *
 * @param s - The string to escape (can be undefined/null)
 * @returns Escaped string wrapped in quotes, or 'null' if input is falsy
 *
 * @example
 * escapeForCozo("it's a test")  // "'it\\'s a test'"
 * escapeForCozo("line1\nline2") // "'line1\\nline2'"
 * escapeForCozo(undefined)      // "null"
 */
export function escapeForCozo(s: string | undefined | null): string {
  if (!s) return 'null'

  return "'" + s
    .replace(/\\/g, '\\\\')   // Escape backslashes first (order matters!)
    .replace(/'/g, "\\'")     // Then escape single quotes
    .replace(/\n/g, '\\n')    // Then escape newlines
    .replace(/\r/g, '\\r')    // Then escape carriage returns
    .replace(/\t/g, '\\t')    // Then escape tabs
    + "'"
}

/**
 * Escape a string but return without quotes (for building complex expressions)
 *
 * @param s - The string to escape
 * @returns Escaped string WITHOUT surrounding quotes
 */
export function escapeForCozoRaw(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}
