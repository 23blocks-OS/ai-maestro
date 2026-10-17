import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('@/lib/amp-keys', async (orig) => ({ ...(await orig<Record<string, unknown>>()), loadAllRegistrations: () => [] }))

import { agentAddresses, agentHasAddress, findAgentByAddress } from '@/lib/agent-addresses'

describe('one agent, several addresses', () => {
  let home: string
  const id = '8d92cd08-c3c9-4374-b9cd-713fe1cdbe3f'
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'addr-'))
    const dir = path.join(home, '.agent-messaging', 'agents', id)
    fs.mkdirSync(path.join(dir, 'registrations'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ agent: { address: 'sebastian@rnd23blocks.aimaestro.local' } }))
    fs.writeFileSync(path.join(dir, 'registrations', 'crabmail.ai.json'), JSON.stringify({ provider: 'crabmail.ai', address: 'Sebastian@23blocks.crabmail.ai' }))
  })
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }))

  const sebastian = { id, name: 'sebastian', metadata: { amp: { address: 'sebastian@rnd23blocks.aimaestro.local' } } }

  it('lists the local address and every provider registration, lower-cased', () => {
    expect(agentAddresses(sebastian, 'rnd23blocks', home).sort()).toEqual([
      'sebastian@23blocks.crabmail.ai', 'sebastian@rnd23blocks.aimaestro.local',
    ])
  })

  it('answers to both of its addresses and to no other tenant', () => {
    expect(agentHasAddress(sebastian, 'sebastian@rnd23blocks.aimaestro.local', 'rnd23blocks', home)).toBe(true)
    expect(agentHasAddress(sebastian, 'SEBASTIAN@23blocks.crabmail.ai', 'rnd23blocks', home)).toBe(true)
    expect(agentHasAddress(sebastian, 'sebastian@othertenant.crabmail.ai', 'rnd23blocks', home)).toBe(false)
    expect(agentHasAddress(sebastian, 'sebastian@rnd23blocks.example.com', 'rnd23blocks', home)).toBe(false)
  })

  it('an agent with no registered address still has its implicit local one', () => {
    const plain = { id: 'no-such-id', name: 'plain' }
    expect(agentAddresses(plain, 'acme', home)).toEqual(['plain@acme.aimaestro.local'])
    expect(agentAddresses(plain, undefined, home)).toEqual([])
  })

  it('finds the owner of an address in any tenant', () => {
    const other = { id: 'x', name: 'other' }
    expect(findAgentByAddress([other, sebastian], 'sebastian@23blocks.crabmail.ai', 'rnd23blocks', home)).toBe(sebastian)
    expect(findAgentByAddress([other, sebastian], 'nobody@23blocks.crabmail.ai', 'rnd23blocks', home)).toBeUndefined()
  })

  it('extra addresses can also be kept on the registry record', () => {
    const a = { ...sebastian, metadata: { amp: { address: sebastian.metadata.amp.address, addresses: ['sebastian@acme.example.org'] } } }
    expect(agentHasAddress(a, 'sebastian@acme.example.org', 'rnd23blocks', home)).toBe(true)
  })
})
