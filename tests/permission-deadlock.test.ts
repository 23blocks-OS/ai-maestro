/**
 * The stale-permission deadlock — reported live 15 September 2026.
 *
 * WHAT HAPPENED
 *
 * At 14:14:35 the server logged `hookState broadcast for pas-lola:
 * permission_request`. Nothing on the agent's pane showed a prompt of any kind;
 * the detection had false-positived. That set `sessionState._lastPermission`.
 *
 * From then on EVERY chat message was refused:
 *
 *     if (sessionState?._lastPermission?.status === 'permission_request')
 *       return { ok: false, error: 'Agent is waiting for permission approval...' }
 *
 * and `_lastPermission` is cleared only when a NEW assistant message appears in
 * the transcript. The agent could not produce one, because nothing was reaching
 * it. Refusal → no message → no reply → refusal. The chat was dead for the rest
 * of the afternoon, with the pane sitting at an ordinary empty prompt.
 *
 * The same memory was also served as the chat's `hookState`, which is what kept
 * a permission/question card pinned in the UI across reloads.
 *
 * THE RULE
 *
 * Remembered permission state is a CACHE, never an authority. The pane is the
 * ground truth, and a cache that cannot be invalidated by the world is a
 * deadlock waiting to be reported.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const server = fs.readFileSync(path.join(__dirname, '..', 'server.mjs'), 'utf8')

/** The body of sendChatMessage, where the refusal lives. */
const sendChat = server.slice(
  server.indexOf('async function sendChatMessage(sessionName, message)'),
  server.indexOf('* Answer a permission / choice menu')
)

/** The block that builds chat history, where the card is served from. */
const history = server.slice(
  server.indexOf('const workingDir = getAgentWorkingDir(agent)'),
  server.indexOf('conversationFile: file.path')
)

describe('sendChatMessage never refuses on memory alone', () => {
  it('re-checks the pane before trusting _lastPermission', () => {
    // Compare CODE, not prose — the comments above the fix mention both names.
    const code = sendChat
      .split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(code).toContain('isAgentAtPermissionPrompt')
    expect(code.indexOf('isAgentAtPermissionPrompt'))
      .toBeLessThan(code.indexOf('_lastPermission'))
  })

  it('CLEARS the stale memory rather than leaving it to block forever', () => {
    expect(sendChat).toMatch(/_lastPermission\s*=\s*null/)
  })

  it('refuses only when the pane itself shows a prompt', () => {
    // The refusal must be guarded by the live check, not the remembered one.
    const refusal = sendChat.indexOf('waiting for permission approval')
    const guard = sendChat.lastIndexOf('if (paneAtPermission)', refusal)
    expect(guard).toBeGreaterThan(-1)
  })
})

describe('chat history never pins a card on memory alone', () => {
  it('validates the remembered permission against the pane', () => {
    expect(history).toContain('isAgentAtPermissionPrompt')
  })

  it('drops the memory when the pane disagrees', () => {
    expect(history).toMatch(/_lastPermission\s*=\s*null/)
  })
})

describe('the draft survives leaving the chat', () => {
  const chatView = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'ChatView.tsx'), 'utf8'
  )

  it('persists what you typed, keyed per agent', () => {
    // ChatView unmounts on a tab switch, so unsent text was simply lost.
    expect(chatView).toContain('aimaestro-chat-draft-')
    expect(chatView).toMatch(/localStorage\.setItem\(draftKey/)
  })

  it('restores it on mount', () => {
    expect(chatView).toMatch(/localStorage\.getItem\(draftKey\)/)
  })

  it('clears it once the text has actually been handed off', () => {
    expect(chatView).toMatch(/localStorage\.removeItem\(draftKey\)/)
  })
})

describe('the approval card is pushed again after an assistant message clears it', () => {
  const jsonlBroadcast = server.slice(
    server.indexOf('function broadcastJsonlUpdates('),
    server.indexOf('function cleanupSession(')
  )
  const hookBroadcast = server.slice(
    server.indexOf('function broadcastHookState('),
    server.indexOf('function broadcastJsonlUpdates(')
  )

  it('forgets what it last sent, or the unchanged state is swallowed and the card never returns', () => {
    expect(jsonlBroadcast).toMatch(/_lastPermission = null\s+sessionState\._lastHookState = null/)
  })

  it('pushes the live state right behind the messages, so a card still on the pane does not blink off', () => {
    expect(jsonlBroadcast).toMatch(/if \(reassertPermission\) broadcastHookState\(/)
  })

  it('holds back the hook state that was cleared unless the pane still shows the menu (answered at the terminal)', () => {
    expect(jsonlBroadcast).toContain('_clearedHookJson')
    expect(hookBroadcast).toMatch(/hookJson === sessionState\._clearedHookJson/)
    expect(hookBroadcast).toContain('isAgentAtPermissionPrompt(sessionName, sessionState._program)')
  })

  it('does the same for a question: a waiting_for_input state is pushed again when its AskUserQuestion line lands', () => {
    expect(jsonlBroadcast).toContain('askUserQuestionIn')
    expect(jsonlBroadcast).toMatch(/waiting_for_input/)
  })
})
