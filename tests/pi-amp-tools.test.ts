/**
 * F036: the Pi extension's logic (scripts/pi/ai-maestro-amp/core.mjs): argument validation, the argv it
 * builds, and how it runs the AMP scripts, with a fake execFile. No Pi and no AMP script is involved.
 */
import { describe, it, expect } from 'vitest'
import * as coreModule from '../scripts/pi/ai-maestro-amp/core.mjs'
// The module is plain JavaScript; the tests pass fakes, so they use it untyped.
const { buildCall, runTool, resolveScript, capOutput, MAX_TEXT, MAX_OUTPUT, TOOL_DEFS } = coreModule as any
import fs from 'fs'
import os from 'os'
import path from 'path'

describe('buildCall: validation', () => {
  it.each(['abc', 'a'.repeat(65), '-abcd', '../etc', 'msg 1234', 'msg;ls', 'msg$(x)', '', 5, null, undefined])(
    'rejects the message id %j', (id) => {
      expect(() => buildCall('amp_read', { id })).toThrow(/message id/)
      expect(() => buildCall('amp_reply', { id, text: 'hi' })).toThrow(/message id/)
    })
  it.each(['msg_1234567890_abc', 'a1b2', '1234', 'a'.repeat(64)])('accepts the message id %s', (id) => {
    expect(buildCall('amp_read', { id }).args).toEqual([id])
  })

  it('needs text for a reply and caps its length', () => {
    expect(() => buildCall('amp_reply', { id: 'abcd1', text: '' })).toThrow(/text is required/)
    expect(() => buildCall('amp_reply', { id: 'abcd1', text: '   ' })).toThrow(/text is required/)
    expect(() => buildCall('amp_reply', { id: 'abcd1' })).toThrow(/text is required/)
    expect(() => buildCall('amp_reply', { id: 'abcd1', text: 'x'.repeat(MAX_TEXT + 1) })).toThrow(/too long/)
    expect(buildCall('amp_reply', { id: 'abcd1', text: 'x'.repeat(MAX_TEXT) }).input).toHaveLength(MAX_TEXT)
    expect(() => buildCall('amp_reply', { id: 'abcd1', text: 'a\u0000b' })).toThrow(/control/)
  })

  it('checks recipient and subject for a send', () => {
    for (const to of ['-x', 'a b', 'a;b', '', 'a$(b)', 5]) {
      expect(() => buildCall('amp_send', { to, subject: 's', text: 't' }), String(to)).toThrow(/to must be/)
    }
    expect(() => buildCall('amp_send', { to: 'bob', subject: '-p high', text: 't' })).toThrow(/must not start/)
    expect(() => buildCall('amp_send', { to: 'bob', subject: 'a\nb', text: 't' })).toThrow(/one line/)
    expect(() => buildCall('amp_send', { to: 'bob', subject: 's'.repeat(201), text: 't' })).toThrow(/too long/)
    expect(() => buildCall('amp_send', { to: 'bob', subject: 's', text: '' })).toThrow(/text is required/)
  })

  it('rejects an unknown tool', () => {
    expect(() => buildCall('bash', {})).toThrow(/unknown tool/)
  })
})

describe('buildCall: argv', () => {
  it('builds the script name, argv and stdin for each tool', () => {
    expect(buildCall('amp_inbox', {})).toEqual({ script: 'amp-inbox.sh', args: [], input: undefined })
    expect(buildCall('amp_inbox', { all: true }).args).toEqual(['--all'])
    expect(buildCall('amp_inbox', { all: 'yes' }).args).toEqual([])
    expect(buildCall('amp_read', { id: 'abcd1' })).toEqual({ script: 'amp-read.sh', args: ['abcd1'], input: undefined })
    expect(buildCall('amp_reply', { id: 'abcd1', text: 'ok' })).toEqual({ script: 'amp-reply.sh', args: ['abcd1', '--body-stdin'], input: 'ok' })
    expect(buildCall('amp_send', { to: 'bob@host.example', subject: 'Hi', text: 'body' }))
      .toEqual({ script: 'amp-send.sh', args: ['bob@host.example', 'Hi', '--body-stdin'], input: 'body' })
  })

  it('never puts reply text on the command line, so a leading dash or a quote is just text', () => {
    const evil = `--priority urgent "; rm -rf / #\n$(id)`
    const c = buildCall('amp_reply', { id: 'abcd1', text: evil })
    expect(c.args).toEqual(['abcd1', '--body-stdin'])
    expect(c.input).toBe(evil)
  })

  it('has one definition per tool, with the four names the Pi profile allows', () => {
    expect(TOOL_DEFS.map((d: { name: string }) => d.name)).toEqual(['amp_inbox', 'amp_read', 'amp_reply', 'amp_send'])
  })
})

type Cb = (err: any, out: string, errOut: string) => void
function fakeExec(result: { err?: any; out?: string; errOut?: string }) {
  const calls: any[] = []
  const stdinWrites: string[] = []
  const exec = (file: string, args: string[], opts: any, cb: Cb) => {
    calls.push({ file, args, opts })
    setImmediate(() => cb(result.err ?? null, result.out ?? '', result.errOut ?? ''))
    return { stdin: { on() {}, end: (s: string) => { stdinWrites.push(s) } } }
  }
  return { exec, calls, stdinWrites }
}

describe('runTool', () => {
  it('runs the resolved script with argv, cwd, timeout and the text on stdin (no shell)', async () => {
    const f = fakeExec({ out: 'sent' })
    const r = await runTool('amp_reply', { id: 'abcd1', text: 'hello' }, { cwd: '/work/agent', exec: f.exec, resolve: (n: string) => `/bin/${n}`, env: {} })
    expect(r).toEqual({ ok: true, text: 'sent' })
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].file).toBe('/bin/amp-reply.sh')
    expect(f.calls[0].args).toEqual(['abcd1', '--body-stdin'])
    expect(f.calls[0].opts.cwd).toBe('/work/agent')
    expect(f.calls[0].opts.timeout).toBeGreaterThan(0)
    expect(f.calls[0].opts.shell).toBeUndefined()
    expect(f.stdinWrites).toEqual(['hello'])
  })

  it('does not run anything for bad arguments', () => {
    const f = fakeExec({})
    expect(() => runTool('amp_read', { id: 'x' }, { exec: f.exec, resolve: () => '/bin/x' })).toThrow()
    expect(f.calls).toHaveLength(0)
  })

  it('reports a missing script plainly', async () => {
    const f = fakeExec({})
    const r = await runTool('amp_inbox', {}, { exec: f.exec, resolve: () => null })
    expect(r.ok).toBe(false)
    expect(r.text).toMatch(/amp-inbox\.sh was not found/)
    expect(f.calls).toHaveLength(0)
  })

  it('turns a failing script into a failed result that keeps its output', async () => {
    const f = fakeExec({ err: Object.assign(new Error('x'), { code: 1 }), out: 'Error: unknown message' })
    const r = await runTool('amp_read', { id: 'abcd1' }, { exec: f.exec, resolve: () => '/bin/x' })
    expect(r.ok).toBe(false)
    expect(r.text).toContain('Error: unknown message')
    expect(r.text).toContain('exit 1')
  })

  it('says so on a timeout', async () => {
    const f = fakeExec({ err: Object.assign(new Error('t'), { killed: true }) })
    const r = await runTool('amp_inbox', {}, { exec: f.exec, resolve: () => '/bin/x', timeout: 5000 })
    expect(r).toEqual({ ok: false, text: 'amp-inbox.sh failed (timed out after 5s)' })
  })

  it('caps long output', async () => {
    const f = fakeExec({ out: 'a'.repeat(MAX_OUTPUT + 500) })
    const r = await runTool('amp_inbox', {}, { exec: f.exec, resolve: () => '/bin/x' })
    expect(r.ok).toBe(true)
    expect(r.text.length).toBeLessThan(MAX_OUTPUT + 100)
    expect(r.text).toMatch(/output cut at/)
    expect(capOutput('short')).toBe('short')
  })
})

describe('runTool with the real execFile and a stand-in script', () => {
  it('passes argv and stdin through unchanged and runs in the given cwd', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-amp-real-'))
    const bin = path.join(root, 'bin'); const work = path.join(root, 'work')
    fs.mkdirSync(bin); fs.mkdirSync(work)
    fs.writeFileSync(path.join(bin, 'amp-reply.sh'), '#!/bin/sh\necho "args=$# first=$1 second=$2 cwd=$(pwd)"\ncat\n', { mode: 0o755 })
    const text = '--priority "x"; $(id)'
    const r = await runTool('amp_reply', { id: 'abcd1', text }, { cwd: work, env: { PATH: `${bin}:/usr/bin:/bin` } })
    expect(r.ok).toBe(true)
    expect(r.text).toContain('args=2 first=abcd1 second=--body-stdin')
    expect(r.text).toContain(fs.realpathSync(work))
    expect(r.text).toContain(text)
    fs.rmSync(root, { recursive: true, force: true })
  })
})

describe('resolveScript', () => {
  it('finds a script on PATH, then in ~/.local/bin, and ignores non-executable files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-amp-'))
    const onPath = path.join(root, 'bin'); const home = path.join(root, 'home')
    fs.mkdirSync(onPath); fs.mkdirSync(path.join(home, '.local', 'bin'), { recursive: true })
    fs.writeFileSync(path.join(onPath, 'amp-read.sh'), '#!/bin/sh\n', { mode: 0o755 })
    fs.writeFileSync(path.join(home, '.local', 'bin', 'amp-send.sh'), '#!/bin/sh\n', { mode: 0o755 })
    fs.writeFileSync(path.join(home, '.local', 'bin', 'amp-inbox.sh'), 'x', { mode: 0o644 })
    const env = { PATH: onPath }
    expect(resolveScript('amp-read.sh', env, home)).toBe(path.join(onPath, 'amp-read.sh'))
    expect(resolveScript('amp-send.sh', env, home)).toBe(path.join(home, '.local', 'bin', 'amp-send.sh'))
    expect(resolveScript('amp-inbox.sh', env, home)).toBeNull()
    expect(resolveScript('amp-reply.sh', env, home)).toBeNull()
    fs.rmSync(root, { recursive: true, force: true })
  })
})
