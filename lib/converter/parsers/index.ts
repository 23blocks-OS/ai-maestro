/**
 * Parser registry — maps provider IDs to parser implementations.
 */

import type { Parser, ProviderId } from '../types'

// Lazy imports to avoid circular dependencies
const parsers: Record<string, () => Promise<Parser>> = {
  'claude-code': () => import('./claude').then(m => m.default),
  'codex': () => import('./codex').then(m => m.default),
  'gemini': () => import('./gemini').then(m => m.default),
  'opencode': () => import('./opencode').then(m => m.default),
  'kiro': () => import('./kiro').then(m => m.default),
}

/** Get a parser for a given provider ID */
export async function getParser(providerId: ProviderId): Promise<Parser | null> {
  const factory = parsers[providerId]
  if (!factory) return null
  return factory()
}

/** Get all registered parser provider IDs */
export function getRegisteredParsers(): string[] {
  return Object.keys(parsers)
}
