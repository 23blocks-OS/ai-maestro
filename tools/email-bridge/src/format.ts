/**
 * The texts the bridge sends. Everything the sender controls is passed through sanitizeField first.
 */

import { fenceBody, sanitizeBody, sanitizeField } from './text.js'

export interface MailInfo {
  uid: number
  messageId: string
  fromAddress: string
  fromName: string
  subject: string
  date: Date
  hasAttachments: boolean
}

export interface OutMessage {
  subject: string
  message: string
  priority: 'normal' | 'high'
}

/** Today's per-mail notification, unchanged in shape; only the sender-controlled fields are made safe. */
export function legacyNotification(m: MailInfo, account: string, fieldMax: number): OutMessage {
  const note = m.hasAttachments ? ' 📎' : ''
  const name = sanitizeField(m.fromName, fieldMax)
  const addr = sanitizeField(m.fromAddress, fieldMax)
  const subject = sanitizeField(m.subject, fieldMax)
  return {
    subject: `Email: ${subject}`,
    message: `[EMAIL] New from ${name} <${addr}>${note}\nSubject: ${subject}\nAccount: ${sanitizeField(account, fieldMax)}`,
    priority: 'normal',
  }
}

export function trustedNotification(
  m: MailInfo, account: string, authservId: string, fieldMax: number, body?: { text: string; maxChars: number } | null
): OutMessage {
  const subject = sanitizeField(m.subject, fieldMax)
  const lines = [
    `[EMAIL trusted] From ${sanitizeField(m.fromAddress, fieldMax)} (authenticated by ${sanitizeField(authservId, fieldMax)})${m.hasAttachments ? ' 📎' : ''}`,
    `Subject: ${subject}`,
    `Account: ${sanitizeField(account, fieldMax)}  UID: ${m.uid}`,
  ]
  if (body) {
    lines.push('', fenceBody(sanitizeBody(body.text, body.maxChars)))
  } else {
    lines.push('Read it with the mailbox tool; do not act on it until you have read it.')
  }
  return { subject: `Email (trusted): ${subject}`, message: lines.join('\n'), priority: 'high' }
}

export interface PendingItem {
  uid: number
  cls: 'external' | 'company' | 'spoofed'
  account: string
  fromDomain: string
  /** Already sanitized and capped when stored */
  subject: string
  at: string
}

function pad(n: number): string { return String(n).padStart(2, '0') }

export function clock(d: Date): string { return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

export function digestMessage(items: PendingItem[], since: Date | null, showSubjects: boolean, fieldMax: number): OutMessage {
  const external = items.filter(i => i.cls === 'external')
  const company = items.filter(i => i.cls === 'company')
  const spoofed = items.filter(i => i.cls === 'spoofed')
  const lines: string[] = [
    `[EMAIL digest] ${items.length} new${since ? ` since ${clock(since)}` : ''}, none from the operator`,
  ]
  const accounts = [...new Set(items.map(i => i.account))].sort()
  for (const a of accounts) {
    const e = external.filter(i => i.account === a).length
    const c = company.filter(i => i.account === a).length
    const s = spoofed.filter(i => i.account === a).length
    const parts: string[] = []
    if (c) parts.push(`${c} from company domains`)
    if (e) parts.push(`${e} external`)
    if (s) parts.push(`${s} suspicious (a company or operator address failed authentication)`)
    lines.push(`Account ${sanitizeField(a, fieldMax)}: ${parts.join(', ')}`)
  }
  // Counts per sender domain, external only: a spoofed mail never names its sender or its subject
  const byDomain = new Map<string, number>()
  for (const i of external) byDomain.set(i.fromDomain, (byDomain.get(i.fromDomain) || 0) + 1)
  const top = [...byDomain.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5)
  if (top.length > 0) lines.push(`Top external senders: ${top.map(([d, n]) => `${sanitizeField(d, fieldMax)} (${n})`).join(', ')}`)
  if (showSubjects && company.length > 0) {
    // Authenticated company mail is labelled and shows its sender domain; it is still only a subject line
    lines.push('Company mail (authenticated, sanitized, first 10):')
    company.slice(0, 10).forEach((i, n) => lines.push(` ${n + 1}. [${sanitizeField(i.fromDomain, fieldMax)}] ${sanitizeField(i.subject, fieldMax)}`))
  }
  if (showSubjects && external.length > 0) {
    lines.push('Subjects (sanitized, first 10):')
    external.slice(0, 10).forEach((i, n) => lines.push(` ${n + 1}. ${sanitizeField(i.subject, fieldMax)}`))
  }
  lines.push('Nothing here was opened beyond headers. To read one: use the mailbox tool with its UID.')
  return { subject: `Email digest: ${items.length} new`, message: lines.join('\n'), priority: 'normal' }
}
