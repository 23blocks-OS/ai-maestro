/**
 * The real mailbox. Opened read-only and everything is fetched without setting \Seen:
 * headers for every new mail, the text of a message only when asked for.
 */

import Imap from 'imap'
import { simpleParser } from 'mailparser'
import type { MailboxClient, MailMessage } from './engine.js'
import { htmlToText } from './text.js'

export interface EmailAccount {
  email: string
  imapServer: string
  imapPort: number
  username: string
  password: string
}

type Struct = Array<unknown>

function hasAttachment(struct: Struct | undefined): boolean {
  if (!Array.isArray(struct)) return false
  for (const part of struct) {
    if (Array.isArray(part)) { if (hasAttachment(part as Struct)) return true; continue }
    const p = part as { disposition?: { type?: string } }
    if (p?.disposition?.type && String(p.disposition.type).toLowerCase() === 'attachment') return true
  }
  return false
}

export function makeImap(account: EmailAccount, insecureTls: boolean, timeoutMs = 30_000): Imap {
  return new Imap({
    user: account.username,
    password: account.password,
    host: account.imapServer,
    port: account.imapPort,
    tls: true,
    tlsOptions: { rejectUnauthorized: !insecureTls, servername: account.imapServer },
    connTimeout: timeoutMs,
    authTimeout: 15_000,
  })
}

export async function testConnection(account: EmailAccount, insecureTls: boolean): Promise<boolean> {
  return new Promise(resolve => {
    const imap = makeImap(account, insecureTls, 10_000)
    imap.once('ready', () => { imap.end(); resolve(true) })
    imap.once('error', () => resolve(false))
    imap.connect()
  })
}

export class ImapMailbox implements MailboxClient {
  private imap: Imap | null = null

  constructor(private account: EmailAccount, private insecureTls: boolean) {}

  open(): Promise<{ uidValidity: number; highestUid: number }> {
    return new Promise((resolve, reject) => {
      const imap = makeImap(this.account, this.insecureTls)
      this.imap = imap
      imap.once('error', (e: Error) => reject(e))
      imap.once('ready', () => {
        // true = read-only (EXAMINE): nothing we do can set \Seen
        imap.openBox('INBOX', true, (err, box) => {
          if (err) return reject(err)
          resolve({ uidValidity: box.uidvalidity, highestUid: Math.max(0, (box.uidnext || 1) - 1) })
        })
      })
      imap.connect()
    })
  }

  private search(criteria: unknown[]): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.imap!.search(criteria as never, (err, uids) => (err ? reject(err) : resolve(uids || [])))
    })
  }

  async fetchSince(lastUid: number): Promise<MailMessage[]> {
    // The range "n:*" always includes the newest message even when it is below n: filter afterwards
    const uids = (await this.search([['UID', `${lastUid + 1}:*`]])).filter(u => u > lastUid)
    if (uids.length === 0) return []
    return new Promise((resolve, reject) => {
      const out: MailMessage[] = []
      const pending: Promise<void>[] = []
      const f = this.imap!.fetch(uids, { bodies: 'HEADER', struct: true })
      f.on('message', msg => {
        let header = ''
        let uid = 0
        let size = 0
        let struct: Struct | undefined
        msg.on('body', stream => { stream.on('data', (c: Buffer) => { header += c.toString('utf8') }) })
        msg.once('attributes', (attrs: { uid: number; size?: number; struct?: Struct }) => { uid = attrs.uid; size = attrs.size || 0; struct = attrs.struct })
        msg.once('end', () => {
          pending.push((async () => {
            const parsed = await simpleParser(header + '\r\n')
            const from = parsed.from?.value?.[0]
            out.push({
              uid, size, rawHeader: header,
              messageId: parsed.messageId || `uid-${uid}`,
              fromAddress: (from?.address || '').toLowerCase(),
              fromName: from?.name || from?.address || 'Unknown',
              subject: parsed.subject || '(no subject)',
              date: parsed.date || new Date(),
              hasAttachments: hasAttachment(struct),
            })
          })().catch(() => { /* an unparseable header: skipped, the cursor still moves past it next poll */ }))
        })
      })
      f.once('error', reject)
      f.once('end', () => { Promise.all(pending).then(() => resolve(out.sort((a, b) => a.uid - b.uid))).catch(reject) })
    })
  }

  uidState(uid: number): Promise<'present' | 'deleted' | 'gone'> {
    return new Promise((resolve, reject) => {
      let state: 'present' | 'deleted' | 'gone' = 'gone'
      const f = this.imap!.fetch([uid], {})
      f.on('message', msg => {
        msg.once('attributes', (attrs: { flags?: string[] }) => { state = (attrs.flags || []).includes('\\Deleted') ? 'deleted' : 'present' })
      })
      f.once('error', reject)
      f.once('end', () => resolve(state))
    })
  }

  fetchText(uid: number): Promise<string | null> {
    return new Promise((resolve, reject) => {
      let raw = ''
      const f = this.imap!.fetch([uid], { bodies: '' })
      f.on('message', msg => { msg.on('body', stream => { stream.on('data', (c: Buffer) => { raw += c.toString('utf8') }) }) })
      f.once('error', reject)
      f.once('end', () => {
        simpleParser(raw).then(p => resolve(p.text || (p.html ? htmlToText(String(p.html)) : null))).catch(() => resolve(null))
      })
    })
  }

  close(): Promise<void> {
    return new Promise(resolve => {
      const imap = this.imap
      this.imap = null
      if (!imap) return resolve()
      imap.once('close', () => resolve())
      try { imap.end() } catch { resolve() }
      setTimeout(resolve, 2000)
    })
  }
}
