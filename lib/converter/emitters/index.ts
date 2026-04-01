/**
 * Emitter registry — maps provider IDs to emitter implementations.
 */

import type { Emitter, ProviderId } from '../types'

const emitters: Record<string, () => Promise<Emitter>> = {
  'claude-code': () => import('./claude').then(m => m.default),
  'codex': () => import('./codex').then(m => m.default),
  'gemini': () => import('./gemini').then(m => m.default),
  'opencode': () => import('./opencode').then(m => m.default),
  'kiro': () => import('./kiro').then(m => m.default),
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
