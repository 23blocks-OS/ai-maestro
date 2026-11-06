/**
 * #802: member kind, contacts, and the owner's approval of new AMP registrations.
 * Runs against the real registry, API keys and inbox in a temporary home.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { home, kill, wake, hostMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeFs = require('node:fs'), nodeOs = require('node:os'), nodePath = require('node:path')
  const home = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'assistants-home-'))
  process.env.HOME = home
  process.env.AIMAESTRO_KNOWN_KEYS_DIR = nodePath.join(home, 'known-keys')
  const hostMock = async (original: () => Promise<unknown>) => ({
    ...(await original() as object),
    getOrganization: () => 'testorg',
    getSelfHostId: () => 'test-host',
    getSelfHost: () => ({ id: 'test-host', name: 'test-host', url: 'http://test-host:23000' }),
    getPeerHosts: () => [],
    isSelf: (id: string) => id === 'test-host',
  })
  return { home, kill: vi.fn(), wake: vi.fn(), hostMock }
})

vi.mock('@/lib/hosts-config-server.mjs', hostMock)
vi.mock('@/lib/hosts-config', hostMock)
vi.mock('@/lib/agent-runtime', async (original) => ({
  ...(await original() as object),
  killSessionSync: kill,
  sessionExistsSync: () => false,
}))
vi.mock('@/lib/wake-chain', async (original) => ({
  ...(await original() as object),
  runWakeChain: wake.mockResolvedValue({ notified: true, confirmed: true, confirmedBy: 'test', attempts: [] }),
}))
vi.mock('@/lib/wake-queue', () => ({ enqueueWake: vi.fn() }))

import { generateKeyPair } from '@/lib/amp-keys'
import { signingString } from '@/lib/amp-trust'
import { createAgent, getAgent, getAgentByName, loadAgents, deleteAgent } from '@/lib/agent-registry'
import { deliver } from '@/lib/message-delivery'
import { sendFromUI } from '@/lib/message-send'
import { listInboxMessages } from '@/lib/messageQueue'
import { getProviderInfo, listAMPAgents, registerAgent, resolveAgentAddress, routeMessage, deliverFederated, getAgentSelf } from '@/services/amp-service'
import { approveRegistration, isApprovalRequired, listPendingRegistrations, rejectRegistration, setRegistrationApproval } from '@/services/amp-registrations-service'
import { addContact, listContacts, removeContact } from '@/services/contacts-service'
import { lookupAgentByName, switchRuntimeMode, updateAgentById, wakeAgent } from '@/services/agents-core-service'
import { createSession } from '@/services/sessions-service'
import { checkAgentFolders, checkAgentPrograms, checkAmpMailboxes, checkGhostAgents } from '@/services/doctor-checks'
import { cannotBeStarted, memberKind, memberPlatform } from '@/types/agent'

let n = 0
const unique = (prefix: string) => `${prefix}-${++n}`

async function register(name: string, extra: Record<string, unknown> = {}) {
  const keys = await generateKeyPair()
  const result = await registerAgent({ tenant: 'testorg', name, public_key: keys.publicPem, key_algorithm: 'Ed25519', ...extra } as any, null)
  return { result, data: result.data as any, keys, bearer: `Bearer ${(result.data as any).api_key}` }
}

const send = (bearer: string | null, to: string) =>
  routeMessage({ to, subject: 'hi', payload: { type: 'notification', message: 'hello' } } as any, bearer, null, null, null, null)

const localAgent = (name: string) => createAgent({ name, program: 'Claude Code', taskDescription: 'made in AI Maestro', createSession: true })

beforeEach(() => {
  expect(os.homedir()).toBe(home)
  setRegistrationApproval({ approvalRequired: false })
  wake.mockClear()
})

afterAll(() => { fs.rmSync(home, { recursive: true, force: true }) })

describe('member kind (ask 1)', () => {
  it('takes kind, platform and avatar from the request, and invents no program', async () => {
    const name = unique('amanda')
    const { result, data } = await register(name, { kind: 'assistant', platform: 'muse', avatar: 'https://example.com/a.png' })
    expect(result.status).toBe(201)
    const agent = getAgent(data.agent_id)!
    expect(agent).toMatchObject({ kind: 'assistant', platform: 'muse', avatar: 'https://example.com/a.png', program: '' })
    expect(agent.model).toBeUndefined()
  })

  it('reads metadata.kind and metadata.platform until clients send the fields', async () => {
    const { data } = await register(unique('grok'), { metadata: { kind: 'assistant', platform: 'grok' } })
    expect(getAgent(data.agent_id)).toMatchObject({ kind: 'assistant', platform: 'grok' })
  })

  it('keeps a program the request names', async () => {
    const { data } = await register(unique('tool'), { program: 'Codex' })
    expect(getAgent(data.agent_id)!.program).toBe('Codex')
  })

  it('an assistant takes no folder, whatever the request says', async () => {
    const { data } = await register(unique('nofolder'), { kind: 'assistant', metadata: { working_directory: '/tmp/somewhere' } })
    expect(getAgent(data.agent_id)!.workingDirectory).toBeUndefined()
  })

  it.each([
    [{ kind: 'robot' }, 'kind'],
    [{ metadata: { kind: 'robot' } }, 'kind'],
    [{ platform: 'a\nb' }, 'platform'],
    [{ platform: 'x'.repeat(65) }, 'platform'],
    [{ program: '/tmp/evil.sh' }, 'program'],
    [{ program: 'claude; rm -rf /' }, 'program'],
    [{ avatar: 'javascript:alert(1)' }, 'avatar'],
    [{ avatar: 'data:image/png;base64,AAAA' }, 'avatar'],
    [{ avatar: 'file:///etc/passwd' }, 'avatar'],
    [{ avatar: 42 }, 'avatar'],
  ])('refuses %j', async (extra, field) => {
    const name = unique('bad')
    const { result } = await register(name, extra)
    expect(result.status).toBe(400)
    expect((result.data as any).field).toBe(field)
    expect(getAgentByName(name, 'test-host')).toBeNull()
  })

  it('agents with no kind count as agent; an old record with metadata.kind counts as what it says', () => {
    expect(memberKind({})).toBe('agent')
    expect(cannotBeStarted({})).toBe(false)
    expect(memberKind({ metadata: { kind: 'assistant' } })).toBe('assistant')
    expect(memberPlatform({ metadata: { platform: 'muse' } })).toBe('muse')
    expect(cannotBeStarted({ metadata: { kind: 'assistant' } })).toBe(true)
  })

  it('PATCH cannot change a kind or a registration status', async () => {
    setRegistrationApproval({ approvalRequired: true })
    const { data } = await register(unique('patched'))
    updateAgentById(data.agent_id, { registrationStatus: undefined, kind: 'assistant', label: 'New label' } as any)
    expect(getAgent(data.agent_id)).toMatchObject({ registrationStatus: 'pending', label: 'New label' })
    expect(getAgent(data.agent_id)!.kind).toBeUndefined()
  })
})

describe('an assistant has nothing to start', () => {
  it('refuses wake, terminal and stream, and leaves a normal agent alone', async () => {
    const name = unique('muse')
    const { data } = await register(name, { kind: 'assistant', platform: 'muse' })
    expect((await wakeAgent(data.agent_id, {})).status).toBe(409)
    expect((await switchRuntimeMode(data.agent_id, 'streaming')).status).toBe(409)
    expect((await createSession({ name } as any)).status).toBe(409)
    expect(getAgent(data.agent_id)!.runtimeMode).toBeUndefined()
  })

  it('takes mail without the wake chain, and pushes to its webhook', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    const name = unique('hooked')
    const { data } = await register(name, { kind: 'assistant', delivery: { webhook_url: 'https://example.com/hook' } })
    const sender = await register(unique('sender'))
    const r = await send(sender.bearer, name)
    vi.unstubAllGlobals()
    expect(r.status).toBe(200)
    expect(wake).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls.some(([url]) => url === 'https://example.com/hook')).toBe(true)
    expect(await listInboxMessages(data.agent_id, {})).toHaveLength(1)
  })

  it('does not trouble the doctor', async () => {
    const { data } = await register(unique('doctor'), { kind: 'assistant' })
    const agent = getAgent(data.agent_id)!
    expect(checkAgentFolders([agent]).status).toBe('pass')
    expect(checkAmpMailboxes([agent], home).items ?? []).toEqual([])
    expect(checkGhostAgents([agent], home, []).items ?? []).toEqual([])
    const probe = { copies: async () => [], version: async () => ({ text: null, hung: false }) }
    const programs = await checkAgentPrograms([agent], home, probe as any)
    expect((programs.items ?? []).filter(i => i.status === 'fail')).toEqual([])
  })
})

describe('approval is off by default (ask 3)', () => {
  it('a fresh host has it off, a broken setting reads as off, and registration stays open', async () => {
    fs.rmSync(path.join(home, '.aimaestro', 'amp-registrations.json'), { force: true })
    expect(isApprovalRequired()).toBe(false)
    fs.writeFileSync(path.join(home, '.aimaestro', 'amp-registrations.json'), '{broken')
    expect(isApprovalRequired()).toBe(false)
    expect((getProviderInfo().data as any).registration_modes).toEqual(['open'])

    // What amp-init sends from a session with no registry record
    const local = await register(unique('session'), { agent_id: crypto.randomUUID(), metadata: { working_directory: path.join(home, 'work') } })
    expect(local.result.status).toBe(201)
    expect(local.data.status).toBeUndefined()
    expect(getAgent(local.data.agent_id)!.registrationStatus).toBeUndefined()
    expect(getAgentSelf(local.bearer).status).toBe(200)
  })

  it('refuses a setting that is not a boolean', () => {
    expect(setRegistrationApproval({ approvalRequired: 'yes' }).status).toBe(400)
    expect(isApprovalRequired()).toBe(false)
  })
})

describe('approval turned on (ask 3)', () => {
  beforeEach(() => { setRegistrationApproval({ approvalRequired: true }) })

  it('says so in the provider info', () => {
    expect((getProviderInfo().data as any).registration_modes).toEqual(['admin'])
  })

  it('a new registration gets a key that does nothing until the owner approves', async () => {
    const name = unique('newcomer')
    const pending = await register(name, { kind: 'assistant', platform: 'muse', avatar: 'https://example.com/a.png' })
    const member = await (async () => { const a = localAgent(unique('member')); return register(a.name) })()
    expect(pending.result.status).toBe(201)
    expect(pending.data.status).toBe('pending')

    const listed = (listPendingRegistrations().data as any).pending.find((p: any) => p.name === name)
    expect(listed).toMatchObject({ kind: 'assistant', platform: 'muse', avatar: 'https://example.com/a.png', hostId: 'test-host' })
    expect(listed.address).toContain(name)

    // Cannot send, read or look around
    const sent = await send(pending.bearer, member.data.local_name)
    expect(sent.status).toBe(401)
    expect((sent.data as any).error).toBe('registration_pending')
    expect(getAgentSelf(pending.bearer).status).toBe(401)

    // Cannot receive, on any route, and other members do not see it
    const received = await send(member.bearer, name)
    expect(received.status).toBe(403)
    expect((received.data as any).error).toBe('recipient_pending')
    await expect(sendFromUI({ from: member.data.local_name, to: name, subject: 's', content: { type: 'notification', message: 'm' } } as any)).rejects.toThrow(/approve/)
    await expect(sendFromUI({ from: name, to: member.data.local_name, subject: 's', content: { type: 'notification', message: 'm' } } as any)).rejects.toThrow(/approve/)
    const direct = await deliver({ envelope: { id: 'x', from: 'a@b.c', to: name } as any, payload: { type: 'notification', message: 'm' } as any, recipientAgentName: name, recipientAgentId: pending.data.agent_id, senderName: 'a', subject: 's' })
    expect(direct.delivered).toBe(false)
    expect(await listInboxMessages(pending.data.agent_id, {})).toEqual([])
    expect((listAMPAgents(member.bearer).data as any).agents.map((a: any) => a.address)).not.toContain(pending.data.address)
    expect(resolveAgentAddress(member.bearer, pending.data.address).status).toBe(404)
    // How another host asks before it forwards: the mail stops there with a 404, and is not queued
    expect((lookupAgentByName(name).data as any).exists).toBe(false)
    expect((await wakeAgent(pending.data.agent_id, {})).status).toBe(409)

    // Approved: the same key works, and the record is an ordinary member
    expect(approveRegistration(pending.data.agent_id).status).toBe(200)
    expect('registrationStatus' in JSON.parse(JSON.stringify(getAgent(pending.data.agent_id)))).toBe(false)
    expect((await send(pending.bearer, member.data.local_name)).status).toBe(200)
    expect((await send(member.bearer, name)).status).toBe(200)
    expect((listPendingRegistrations().data as any).pending.some((p: any) => p.name === name)).toBe(false)
    expect(approveRegistration(pending.data.agent_id).status).toBe(404)
  })

  it('a pending agent that registers again stays pending', async () => {
    const name = unique('again')
    const first = await register(name)
    const keys = first.keys
    const second = await registerAgent({ tenant: 'testorg', name, public_key: keys.publicPem, key_algorithm: 'Ed25519' } as any, null)
    expect((second.data as any).status).toBe('pending')
    expect(getAgentSelf(`Bearer ${(second.data as any).api_key}`).status).toBe(401)
  })

  it('rejecting removes the record and its key, frees the name, and touches no tmux session', async () => {
    const name = unique('stranger')
    const { data, bearer } = await register(name)
    kill.mockClear()
    expect(rejectRegistration(data.agent_id).status).toBe(200)
    expect(getAgent(data.agent_id)).toBeNull()
    expect(kill).not.toHaveBeenCalled()
    const after = getAgentSelf(bearer)
    expect(after.status).toBe(401)
    expect((after.data as any).error).toBe('unauthorized')
    expect((await register(name)).result.status).toBe(201)
    expect(rejectRegistration(data.agent_id).status).toBe(404)
  })

  it('approve and reject work only on pending registrations: a member cannot be rejected', () => {
    const member = localAgent(unique('safe'))
    expect(rejectRegistration(member.id).status).toBe(404)
    expect(approveRegistration(member.id).status).toBe(404)
    expect(getAgent(member.id)).not.toBeNull()
  })

  it('an agent made in AI Maestro registers straight through, as amp-init and the Docker bootstrap do', async () => {
    const made = localAgent(unique('made-here'))
    const viaInit = await register(made.name, { agent_id: made.id })
    expect(viaInit.result.status).toBe(201)
    expect(viaInit.data.status).toBeUndefined()
    expect(viaInit.data.agent_id).toBe(made.id)
    expect(getAgentSelf(viaInit.bearer).status).toBe(200)
  })

  it('a registration from before the setting was on stays a member, and so does its re-registration', async () => {
    setRegistrationApproval({ approvalRequired: false })
    const name = unique('veteran')
    const old = await register(name)
    setRegistrationApproval({ approvalRequired: true })

    expect(getAgentSelf(old.bearer).status).toBe(200)
    const again = await registerAgent({ tenant: 'testorg', name, public_key: old.keys.publicPem, key_algorithm: 'Ed25519' } as any, null)
    expect((again.data as any).status).toBeUndefined()
    expect(getAgentSelf(`Bearer ${(again.data as any).api_key}`).status).toBe(200)
    expect((listPendingRegistrations().data as any).pending.some((p: any) => p.name === name)).toBe(false)
  })

  it('turning it off does not let a waiting registration in', async () => {
    const { data, bearer } = await register(unique('waiting'))
    setRegistrationApproval({ approvalRequired: false })
    expect(getAgentSelf(bearer).status).toBe(401)
    expect(getAgent(data.agent_id)!.registrationStatus).toBe('pending')
  })

  it('a client cannot mark itself approved through metadata', async () => {
    const { data } = await register(unique('sly'), { metadata: { registrationStatus: 'active' }, registrationStatus: 'active' })
    expect(getAgent(data.agent_id)!.registrationStatus).toBe('pending')
  })
})

describe('contacts (ask 2)', () => {
  const valid = { address: 'Mia@Acme.crabmail.ai', name: 'Mia', ownerName: 'Acme Inc', platform: 'grok', avatar: 'https://acme.example/mia.png', addedBy: 'juan' }

  it('adds, lists and deletes; the address is stored in lower case and unknown fields are dropped', () => {
    const added = addContact({ ...valid, manager: 'x', sessions: [] })
    expect(added.status).toBe(201)
    const contact = (added.data as any).contact
    expect(contact).toMatchObject({ address: 'mia@acme.crabmail.ai', name: 'Mia', ownerName: 'Acme Inc', platform: 'grok', addedBy: 'juan' })
    expect(contact.addedAt).toBeTruthy()
    expect(contact.manager).toBeUndefined()
    expect(contact.sessions).toBeUndefined()
    expect((listContacts().data as any).contacts.map((c: any) => c.id)).toContain(contact.id)

    expect(addContact(valid).status).toBe(409)
    expect(removeContact(contact.id).status).toBe(200)
    expect(removeContact(contact.id).status).toBe(404)
    expect((listContacts().data as any).contacts.map((c: any) => c.id)).not.toContain(contact.id)
  })

  it('a contact is not an agent', () => {
    const before = loadAgents().length
    const { contact } = addContact({ address: 'no-agent@acme.crabmail.ai', name: 'N' }).data as any
    expect(loadAgents()).toHaveLength(before)
    removeContact(contact.id)
  })

  it.each([
    [{ address: 'not-an-address', name: 'x' }, 'address'],
    [{ address: 'a b@c.d', name: 'x' }, 'address'],
    [{ address: 'a@b.c\nd', name: 'x' }, 'address'],
    [{ name: 'x' }, 'address'],
    [{ address: 'a@b.c' }, 'name'],
    [{ address: 'a@b.c', name: 'x'.repeat(101) }, 'name'],
    [{ address: 'a@b.c', name: 'line\nbreak' }, 'name'],
    [{ address: 'a@b.c', name: 'x', avatar: 'javascript:alert(1)' }, 'avatar'],
    [{ address: 'a@b.c', name: 'x', avatar: 'ftp://b.c/a.png' }, 'avatar'],
    [{ address: 'a@b.c', name: 'x', avatar: 'data:text/html,hi' }, 'avatar'],
    [{ address: 'a@b.c', name: 'x', avatar: 'https://user:pw@b.c/a.png' }, 'avatar'],
    [{ address: 'a@b.c', name: 'x', platform: 7 }, 'platform'],
    [{ address: 'a@b.c', name: 'x', ownerName: '' }, 'ownerName'],
    [{ address: 'a@b.c', name: 'x', addedBy: {} }, 'addedBy'],
  ])('refuses %j', (body, field) => {
    const r = addContact(body)
    expect(r.status).toBe(400)
    expect((r.data as any).details?.field ?? (r.data as any).field).toBe(field)
  })

  it('refuses an address that belongs to one of our agents', async () => {
    const { data } = await register(unique('ours'))
    expect(addContact({ address: data.address, name: 'x' }).status).toBe(400)
  })

  it('survives a body that is not an object', () => {
    expect(addContact(null).status).toBe(400)
    expect(addContact('x').status).toBe(400)
  })

  it('reads a damaged store as empty rather than failing mail', () => {
    const file = path.join(home, '.aimaestro', 'contacts.json')
    const saved = fs.readFileSync(file, 'utf8')
    fs.writeFileSync(file, '{broken')
    expect((listContacts().data as any).contacts).toEqual([])
    fs.writeFileSync(file, saved)
  })
})

describe('federation mail says who it is from (ask 2)', () => {
  const sign = (priv: string, text: string) => crypto.sign(null, Buffer.from(text), priv).toString('base64')

  async function federate(from: string, to: string) {
    const prov = await generateKeyPair()
    const sender = await generateKeyPair()
    const envelope: any = {
      version: 'amp/0.1', id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from, to, subject: 'hello', priority: 'normal', timestamp: new Date().toISOString(),
    }
    const payload = { type: 'notification', message: 'hi' }
    envelope.signature = sign(sender.privatePem, signingString({ ...envelope, in_reply_to: '', payload }))
    const body = { envelope, payload, sender_public_key: sender.publicPem }
    const rawBody = JSON.stringify(body)
    const ts = String(Math.floor(Date.now() / 1000))
    return deliverFederated('crabmail.ai', body as any, {
      signature: sign(prov.privatePem, `${ts}.${rawBody}`), timestamp: ts, rawBody, fetchDoc: async () => ({ public_key: prov.publicPem }),
    })
  }

  it('marks a contact with its id, and a stranger as unknown', async () => {
    const { data } = await register(unique('inbox'))
    const contact = (addContact({ address: 'known@acme.crabmail.ai', name: 'Known' }).data as any).contact

    expect((await federate('Known@acme.crabmail.ai', data.address)).status).toBe(200)
    expect((await federate('stranger@other.crabmail.ai', data.address)).status).toBe(200)

    const inbox = await listInboxMessages(data.agent_id, {})
    const known = inbox.find(m => m.from.toLowerCase() === 'known')!
    const stranger = inbox.find(m => m.from === 'stranger')!
    expect(known).toMatchObject({ senderKind: 'contact', contactId: contact.id })
    expect(stranger.senderKind).toBe('unknown_outside')
    expect(stranger.contactId).toBeUndefined()
  })

  it('does not call one of our own agents an outsider when it writes from another address', async () => {
    const { data } = await register(unique('inbox2'))
    const own = await register(unique('own'))
    const ownAddress = `${own.data.local_name}@23blocks.crabmail.ai`
    const regs = path.join(home, '.agent-messaging', 'agents', own.data.agent_id, 'registrations')
    fs.mkdirSync(regs, { recursive: true })
    fs.writeFileSync(path.join(regs, 'crabmail.ai.json'), JSON.stringify({ address: ownAddress }))

    expect((await federate(ownAddress, data.address)).status).toBe(200)
    const [message] = await listInboxMessages(data.agent_id, {})
    expect(message.senderKind).toBeUndefined()
  })

  it('a pending registration does not receive federation mail', async () => {
    setRegistrationApproval({ approvalRequired: true })
    const { data } = await register(unique('waits'))
    expect((await federate('stranger2@other.crabmail.ai', data.address)).status).toBe(404)
    expect(await listInboxMessages(data.agent_id, {})).toEqual([])
    deleteAgent(data.agent_id, true, { keepSessions: true })
  })
})
