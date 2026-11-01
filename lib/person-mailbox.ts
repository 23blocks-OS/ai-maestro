/**
 * A person's mailbox (AMP spec 13.5), on the host that holds the person record:
 * ~/.agent-messaging/people/<personId>/{inbox,sent}/<messageId>.json. One file per message. Read state
 * belongs to the person, so every device of theirs sees the same mailbox.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { isPersonId } from '@/lib/people-registry'

export type Box = 'inbox' | 'sent'
export type PersonMessageStatus = 'unread' | 'read' | 'archived'

export interface PersonMessage {
  id: string
  box: Box
  from: string
  to: string
  subject: string
  priority: string
  in_reply_to?: string
  timestamp: string
  payload: { type?: string; message?: string; context?: Record<string, unknown>; [k: string]: unknown }
  signature?: string
  key_id?: string
  sender_kind?: 'agent' | 'person'
  /** The host's own verdict on the sender's signature */
  verified: boolean
  status: PersonMessageStatus
}

const MESSAGE_ID = /^[A-Za-z0-9_-]{1,100}$/
export const LIST_MAX = 500

function dir(personId: string, box: Box): string {
  if (!isPersonId(personId)) throw new Error('Invalid person id')
  return path.join(os.homedir(), '.agent-messaging', 'people', personId, box)
}

export function saveMessage(personId: string, m: PersonMessage): void {
  if (!MESSAGE_ID.test(m.id)) throw new Error('Invalid message id')
  const d = dir(personId, m.box)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(d, `${m.id}.json`), JSON.stringify(m, null, 2), 'utf-8')
}

function readBox(personId: string, box: Box): PersonMessage[] {
  const d = dir(personId, box)
  if (!fs.existsSync(d)) return []
  const out: PersonMessage[] = []
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.json')) continue
    try { out.push(JSON.parse(fs.readFileSync(path.join(d, f), 'utf-8'))) } catch { /* a broken file is skipped, not fatal */ }
  }
  return out
}

/**
 * The mailbox, newest first. With `withAddress`: the whole conversation with that agent, both boxes,
 * oldest first (what a chat thread needs).
 */
export function listMessages(personId: string, opts: { box?: Box; since?: string; withAddress?: string; limit?: number } = {}): PersonMessage[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), LIST_MAX)
  const since = opts.since ? Date.parse(opts.since) : NaN
  const peer = opts.withAddress?.toLowerCase()
  let all = opts.withAddress
    ? [...readBox(personId, 'inbox'), ...readBox(personId, 'sent')]
    : readBox(personId, opts.box ?? 'inbox')
  if (peer) all = all.filter(m => (m.box === 'inbox' ? m.from : m.to).toLowerCase() === peer)
  if (!Number.isNaN(since)) all = all.filter(m => Date.parse(m.timestamp) > since)
  all.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return peer ? all.slice(-limit) : all.reverse().slice(0, limit)
}

export function getMessage(personId: string, id: string): PersonMessage | null {
  if (!MESSAGE_ID.test(id)) return null
  for (const box of ['inbox', 'sent'] as Box[]) {
    const f = path.join(dir(personId, box), `${id}.json`)
    if (fs.existsSync(f)) {
      try { return JSON.parse(fs.readFileSync(f, 'utf-8')) } catch { return null }
    }
  }
  return null
}

export function setMessageStatus(personId: string, id: string, status: PersonMessageStatus): PersonMessage | null {
  const m = getMessage(personId, id)
  if (!m) return null
  m.status = status
  saveMessage(personId, m)
  return m
}
