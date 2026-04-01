/**
 * TOML parsing and stringifying.
 * Wraps smol-toml (already in deps) for Codex agent files and config.
 */

import * as TOML from 'smol-toml'

/** Parse a TOML string into a JS object */
export function parseToml(content: string): Record<string, unknown> {
  return TOML.parse(content) as Record<string, unknown>
}

/** Stringify a JS object to TOML format */
export function stringifyToml(data: Record<string, unknown>): string {
  return TOML.stringify(data as TOML.TomlPrimitive)
}
