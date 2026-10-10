/**
 * Pending secret requests (F033).
 *
 * An agent asks for a credential by NAME; the chat shows a card; the person types the
 * value into it. This store holds only the request (id, agent, name, a short note), never
 * a value. Requests live in memory, expire after 30 minutes and are lost on a restart, which
 * is fine: the agent asks again.
 *
 * State is kept on globalThis because Next compiles each API route into its own bundle, so
 * module-level state would not be shared between the routes that create and answer a request.
 */
import crypto from 'crypto'

export const REQUEST_TTL_MS = 30 * 60 * 1000
const MAX_NOTE = 200
const MAX_PER_AGENT = 20

export interface SecretRequest {
  id: string
  agentId: string
  name: string
  note?: string
  createdAt: number
}

type Store = Map<string, SecretRequest>
const g = globalThis as unknown as { __aimSecretRequests?: Store }
const store = (): Store => (g.__aimSecretRequests ??= new Map())

function sweep(now = Date.now()): void {
  for (const [id, r] of store()) if (now - r.createdAt > REQUEST_TTL_MS) store().delete(id)
}

/** One line of plain text: no control characters, no markup surprises, short. */
export function cleanNote(note: unknown): string | undefined {
  if (typeof note !== 'string') return undefined
  const t = note.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE)
  return t || undefined
}

/** A second request for the same name from the same agent returns the first. */
export function createRequest(agentId: string, name: string, note?: unknown): SecretRequest {
  sweep()
  for (const r of store().values()) if (r.agentId === agentId && r.name === name) return r
  const mine = [...store().values()].filter((r) => r.agentId === agentId)
  if (mine.length >= MAX_PER_AGENT) store().delete(mine.sort((a, b) => a.createdAt - b.createdAt)[0].id)
  const req: SecretRequest = { id: crypto.randomUUID(), agentId, name, note: cleanNote(note), createdAt: Date.now() }
  store().set(req.id, req)
  return req
}

export function listRequests(agentId: string): SecretRequest[] {
  sweep()
  return [...store().values()].filter((r) => r.agentId === agentId).sort((a, b) => a.createdAt - b.createdAt)
}

export function getRequest(id: string): SecretRequest | undefined {
  sweep()
  return store().get(id)
}

export function removeRequest(id: string): void {
  store().delete(id)
}

/** Tests only. */
export function resetSecretRequests(): void {
  store().clear()
}
