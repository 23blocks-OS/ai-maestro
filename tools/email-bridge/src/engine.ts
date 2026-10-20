/**
 * One poll of one mailbox, and the digest. No network and no files in here: the mailbox, the
 * notifier and the clock are passed in, so every rule can be tested.
 */

import type { Config } from './config.js'
import { classify, parseHeaderBlock, type TrustClass } from './trust.js'
import { digestMessage, legacyNotification, trustedNotification, type MailInfo, type OutMessage, type PendingItem } from './format.js'
import { rememberNotified, type AccountState, type BridgeState } from './state.js'
import { htmlToText, sanitizeField } from './text.js'

export interface MailMessage extends MailInfo {
  size: number
  /** The raw header block, as fetched */
  rawHeader: string
}

export interface MailboxClient {
  open(): Promise<{ uidValidity: number; highestUid: number }>
  /** Messages with a UID above lastUid, headers only, in UID order */
  fetchSince(lastUid: number): Promise<MailMessage[]>
  uidState(uid: number): Promise<'present' | 'deleted' | 'gone'>
  /** The text of one message (never attachments); null when it cannot be had */
  fetchText(uid: number): Promise<string | null>
  close(): Promise<void>
}

export interface NotifyArgs {
  to: string
  out: OutMessage
  email?: { account: string; uid: number; messageId: string; from: string; fromName: string; subject: string; date: string; hasAttachments: boolean; trust?: TrustClass }
}

export type Notify = (args: NotifyArgs) => Promise<boolean>

export interface PollDeps {
  account: string
  client: MailboxClient
  st: AccountState
  cfg: Config
  notify: Notify
  now: () => Date
  log: (line: string) => void
  /** Save the state; called after every message so a crash never repeats or loses one */
  persist: () => void
}

export interface PollResult {
  firstRun: boolean
  uidValidityReset: boolean
  announced: number
  queued: number
  skipped: number
  stoppedOnFailure: boolean
}

function domainOf(addr: string): string {
  return addr.includes('@') ? addr.slice(addr.lastIndexOf('@') + 1).toLowerCase() : ''
}

export async function pollAccount(d: PollDeps): Promise<PollResult> {
  const { account, client, st, cfg, notify, log } = d
  const result: PollResult = { firstRun: false, uidValidityReset: false, announced: 0, queued: 0, skipped: 0, stoppedOnFailure: false }

  const info = await client.open()

  if (st.uidValidity === null && st.lastUid === 0) {
    // First run with no cursor: announce nothing that is already there
    st.uidValidity = info.uidValidity
    st.lastUid = info.highestUid
    result.firstRun = true
    log(`${account}: first run, cursor set to UID ${info.highestUid}, nothing announced`)
    d.persist()
    return result
  }
  if (st.uidValidity === null) {
    // A cursor from the old file: adopt the mailbox's UIDVALIDITY and carry on
    st.uidValidity = info.uidValidity
  } else if (st.uidValidity !== info.uidValidity) {
    log(`${account}: UIDVALIDITY CHANGED (${st.uidValidity} -> ${info.uidValidity}); the mailbox was rebuilt. Cursor moved to UID ${info.highestUid}, no replay`)
    st.uidValidity = info.uidValidity
    st.lastUid = info.highestUid
    st.retries = {}
    result.uidValidityReset = true
    d.persist()
    return result
  }

  const messages = (await client.fetchSince(st.lastUid)).filter(m => m.uid > st.lastUid).sort((a, b) => a.uid - b.uid)

  for (const msg of messages) {
    const complete = () => {
      st.lastUid = msg.uid
      delete st.retries[String(msg.uid)]
      d.persist()
    }

    if (msg.messageId && st.notified.includes(msg.messageId)) {
      log(`${account}: UID ${msg.uid} already announced (Message-ID seen), skipped`)
      result.skipped++
      complete()
      continue
    }

    const headers = parseHeaderBlock(msg.rawHeader)
    const cls = cfg.splitMode === 'off' ? null : classify(msg.fromAddress, headers, cfg)
    if (cls) {
      log(`${cfg.splitMode === 'shadow' ? '[SHADOW] ' : ''}${account}: UID ${msg.uid} class=${cls.cls} domain=${domainOf(msg.fromAddress) || '?'} authserv-ids=[${cls.seenIds.join(',')}] (${cls.reason})`)
    }

    const emailMeta = (trust?: TrustClass) => ({
      account, uid: msg.uid, messageId: msg.messageId, from: sanitizeField(msg.fromAddress, cfg.fieldMaxChars),
      fromName: sanitizeField(msg.fromName, cfg.fieldMaxChars), subject: sanitizeField(msg.subject, cfg.fieldMaxChars),
      date: msg.date.toISOString(), hasAttachments: msg.hasAttachments, ...(trust && { trust }),
    })

    let sent: boolean | null = null // null = nothing to send for this one

    if (cfg.splitMode !== 'on') {
      // off and shadow: today's behaviour, one notification per mail
      sent = await notify({ to: cfg.aimaestro.defaultRecipient, out: legacyNotification(msg, account, cfg.fieldMaxChars), email: emailMeta(cls?.cls) })
    } else if (cls!.cls === 'trusted') {
      // Re-check the mailbox right before waking someone: a mail already read or removed is not news
      const state = await client.uidState(msg.uid).catch(() => 'present' as const)
      if (state !== 'present') {
        log(`${account}: UID ${msg.uid} is ${state}, not announced`)
        result.skipped++
        complete()
        continue
      }
      let body: { text: string; maxChars: number } | null = null
      if (cfg.trustedIncludeBody && msg.size <= cfg.maxFetchBytes) {
        const text = await client.fetchText(msg.uid).catch(() => null)
        if (text) body = { text: /<\s*(html|body|div|p)\b/i.test(text) ? htmlToText(text) : text, maxChars: cfg.trustedBodyMaxChars }
      }
      sent = await notify({ to: cfg.aimaestro.defaultRecipient, out: trustedNotification(msg, account, cfg.authservId, cfg.fieldMaxChars, body), email: emailMeta('trusted') })
    } else {
      // external, company and spoofed wait for the digest. Nothing the sender wrote is kept for a spoofed mail.
      const item: PendingItem = {
        uid: msg.uid, cls: cls!.cls as 'external' | 'company' | 'spoofed', account,
        fromDomain: cls!.cls === 'spoofed' ? '' : domainOf(msg.fromAddress),
        subject: cls!.cls === 'spoofed' ? '' : sanitizeField(msg.subject, cfg.fieldMaxChars),
        at: d.now().toISOString(),
      }
      st.pending.push(item)
      result.queued++
      rememberNotified(st, msg.messageId)
      complete()
      continue
    }

    if (sent === true) {
      result.announced++
      rememberNotified(st, msg.messageId)
      complete()
      continue
    }

    // The send failed: keep the cursor below this mail and try again next poll, up to a limit
    const key = String(msg.uid)
    st.retries[key] = (st.retries[key] || 0) + 1
    if (st.retries[key] >= cfg.maxSendRetries) {
      log(`${account}: DEAD-LETTER UID ${msg.uid} after ${st.retries[key]} failed sends; moving on`)
      result.skipped++
      complete()
      continue
    }
    log(`${account}: send failed for UID ${msg.uid} (attempt ${st.retries[key]}/${cfg.maxSendRetries}); will retry next poll`)
    d.persist()
    result.stoppedOnFailure = true
    break
  }

  return result
}

// ── Digest ──────────────────────────────────────────────────────────────────

/** The most recent scheduled digest time that is not after `now` (yesterday's last one if none today). */
export function latestSlot(now: Date, times: string[]): Date {
  const at = (day: Date, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0)
  }
  const today = times.map(t => at(now, t)).filter(t => t.getTime() <= now.getTime())
  if (today.length > 0) return today[today.length - 1]
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return at(y, times[times.length - 1])
}

export interface DigestDeps {
  state: BridgeState
  cfg: Config
  notify: Notify
  now: () => Date
  log: (line: string) => void
  persist: () => void
}

/** Send the digest when its time has come or too much is waiting. Returns true when one was sent. */
export async function maybeSendDigest(d: DigestDeps): Promise<boolean> {
  const { state, cfg } = d
  if (cfg.splitMode !== 'on') return false
  const now = d.now()
  const items = Object.values(state.accounts).flatMap(a => a.pending)
  const slotDue = state.lastDigestAt === null || new Date(state.lastDigestAt).getTime() < latestSlot(now, cfg.digestTimes).getTime()
  const full = items.length >= cfg.digestMaxPending
  if (!slotDue && !full) return false
  if (items.length === 0) {
    // Nothing waiting: this slot is spent, so the next one is the next slot
    state.lastDigestAt = now.toISOString()
    d.persist()
    return false
  }
  const since = state.lastDigestAt ? new Date(state.lastDigestAt) : null
  const out = digestMessage(items, since, cfg.digestSubjects, cfg.fieldMaxChars)
  const ok = await d.notify({ to: cfg.aimaestro.digestRecipient, out })
  if (!ok) {
    d.log(`digest: send failed, ${items.length} item(s) kept for the next poll`)
    return false
  }
  for (const a of Object.values(state.accounts)) a.pending = []
  state.lastDigestAt = now.toISOString()
  d.persist()
  d.log(`digest: sent ${items.length} item(s) to ${cfg.aimaestro.digestRecipient}`)
  return true
}
