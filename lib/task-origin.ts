/**
 * Where a card came from, and what kind of card it is.
 *
 * `origin` says which agent, on which host, in which repo and conversation the card was born, so
 * a card parked in passing can be picked up later with its context. It is recorded when the card
 * is created and never edited: it is history, not a setting. `kind` tells a task from an idea,
 * a bug or a research item (a card an agent parked mid-task, see `aimaestro-task.sh park`).
 *
 * Both are labels written by whoever creates the card. On a trusted network that is a
 * convention, not proof of identity (same as a comment's author).
 */

import type { TaskKind, TaskOrigin } from '@/types/task'
import { TASK_KINDS } from '@/types/task'

const ID = /^[A-Za-z0-9][A-Za-z0-9._@:-]{0,127}$/
const MAX_REPO = 200
const MAX_NOTE = 1000

export interface KindAndOrigin { kind?: TaskKind; origin?: TaskOrigin }

/** Validate the optional kind and origin of a new card; returns the cleaned values or an error naming the field. */
export function parseKindAndOrigin(
  input: { kind?: unknown; origin?: unknown },
  selfHostId?: string,
): { ok: true; value: KindAndOrigin } | { ok: false; field: string; message: string } {
  const value: KindAndOrigin = {}

  if (input.kind !== undefined && input.kind !== null) {
    if (typeof input.kind !== 'string' || !TASK_KINDS.includes(input.kind as TaskKind)) {
      return { ok: false, field: 'kind', message: `kind must be one of ${TASK_KINDS.join(', ')}` }
    }
    value.kind = input.kind as TaskKind
  }

  if (input.origin !== undefined && input.origin !== null) {
    if (typeof input.origin !== 'object' || Array.isArray(input.origin)) {
      return { ok: false, field: 'origin', message: 'origin must be an object' }
    }
    const raw = input.origin as Record<string, unknown>
    const origin: TaskOrigin = {}
    for (const key of ['agentId', 'hostId', 'sessionId', 'threadId'] as const) {
      const v = raw[key]
      if (v === undefined || v === null || v === '') continue
      if (typeof v !== 'string' || !ID.test(v)) {
        return { ok: false, field: `origin.${key}`, message: `origin.${key} must be an id: letters, digits and . _ @ : - (up to 128)` }
      }
      origin[key] = v
    }
    if (raw.repo !== undefined && raw.repo !== null && raw.repo !== '') {
      if (typeof raw.repo !== 'string' || raw.repo.length > MAX_REPO) return { ok: false, field: 'origin.repo', message: `origin.repo must be text of at most ${MAX_REPO} characters` }
      origin.repo = raw.repo.replace(/[\u0000-\u001F\u007F]/g, '')
    }
    if (raw.note !== undefined && raw.note !== null && raw.note !== '') {
      if (typeof raw.note !== 'string') return { ok: false, field: 'origin.note', message: 'origin.note must be text' }
      origin.note = raw.note.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, MAX_NOTE)
    }
    // An origin that names an agent but not a host is from this host: the server knows which one that is
    if (origin.agentId && !origin.hostId && selfHostId) origin.hostId = selfHostId
    if (Object.keys(origin).length > 0) value.origin = origin
  }

  return { ok: true, value }
}
