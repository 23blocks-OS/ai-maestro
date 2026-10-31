import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// /companion-ws used to start `claude --permission-mode bypassPermissions` in the agent's folder on every
// connection and send the person's words to that copy instead of the agent (2026-10-30)
describe('the companion socket talks to the agent itself', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.mjs'), 'utf8')

  it('server.mjs never launches a Claude with permissions bypassed', () => {
    expect(server).not.toMatch(/['"]bypassPermissions['"]/)
  })

  it('no call-session fork is created or written to', () => {
    expect(server).not.toMatch(/computeCallSessionName|sendToCallSession|callSessions\./)
  })
})
