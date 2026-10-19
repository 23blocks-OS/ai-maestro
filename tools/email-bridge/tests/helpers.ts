import type { Config } from '../src/config.js'
import { loadConfig } from '../src/config.js'
import type { MailboxClient, MailMessage, NotifyArgs } from '../src/engine.js'
import { emptyAccount, emptyState, type AccountState, type BridgeState } from '../src/state.js'

export const AUTHSERV = 'mx.example.com'

/** A raw header block the way the mailbox returns it */
export function header(opts: { from?: string; ar?: string[]; extra?: string[] }): string {
  const lines = [...(opts.ar || []).map(v => `Authentication-Results: ${v}`), `From: ${opts.from || 'x@example.org'}`, 'Subject: hi', ...(opts.extra || [])]
  return lines.join('\r\n') + '\r\n\r\n'
}

export const AR_PASS = `${AUTHSERV}; dmarc=pass (p=none) header.from=acme.com; dkim=pass header.d=acme.com; spf=pass smtp.mailfrom=bounce@acme.com`
export const AR_FAIL = `${AUTHSERV}; dmarc=fail header.from=acme.com; dkim=fail header.d=acme.com; spf=fail smtp.mailfrom=bounce@acme.com`

export function cfg(env: Record<string, string> = {}): Config {
  return loadConfig({ WATCHED_ACCOUNTS: 'box@example.com', SPLIT_MODE: 'on', AUTHSERV_ID: AUTHSERV, TRUSTED_SENDERS: 'boss@acme.com,@acme.com', ...env })
}

let nextUid = 100
export function mail(over: Partial<MailMessage> & { ar?: string[]; from?: string } = {}): MailMessage {
  const uid = over.uid ?? ++nextUid
  const from = over.fromAddress ?? over.from ?? 'boss@acme.com'
  return {
    uid, messageId: over.messageId ?? `<m${uid}@x>`, fromAddress: from, fromName: over.fromName ?? 'Some One',
    subject: over.subject ?? `Subject ${uid}`, date: over.date ?? new Date('2026-10-19T10:00:00Z'),
    hasAttachments: over.hasAttachments ?? false, size: over.size ?? 1000,
    rawHeader: over.rawHeader ?? header({ from, ar: over.ar ?? [AR_PASS] }),
  }
}

export class FakeClient implements MailboxClient {
  opens = 0
  closed = 0
  textFetches: number[] = []
  headerFetches: number[] = []
  constructor(public uidValidity: number, public messages: MailMessage[], public states: Record<number, 'present' | 'deleted' | 'gone'> = {}, public text: string | null = 'Body text') {}
  async open() { this.opens++; return { uidValidity: this.uidValidity, highestUid: Math.max(0, ...this.messages.map(m => m.uid)) } }
  async fetchSince(last: number) { this.headerFetches.push(last); return this.messages.filter(m => m.uid > last) }
  async uidState(uid: number) { return this.states[uid] ?? 'present' }
  async fetchText(uid: number) { this.textFetches.push(uid); return this.text }
  async close() { this.closed++ }
}

export class Sink {
  sent: NotifyArgs[] = []
  /** Number of upcoming sends to fail */
  failNext = 0
  failFor: Set<number> = new Set()
  notify = async (a: NotifyArgs): Promise<boolean> => {
    if (this.failNext > 0) { this.failNext--; return false }
    if (a.email && this.failFor.has(a.email.uid)) return false
    this.sent.push(a)
    return true
  }
}

export function freshAccount(over: Partial<AccountState> = {}): AccountState { return { ...emptyAccount(), ...over } }
export function freshState(over: Partial<BridgeState> = {}): BridgeState { return { ...emptyState(), ...over } }
export const noLog = () => {}
