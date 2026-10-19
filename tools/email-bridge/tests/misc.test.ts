import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadConfig, parseDigestTimes } from '../src/config.js'
import { normalizeState, loadState, saveState, rememberNotified, NOTIFIED_KEEP, emptyAccount } from '../src/state.js'
import { buildPayload, makeNotify } from '../src/amp.js'
import { cfg } from './helpers.js'

describe('config', () => {
  const base = { WATCHED_ACCOUNTS: 'a@b.com' }
  it('defaults to off, today\'s 15 minutes, three digests a day', () => {
    const c = loadConfig(base)
    expect(c.splitMode).toBe('off')
    expect(c.pollIntervalMs).toBe(900_000)
    expect(c.digestTimes).toEqual(['08:00', '13:00', '18:00'])
    expect(c.imapInsecureTls).toBe(false)
    expect(c.aimaestro.defaultRecipient).toBe('pas-lola')
    expect(c.aimaestro.digestRecipient).toBe('pas-lola')
  })
  it('SPLIT_MODE=on polls every two minutes unless POLL_INTERVAL_MS says otherwise', () => {
    expect(loadConfig({ ...base, SPLIT_MODE: 'on' }).pollIntervalMs).toBe(120_000)
    expect(loadConfig({ ...base, SPLIT_MODE: 'on', POLL_INTERVAL_MS: '60000' }).pollIntervalMs).toBe(60_000)
  })
  it('refuses nonsense instead of guessing', () => {
    expect(() => loadConfig({ ...base, SPLIT_MODE: 'maybe' })).toThrow('SPLIT_MODE')
    expect(() => loadConfig({ ...base, POLL_INTERVAL_MS: 'soon' })).toThrow('POLL_INTERVAL_MS')
    expect(() => loadConfig({ ...base, DIGEST_MAX_PENDING: '0' })).toThrow('DIGEST_MAX_PENDING')
    expect(() => loadConfig({ ...base, DIGEST_SUBJECTS: 'sometimes' })).toThrow('DIGEST_SUBJECTS')
    expect(() => parseDigestTimes(['8:00'])).toThrow('HH:MM')
    expect(() => parseDigestTimes(['25:00'])).toThrow('HH:MM')
  })
  it('lists are trimmed and the allowlist is lower-cased', () => {
    const c = loadConfig({ ...base, TRUSTED_SENDERS: ' Boss@Acme.com , @Acme.COM ,', AUTHSERV_ID: ' MX.Example.com ', DIGEST_TIMES: '18:00, 08:00' })
    expect(c.trustedSenders).toEqual(['boss@acme.com', '@acme.com'])
    expect(c.authservId).toBe('mx.example.com')
    expect(c.digestTimes).toEqual(['08:00', '18:00'])
  })
})

describe('state', () => {
  it('reads today\'s state file and keeps the cursor', () => {
    const s = normalizeState({ lastUids: { 'lola@3metas.com': 104 }, lastPoll: '2026-10-19T21:19:47.079Z' })
    expect(s.version).toBe(2)
    expect(s.accounts['lola@3metas.com']).toMatchObject({ lastUid: 104, uidValidity: null, pending: [], notified: [] })
  })
  it('garbage becomes an empty state, not a crash', () => {
    for (const junk of [null, undefined, 'x', 5, [], { lastUids: { a: 'nope' } }]) expect(normalizeState(junk).accounts).toEqual({})
  })
  it('round-trips through a file, written atomically', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-'))
    const file = path.join(dir, 'state.json')
    const s = normalizeState({ lastUids: { a: 1 } })
    s.accounts.a.pending.push({ uid: 5, cls: 'external', account: 'a', fromDomain: 'x.com', subject: 'S', at: 'now' })
    saveState(file, s)
    expect(fs.readdirSync(dir)).toEqual(['state.json'])
    expect(loadState(file).accounts.a.pending).toHaveLength(1)
    fs.writeFileSync(file, '{ broken')
    expect(loadState(file).accounts).toEqual({})
  })
  it('remembers the last 500 announced Message-IDs', () => {
    const a = emptyAccount()
    for (let i = 0; i < NOTIFIED_KEEP + 25; i++) rememberNotified(a, `<${i}@x>`)
    expect(a.notified).toHaveLength(NOTIFIED_KEEP)
    expect(a.notified[0]).toBe('<25@x>')
    rememberNotified(a, '')
    expect(a.notified).toHaveLength(NOTIFIED_KEEP)
  })
})

describe('the AI Maestro call', () => {
  const out = { subject: 'Email (trusted): hi', message: 'text', priority: 'high' as const }
  it('keeps the shape of the old payload (a notification to the recipient on this host)', () => {
    const p = buildPayload(cfg({ HOST_ID: 'mini-lola' }), { to: 'pas-lola', out, email: { account: 'a', uid: 1, messageId: 'm', from: 'f', fromName: 'n', subject: 's', date: 'd', hasAttachments: false, trust: 'trusted' } })
    expect(p).toMatchObject({ from: 'email-bot', fromHost: 'mini-lola', to: 'pas-lola', toHost: 'mini-lola', subject: 'Email (trusted): hi', priority: 'high' })
    expect(p.content).toMatchObject({ type: 'notification', message: 'text', email: { uid: 1, trust: 'trusted' } })
  })
  it('a 500 or a network error is a failed send, never a thrown error', async () => {
    const bad = makeNotify(cfg(), () => {}, (async () => new Response('x', { status: 500 })) as typeof fetch)
    expect(await bad({ to: 'p', out })).toBe(false)
    const down = makeNotify(cfg(), () => {}, (async () => { throw new Error('ECONNREFUSED') }) as typeof fetch)
    expect(await down({ to: 'p', out })).toBe(false)
    const ok = makeNotify(cfg(), () => {}, (async () => new Response('{}', { status: 200 })) as typeof fetch)
    expect(await ok({ to: 'p', out })).toBe(true)
  })
  it('DRY_RUN sends nothing and says so, without the subject', async () => {
    let called = false
    const lines: string[] = []
    const n = makeNotify(cfg({ DRY_RUN: 'true' }), l => lines.push(l), (async () => { called = true; return new Response('{}') }) as typeof fetch)
    expect(await n({ to: 'p', out, email: { account: 'a', uid: 7, messageId: 'm', from: 'f', fromName: 'n', subject: 'SECRET SUBJECT', date: 'd', hasAttachments: false } })).toBe(true)
    expect(called).toBe(false)
    expect(lines[0]).toContain('nothing sent')
    expect(lines.join('')).not.toContain('SECRET SUBJECT')
  })
})

describe('safety (spec test 29)', () => {
  it('29 nothing in the bridge runs a child process or a shell', () => {
    const dir = path.join(__dirname, '../src')
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.ts'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/child_process|(?<![.\w])exec(Sync|File|FileSync)?\(|\bspawn(Sync)?\(|\beval\(|new Function\(/)
    }
  })
  it('the mailbox is opened read-only', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/imap-client.ts'), 'utf8')
    expect(src).toMatch(/openBox\('INBOX', true,/)
  })
  it('the mail server certificate is checked unless someone turns that off on purpose', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/imap-client.ts'), 'utf8')
    expect(src).toContain('rejectUnauthorized: !insecureTls')
    expect(src).not.toMatch(/rejectUnauthorized:\s*false/)
  })
})
