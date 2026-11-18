/**
 * The hook must answer inside Claude Code's 5 s hook timeout even when AI Maestro accepts the
 * connection and never answers (a busy server: 56 agents, memory indexing). Runs the
 * real hook as a process, as Claude Code does.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'child_process'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'

const HOOK = path.resolve(__dirname, '../scripts/claude-hooks/ai-maestro-hook.cjs')

let server: http.Server
let home: string
let url: string
const cwd = '/work/acme'

beforeAll(async () => {
  server = http.createServer(() => { /* never answers */ })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-budget-'))
  fs.mkdirSync(path.join(home, '.aimaestro', 'agents'), { recursive: true })
  fs.writeFileSync(path.join(home, '.aimaestro', 'agents', 'registry.json'),
    JSON.stringify({ agents: [{ id: 'a1', name: 'acme', workingDirectory: cwd }] }))
  // A standalone inbox check that is slow and leaves a mark if it runs
  const bin = path.join(home, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'amp-inbox.sh'), `#!/bin/sh\ntouch "${home}/standalone-ran"\nsleep 3\necho 1\n`, { mode: 0o755 })
})

afterAll(() => {
  server.closeAllConnections()
  server.close()
  fs.rmSync(home, { recursive: true, force: true })
})

function runHook(payload: Record<string, unknown>): Promise<{ ms: number; code: number | null; out: string }> {
  const start = Date.now()
  const child = spawn(process.execPath, [HOOK], {
    env: { HOME: home, PATH: path.join(home, 'bin') + ':/bin:/usr/bin', AIM_SERVER_URL: url },
  })
  let out = ''
  child.stdout.on('data', d => { out += d })
  child.stdin.end(JSON.stringify({ session_id: 's1', cwd, ...payload }))
  return new Promise(resolve => child.on('exit', code => resolve({ ms: Date.now() - start, code, out })))
}

describe('ai-maestro-hook · time budget against a server that never answers', () => {
  it('every blocking event exits cleanly well inside 5 s', async () => {
    const results = await Promise.all([
      runHook({ hook_event_name: 'UserPromptSubmit', prompt: 'deploy the docs' }),
      runHook({ hook_event_name: 'Stop' }),
      runHook({ hook_event_name: 'SessionStart', source: 'startup' }),
      runHook({ hook_event_name: 'Notification', notification_type: 'idle_prompt' }),
    ])
    for (const r of results) {
      expect(r.code).toBe(0)
      expect(r.ms).toBeLessThan(4300)
      expect(() => JSON.parse(r.out)).not.toThrow()
    }
    // A timed-out inbox check means the server is up: no 3 s standalone fallback on top
    expect(fs.existsSync(path.join(home, 'standalone-ran'))).toBe(false)
  }, 20000)
})
