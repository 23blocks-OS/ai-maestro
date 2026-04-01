/**
 * Emitter registry — maps provider IDs to emitter implementations.
 */

import type { Emitter, ProviderId } from '../types'

const emitters: Record<string, () => Promise<Emitter>> = {
  'claude-code': () => import('./claude').then(m => m.default),
  // Phase 3+: 'codex', 'gemini', 'opencode', 'kiro', 'copilot'
}

/** Get an emitter for a given provider ID */
export async function getEmitter(providerId: ProviderId): Promise<Emitter | null> {
  const factory = emitters[providerId]
  if (!factory) return null
  return factory()
}

/** Get all registered emitter provider IDs */
export function getRegisteredEmitters(): string[] {
  return Object.keys(emitters)
}
