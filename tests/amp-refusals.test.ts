/** B006: every AMP message this host refuses leaves a readable record, and the Doctor shows the last day's. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { recordAmpRefusal, readAmpRefusals } from '@/lib/amp-refusals'
import { checkAmpRefusals } from '@/services/doctor-checks'

let dir: string, file: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refusals-')); file = path.join(dir, 'logs', 'amp-refusals.jsonl') })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('recordAmpRefusal', () => {
  it('appends one line per refusal and reads them back', () => {
    recordAmpRefusal({ endpoint: 'route', status: 403, reason: 'invalid_signature', from: '3m-hr@x.aimaestro.local', to: 'pas-lola@x.aimaestro.local', via: 'mac-mini', fingerprint: 'SHA256:abcdefghijklmnopqrstuvwxyz0123' }, file)
    recordAmpRefusal({ endpoint: 'federation', status: 401, reason: 'unauthorized' }, file)
    const all = readAmpRefusals(0, file)
    expect(all.map(r => r.reason)).toEqual(['invalid_signature', 'unauthorized'])
    expect(all[0]).toMatchObject({ endpoint: 'route', status: 403, via: 'mac-mini', fingerprint: 'SHA256:abcdefghijklmnopq' })
  })

  it('never throws when the file cannot be written', () => {
    fs.writeFileSync(path.join(dir, 'logs'), 'not a folder')
    expect(() => recordAmpRefusal({ endpoint: 'route', status: 403, reason: 'x' }, file)).not.toThrow()
  })

  it('skips torn lines and older refusals', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{"at":"2026-01-01T00:00:00Z","reason":"old"}\n{broken\n')
    recordAmpRefusal({ endpoint: 'route', status: 403, reason: 'new' }, file)
    expect(readAmpRefusals(Date.parse('2026-06-01'), file).map(r => r.reason)).toEqual(['new'])
  })
})

describe('Doctor amp-refusals', () => {
  it('passes with none, and warns with one item per reason and sender', () => {
    expect(checkAmpRefusals(Date.now(), file).status).toBe('pass')
    for (let i = 0; i < 3; i++) recordAmpRefusal({ endpoint: 'route', status: 403, reason: 'invalid_signature', from: '3m-hr@x', via: 'mac-mini' }, file)
    recordAmpRefusal({ endpoint: 'route', status: 403, reason: 'key_revoked', from: 'old@x' }, file)
    const r = checkAmpRefusals(Date.now(), file)
    expect(r.status).toBe('warn')
    expect(r.message).toBe('4 AMP message(s) refused in the last 24 hours')
    expect(r.items!.map(i => i.key)).toEqual(['refusal:invalid_signature:3m-hr@x', 'refusal:key_revoked:old@x'])
    expect(r.items![0].message).toMatch(/^3 message\(s\) from 3m-hr@x refused: invalid_signature \(via mac-mini\)/)
  })
})
