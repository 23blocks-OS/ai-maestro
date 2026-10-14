import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { clean, fingerprint, fingerprintHolds, toView, REQUEST_ID_RE, type SqlWriteRequest } from '@/lib/sql-write-requests'

// These two files were produced by running the real wrapper (safe-psql-write propose, agentic-sql 1.3.0) against a
// throwaway Postgres 16. If the wrapper changes the request shape or the fingerprint rule, these tests fail and
// lib/sql-write-requests.ts must follow.
const load = (n: string): SqlWriteRequest => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8'))
const plain = load('sql-write-request.json')
const unicode = load('sql-write-request-unicode.json')

describe('the request shape the wrapper writes', () => {
  it('has every field the card and the approve step read', () => {
    for (const k of ['id', 'created', 'expires', 'status', 'environment', 'env_var', 'table', 'kind', 'columns', 'sql', 'params', 'param_names',
      'rows', 'diff', 'diff_truncated', 'has_pk', 'reason', 'agent', 'ttl', 'max_rows', 'fingerprint']) {
      expect(plain, k).toHaveProperty(k)
    }
    expect(plain.id).toMatch(REQUEST_ID_RE)
    expect(plain.status).toBe('pending')
    expect(typeof plain.expires).toBe('number')
    expect(plain.diff![0]).toEqual({ key: [1], changes: { plan: ['free', 'pro'] } })
  })
})

describe('the fingerprint rule', () => {
  it('matches the wrapper for a plain request', () => {
    expect(fingerprint(plain)).toBe(plain.fingerprint)
    expect(fingerprintHolds(plain)).toBe(true)
  })

  it('matches the wrapper for quotes, a backslash, accents and an emoji (Python ensure_ascii escaping)', () => {
    expect(JSON.stringify(unicode.params)).toContain('😀')
    expect(fingerprint(unicode)).toBe(unicode.fingerprint)
  })

  it.each([
    ['sql', (r: any) => { r.sql += ' OR 1=1' }],
    ['a value', (r: any) => { r.params.plan = 'enterprise' }],
    ['the row count', (r: any) => { r.rows = 2 }],
    ['the environment', (r: any) => { r.environment = 'production' }],
    ['the table', (r: any) => { r.table = 'public.users' }],
  ])('fails when %s is changed', (_n, mutate) => {
    const r = structuredClone(plain)
    mutate(r)
    expect(fingerprintHolds(r)).toBe(false)
  })

  it('counts a request it cannot fingerprint as changed', () => {
    const r: any = structuredClone(plain)
    r.params = { plan: { nested: 1 } }
    expect(fingerprintHolds(r)).toBe(false)
  })
})

describe('what the card is shown', () => {
  it('carries what the wrapper approve screen shows', () => {
    const v = toView(plain)
    expect(v).toMatchObject({ id: plain.id, agent: 'fixture-agent', kind: 'UPDATE', table: 'public.customers', environment: 'staging', rows: 1, maxRows: 25, changed: false, hasPk: true })
    expect(v.sql).toBe('UPDATE customers SET plan = %(plan)s WHERE email = %(email)s')
    expect(v.diff).toEqual([{ type: 'update', key: '[1]', text: 'plan: "free" -> "pro"' }])
    expect(v.values).toBe('{"plan":"pro","email":"ana@example.test"}')
    expect(v.expiresAt).toBe(plain.expires * 1000)
  })

  it('flags a changed request', () => {
    const r = structuredClone(plain)
    r.sql = 'UPDATE customers SET plan = 1'
    expect(toView(r).changed).toBe(true)
  })

  it('sanitises like the wrapper: control and escape characters become ?, length is bounded', () => {
    expect(clean('a\u001b[31mb\nc')).toBe('a?[31mb?c')
    expect(clean('x'.repeat(400), 300)).toBe('x'.repeat(300) + '...')
    const r = structuredClone(plain)
    r.diff = [{ key: [1], deleted: { name: 'x\u001b[2Jy' } }]
    expect(toView(r).diff[0].text).not.toContain('\u001b')
  })

  it('does not show values for a finished request (the wrapper scrubs them)', () => {
    const r = structuredClone(plain)
    r.params = null
    r.diff = null
    const v = toView(r)
    expect(v.values).toBe('{}')
    expect(v.diff).toEqual([])
  })
})
