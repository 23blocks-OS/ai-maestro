/**
 * One agent, several addresses.
 *
 * An agent belongs to a tenant on each provider it registers with, so it has one
 * address per tenant: `sebastian@rnd23blocks.aimaestro.local` on the local
 * network and `sebastian@23blocks.crabmail.ai` at Crabmail, each with its own key.
 * The registry keeps the primary one in `metadata.amp.address`; the others are
 * the provider registrations saved under the agent's folders.
 *
 * Mail from outside is delivered only to an address the agent actually has.
 * Matching on the name alone would hand mail for `sebastian@othertenant.example`
 * to our Sebastian.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadAllRegistrations } from '@/lib/amp-keys'
import { buildAMPAddress } from '@/lib/types/amp'

interface AddressSource {
  id: string
  name?: string
  alias?: string
  metadata?: { amp?: Record<string, unknown> } & Record<string, unknown>
}

function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

/** `address` fields from every `*.json` in a registrations folder. */
function addressesIn(dir: string): string[] {
  let files: string[] = []
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')) } catch { return [] }
  const out: string[] = []
  for (const f of files) {
    const a = readJson(path.join(dir, f))?.address
    if (typeof a === 'string' && a.includes('@')) out.push(a)
  }
  return out
}

/**
 * Every address this agent answers to, lower-cased and de-duplicated.
 * `organization` adds the implicit local address `name@<org>.aimaestro.local`.
 */
export function agentAddresses(agent: AddressSource, organization?: string, home: string = os.homedir()): string[] {
  const found: string[] = []
  const amp = agent.metadata?.amp
  if (typeof amp?.address === 'string') found.push(amp.address)
  if (Array.isArray(amp?.addresses)) {
    for (const a of amp.addresses) if (typeof a === 'string') found.push(a)
  }
  try {
    for (const r of loadAllRegistrations(agent.id)) if (r?.address) found.push(r.address)
  } catch { /* none registered */ }
  found.push(...addressesIn(path.join(home, '.agent-messaging', 'agents', agent.id, 'registrations')))
  const cfg = readJson(path.join(home, '.agent-messaging', 'agents', agent.id, 'config.json'))
  const cfgAddress = cfg?.agent?.address ?? cfg?.address
  if (typeof cfgAddress === 'string') found.push(cfgAddress)
  const name = agent.name || agent.alias
  if (organization && name) found.push(buildAMPAddress(name, organization))
  return [...new Set(found.filter(a => a.includes('@')).map(a => a.toLowerCase()))]
}

export function agentHasAddress(agent: AddressSource, address: string, organization?: string, home?: string): boolean {
  return agentAddresses(agent, organization, home).includes(address.trim().toLowerCase())
}

/** The agent that owns an address, or undefined. */
export function findAgentByAddress<T extends AddressSource>(agents: T[], address: string, organization?: string, home?: string): T | undefined {
  const wanted = address.trim().toLowerCase()
  return agents.find(a => agentAddresses(a, organization, home).includes(wanted))
}
