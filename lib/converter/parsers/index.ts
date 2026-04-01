/**
 * Parser registry — maps provider IDs to parser implementations.
 */

import type { Parser, ProviderId } from '../types'

// Lazy imports to avoid circular dependencies
const parsers: Record<string, () => Promise<Parser>> = {
  'claude-code': () => import('./claude').then(m => m.default),
  // Phase 3+: 'codex', 'gemini', 'opencode', 'kiro', 'copilot'
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
