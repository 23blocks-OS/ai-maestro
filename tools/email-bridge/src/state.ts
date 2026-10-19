/**
 * What the bridge remembers between polls, per account. Version 1 (today's file) held only
 * { lastUids, lastPoll }; it is read and upgraded without losing the cursor.
 */

import fs from 'fs'
import path from 'path'
import type { PendingItem } from './format.js'

export interface AccountState {
  /** null until the mailbox has been opened once with this version */
  uidValidity: number | null
  lastUid: number
  pending: PendingItem[]
  /** Message-IDs already announced, newest last (kept to stop a replay after a UIDVALIDITY change) */
  notified: string[]
  /** UID -> failed send attempts */
  retries: Record<string, number>
}

export interface BridgeState {
  version: 2
  accounts: Record<string, AccountState>
  lastDigestAt: string | null
  lastPoll: string
}

export const NOTIFIED_KEEP = 500

export function emptyAccount(): AccountState {
  return { uidValidity: null, lastUid: 0, pending: [], notified: [], retries: {} }
}

export function emptyState(): BridgeState {
  return { version: 2, accounts: {}, lastDigestAt: null, lastPoll: new Date().toISOString() }
}

export function normalizeState(raw: unknown): BridgeState {
  const state = emptyState()
  if (!raw || typeof raw !== 'object') return state
  const r = raw as Record<string, any>
  if (typeof r.lastPoll === 'string') state.lastPoll = r.lastPoll
  // Version 1: { lastUids: { account: uid } }
  if (r.lastUids && typeof r.lastUids === 'object') {
    for (const [acct, uid] of Object.entries(r.lastUids)) {
      if (typeof uid === 'number' && uid >= 0) state.accounts[acct] = { ...emptyAccount(), lastUid: uid }
    }
  }
  if (r.version === 2 && r.accounts && typeof r.accounts === 'object') {
    for (const [acct, a] of Object.entries<any>(r.accounts)) {
      state.accounts[acct] = {
        uidValidity: typeof a?.uidValidity === 'number' ? a.uidValidity : null,
        lastUid: typeof a?.lastUid === 'number' && a.lastUid >= 0 ? a.lastUid : 0,
        pending: Array.isArray(a?.pending) ? a.pending : [],
        notified: Array.isArray(a?.notified) ? a.notified.filter((x: unknown) => typeof x === 'string') : [],
        retries: a?.retries && typeof a.retries === 'object' ? a.retries : {},
      }
    }
    if (typeof r.lastDigestAt === 'string') state.lastDigestAt = r.lastDigestAt
  }
  return state
}

export function loadState(file: string): BridgeState {
  try {
    if (fs.existsSync(file)) return normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch (error) {
    console.error('Error loading state, starting fresh:', error)
  }
  return emptyState()
}

/** Write then rename, so a crash never leaves a half-written file. */
export function saveState(file: string, state: BridgeState): void {
  state.lastPoll = new Date().toISOString()
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`)
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, file)
}

export function rememberNotified(a: AccountState, messageId: string): void {
  if (!messageId) return
  a.notified.push(messageId)
  if (a.notified.length > NOTIFIED_KEEP) a.notified.splice(0, a.notified.length - NOTIFIED_KEEP)
}
