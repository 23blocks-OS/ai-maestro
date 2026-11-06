import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// #792: 1011 means "try again", so the app reconnected once a second to an agent with no tmux session.
describe('/term with no tmux session', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.mjs'), 'utf-8')

  it('closes with the final code, not a retryable one', () => {
    expect(server).toContain("ws.close(4004, 'no_tmux_session')")
    expect(server).not.toContain('ws.close(1011, `tmux session not found')
  })
})
