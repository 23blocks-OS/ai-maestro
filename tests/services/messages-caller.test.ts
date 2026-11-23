/**
 * The message services decide with the caller server.mjs found (lib/caller-identity.ts):
 * an agent sends as itself and uses its own mailbox; the server itself and an anonymous caller
 * keep today's trust (there is no strict mode and no operator token: F132, F058).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Caller } from '@/lib/caller-identity'

const m = vi.hoisted(() => {
  const agents: Record<string, { agentId: string; alias: string }> = {
    alice: { agentId: 'id-alice', alias: 'alice' },
    bob: { agentId: 'id-bob', alias: 'bob' },
    'id-alice': { agentId: 'id-alice', alias: 'alice' },
    'id-bob': { agentId: 'id-bob', alias: 'bob' },
  }
  return {
    agents,
    sendFromUI: vi.fn(async (_o: Record<string, unknown>) => ({ message: { id: 'm1' }, notified: true })),
    forwardFromUI: vi.fn(async (_o: Record<string, unknown>) => ({ message: { id: 'm2', to: 'bob', subject: 's' }, notified: true })),
    listInboxMessages: vi.fn(async (..._a: unknown[]) => [] as any[]),
    listSentMessages: vi.fn(async (..._a: unknown[]) => [] as any[]),
    getMessage: vi.fn(async () => ({ id: 'x' })),
    markMessageAsRead: vi.fn(async () => true),
    archiveMessage: vi.fn(async () => true),
    deleteMessage: vi.fn(async () => true),
    listAgentsWithMessages: vi.fn(async () => []),
    agentLib: {
      listAgentInboxMessages: vi.fn(async () => []),
      listAgentSentMessages: vi.fn(async () => []),
      getAgentMessageStats: vi.fn(async () => ({})),
      getAgentMessage: vi.fn(async () => ({ id: 'x' })),
      markAgentMessageAsRead: vi.fn(async () => true),
      archiveAgentMessage: vi.fn(async () => true),
      deleteAgentMessage: vi.fn(async () => true),
    },
  }
})

vi.mock('@/lib/message-send', () => ({ sendFromUI: m.sendFromUI, forwardFromUI: m.forwardFromUI }))
vi.mock('@/lib/messageQueue', () => ({
  resolveAgentIdentifier: (i: string) => m.agents[i] || null,
  listInboxMessages: m.listInboxMessages,
  listSentMessages: m.listSentMessages,
  getMessage: m.getMessage,
  markMessageAsRead: m.markMessageAsRead,
  archiveMessage: m.archiveMessage,
  deleteMessage: m.deleteMessage,
  listAgentsWithMessages: m.listAgentsWithMessages,
  getUnreadCount: vi.fn(async () => 0),
  getSentCount: vi.fn(async () => 0),
  getMessageStats: vi.fn(async () => ({})),
}))
vi.mock('@/lib/agent-messaging', () => m.agentLib)
vi.mock('@/lib/agent-registry', async (o) => ({
  ...(await o<any>()),
  searchAgents: vi.fn(() => []),
  getAgent: (id: string) => (m.agents[id] && id.startsWith('id-') ? { id, name: m.agents[id].alias } : null),
}))
vi.mock('@/lib/owning-host', () => ({ findPeerHostUrl: vi.fn(async () => undefined) }))
vi.mock('@/lib/hosts-config', async (o) => ({ ...(await o<any>()), getSelfHostId: vi.fn(() => 'self'), getSelfHost: vi.fn(() => ({ id: 'self' })) }))

import { getMessages, sendMessage, updateMessage, removeMessage, forwardMessage, getMeetingMessages } from '@/services/messages-service'
import * as agentMsg from '@/services/agents-messaging-service'
import { broadcastToMeeting } from '@/services/meeting-broadcast-service'
import { getPendingWakesReport } from '@/services/pending-wakes-service'
import { listPersonMessages } from '@/services/person-messages-service'

const alice: Caller = { kind: 'agent', agentId: 'id-alice', name: 'alice', via: 'session', mode: 'session', local: true }
const host: Caller = { kind: 'operator', via: 'host', mode: 'session', local: true }
const anonSession: Caller = { kind: 'anonymous', mode: 'session', local: true }
const msg = (from?: string) => ({ ...(from ? { from } : {}), to: 'bob', subject: 's', content: { type: 'notification' as const, message: 'hi' } })
const err = (r: { status: number; data?: any }) => ({ status: r.status, error: r.data?.error })

beforeEach(() => { vi.clearAllMocks() })

describe('POST /api/messages: the sender cannot be forged', () => {
  it('an agent sending as another agent is refused', async () => {
    expect(err(await sendMessage(msg('bob') as never, alice))).toEqual({ status: 403, error: 'sender_mismatch' })
    expect(err(await sendMessage(msg('id-bob') as never, alice))).toEqual({ status: 403, error: 'sender_mismatch' })
    expect(m.sendFromUI).not.toHaveBeenCalled()
  })

  it('an agent sending as itself is verified by the server; a missing from is its own', async () => {
    expect((await sendMessage(msg() as never, alice)).status).toBe(201)
    expect(m.sendFromUI.mock.calls[0][0]).toMatchObject({ from: 'id-alice', fromVerified: true, senderVia: 'session' })
  })

  it("an agent cannot pick another agent's alias, label or host (the alias becomes the AMP address)", async () => {
    await sendMessage({ ...msg('alice'), fromAlias: 'bob', fromLabel: 'Bob', fromHost: 'elsewhere' } as never, alice)
    const o = m.sendFromUI.mock.calls[0][0]
    expect(o.fromAlias).toBeUndefined()
    expect(o.fromLabel).toBeUndefined()
    expect(o.fromHost).toBeUndefined()
  })

  it('default install: an anonymous caller (the dashboard) sends as before, recorded as claimed', async () => {
    expect((await sendMessage({ ...msg('bob'), fromAlias: 'Bob' } as never, anonSession)).status).toBe(201)
    const o = m.sendFromUI.mock.calls[0][0]
    expect(o).toMatchObject({ from: 'bob', fromAlias: 'Bob', senderVia: 'claimed' })
    expect(o).not.toHaveProperty('fromVerified')
  })

  it('the server itself sends as anyone, recorded as host', async () => {
    expect((await sendMessage(msg('bob') as never, host)).status).toBe(201)
    expect(m.sendFromUI.mock.calls[0][0]).toMatchObject({ from: 'bob', senderVia: 'host' })
  })

  it('off: nothing changes', async () => {
    expect((await sendMessage(msg('bob') as never, { ...alice, mode: 'off' })).status).toBe(201)
    expect(m.sendFromUI.mock.calls[0][0]).not.toHaveProperty('senderVia')
  })
})

describe("GET/PATCH/DELETE /api/messages: an inbox needs its owner", () => {
  it("an agent cannot list, read, count, mark, archive or delete another agent's mail", async () => {
    for (const p of [{ agent: 'bob' }, { agent: 'bob', id: 'x' }, { agent: 'bob', action: 'unread-count' }, { agent: 'bob', box: 'sent' }, { agent: 'id-bob', action: 'stats' }]) {
      expect(err(await getMessages(p, alice)), JSON.stringify(p)).toEqual({ status: 403, error: 'not_your_mailbox' })
    }
    expect(err(await updateMessage('bob', 'x', 'read', alice))).toEqual({ status: 403, error: 'not_your_mailbox' })
    expect(err(await updateMessage('bob', 'x', 'archive', alice))).toEqual({ status: 403, error: 'not_your_mailbox' })
    expect(err(await removeMessage('bob', 'x', alice))).toEqual({ status: 403, error: 'not_your_mailbox' })
    expect(m.listInboxMessages).not.toHaveBeenCalled()
    expect(m.deleteMessage).not.toHaveBeenCalled()
  })

  it('an agent reads and changes its own mailbox, by name or id, or by naming none', async () => {
    expect((await getMessages({ agent: 'alice' }, alice)).status).toBe(200)
    expect((await getMessages({}, alice)).status).toBe(200)
    expect(m.listInboxMessages.mock.calls[1][0]).toBe('id-alice')
    expect((await updateMessage('id-alice', 'x', 'read', alice)).status).toBe(200)
    expect((await removeMessage(null, 'x', alice)).status).toBe(200)
    expect(m.deleteMessage).toHaveBeenCalledWith('id-alice', 'x')
  })

  it('the lookups that reveal no mail stay open; the list of every mailbox does not', async () => {
    expect((await getMessages({ agent: 'bob', action: 'resolve' }, alice)).status).toBe(200)
    expect((await getMessages({ agent: 'bo', action: 'search' }, alice)).status).toBe(200)
    expect(err(await getMessages({ action: 'agents' }, alice))).toEqual({ status: 403, error: 'not_your_mailbox' })
  })

  it('default install: an anonymous caller and the server itself read any inbox as before', async () => {
    expect((await getMessages({ agent: 'bob' }, anonSession)).status).toBe(200)
    expect((await getMessages({ agent: 'bob' }, host)).status).toBe(200)
    expect((await removeMessage('bob', 'x', host)).status).toBe(200)
  })
})

describe('POST /api/messages/forward', () => {
  it('the forwarder is the caller, and forwards from its own mailbox by id', async () => {
    expect(err(await forwardMessage({ messageId: 'x', fromSession: 'bob', toSession: 'carol' }, alice))).toEqual({ status: 403, error: 'sender_mismatch' })
    expect(err(await forwardMessage({ originalMessage: { from: 'bob' }, fromSession: 'alice', toSession: 'carol' }, alice))).toEqual({ status: 403, error: 'not_your_mailbox' })
    expect((await forwardMessage({ messageId: 'x', toSession: 'carol' } as never, alice)).status).toBe(200)
    expect(m.forwardFromUI.mock.calls[0][0]).toMatchObject({ fromAgent: 'id-alice', toAgent: 'carol' })
  })
})

describe('GET /api/messages/meeting', () => {
  it('an agent reads the meeting from its own mailbox only', async () => {
    expect(err(await getMeetingMessages({ meetingId: 'mt', participants: 'bob', since: null }, alice))).toEqual({ status: 403, error: 'not_your_mailbox' })
    expect((await getMeetingMessages({ meetingId: 'mt', participants: 'bob,id-alice', since: null }, alice)).status).toBe(200)
    const read = m.listInboxMessages.mock.calls.map(c => c[0])
    expect(read).toEqual(['id-alice'])
  })
  it('an anonymous reader (the dashboard) reads the meeting as before', async () => {
    expect((await getMeetingMessages({ meetingId: 'mt', participants: 'bob', since: null }, anonSession)).status).toBe(200)
  })
})

describe("/api/agents/[id]/messages*: every verb on another agent's mailbox", () => {
  it('is refused for an agent caller', async () => {
    const results = [
      await agentMsg.listMessages('id-bob', {}, alice),
      await agentMsg.getMessage('id-bob', 'x', 'inbox', alice),
      await agentMsg.updateMessage('id-bob', 'x', { action: 'read' }, alice),
      await agentMsg.deleteMessageById('id-bob', 'x', alice),
    ]
    for (const r of results) expect(err(r)).toEqual({ status: 403, error: 'not_your_mailbox' })
    expect(err(await agentMsg.sendMessage('id-bob', msg() as never, alice))).toEqual({ status: 403, error: 'sender_mismatch' })
    expect(err(await agentMsg.forwardMessage('id-bob', 'x', { to: 'carol' }, alice))).toEqual({ status: 403, error: 'sender_mismatch' })
    expect(m.agentLib.listAgentInboxMessages).not.toHaveBeenCalled()
    expect(m.sendFromUI).not.toHaveBeenCalled()
  })

  it('works on its own mailbox, and for the server itself and the default anonymous caller', async () => {
    expect((await agentMsg.listMessages('id-alice', {}, alice)).status).toBe(200)
    expect((await agentMsg.sendMessage('id-alice', msg() as never, alice)).status).toBe(201)
    expect(m.sendFromUI.mock.calls[0][0]).toMatchObject({ from: 'id-alice', fromVerified: true, senderVia: 'session' })
    expect((await agentMsg.deleteMessageById('id-bob', 'x', host)).status).toBe(200)
    expect((await agentMsg.listMessages('id-bob', {}, anonSession)).status).toBe(200)
  })
})

describe('other message surfaces', () => {
  it('a meeting broadcast is sent as maestro, so not by an agent', async () => {
    const r = await broadcastToMeeting({ meetingId: 'mt', message: 'hi', participantIds: ['id-bob'], caller: alice })
    expect(err(r)).toEqual({ status: 403, error: 'sender_mismatch' })
    const s = await broadcastToMeeting({ meetingId: 'mt', message: 'hi', participantIds: ['id-bob'], caller: anonSession })
    expect(err(s).error).not.toBe('sender_mismatch')
  })

  it("the pending-wakes report (every agent's pending senders and subjects) is not for an agent", async () => {
    expect(err(await getPendingWakesReport(alice))).toEqual({ status: 403, error: 'not_your_mailbox' })
  })

  it("a person's mailbox is never an agent's", () => {
    expect(err(listPersonMessages('p1', {}, alice))).toEqual({ status: 403, error: 'not_your_mailbox' })
  })
})
