/**
 * Contacts: outside addresses the company works with (another company's agents, "freelancers").
 * A contact is a record of an address and never an agent: no manager, companies, wake or sessions.
 * The store is per host, in ~/.aimaestro/contacts.json, because mail is marked on the host it arrives at.
 *
 *   GET    /api/contacts      -> listContacts
 *   POST   /api/contacts      -> addContact
 *   DELETE /api/contacts/:id  -> removeContact
 *
 * Avatars stay outside URLs: the host does not fetch or cache them.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { loadAgents } from '@/lib/agent-registry'
import { findAgentByAddress } from '@/lib/agent-addresses'
import { getOrganization } from '@/lib/hosts-config-server.mjs'
import { alreadyExists, invalidField, notFound, operationFailed, type ServiceResult } from '@/services/service-errors'

export interface Contact {
  id: string
  address: string
  name: string
  avatar?: string
  platform?: string
  ownerName?: string
  addedBy?: string
  addedAt: string
}

const MAX_TEXT = 100
const MAX_ADDRESS = 254
const MAX_URL = 2048
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const storeFile = () => path.join(os.homedir(), '.aimaestro', 'contacts.json')

/** One line of plain text, at most `max` characters. */
export function isOneLine(value: unknown, max: number = MAX_TEXT): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
}

/** An http(s) URL with no credentials in it. Anything else (javascript:, data:, file:) is refused. */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_URL) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}

function loadContacts(): Contact[] {
  try {
    const contacts = JSON.parse(fs.readFileSync(storeFile(), 'utf8'))
    return Array.isArray(contacts) ? contacts : []
  } catch {
    return []
  }
}

function saveContacts(contacts: Contact[]): void {
  const file = storeFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(contacts, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function findContactByAddress(address: string): Contact | undefined {
  const wanted = address.trim().toLowerCase()
  return loadContacts().find(c => c.address === wanted)
}

export function listContacts(): ServiceResult<{ contacts: Contact[] }> {
  return { data: { contacts: loadContacts() }, status: 200 }
}

export function addContact(body: unknown): ServiceResult<{ contact: Contact }> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>

  if (!isOneLine(b.address, MAX_ADDRESS) || !ADDRESS.test(b.address)) return invalidField('address', 'must be an address such as name@company.provider')
  if (!isOneLine(b.name)) return invalidField('name', `must be one line of text, at most ${MAX_TEXT} characters`)
  if (b.avatar !== undefined && !isHttpUrl(b.avatar)) return invalidField('avatar', 'must be an http or https URL')
  for (const field of ['platform', 'ownerName', 'addedBy']) {
    if (b[field] !== undefined && !isOneLine(b[field])) return invalidField(field, `must be one line of text, at most ${MAX_TEXT} characters`)
  }

  const address = b.address.trim().toLowerCase()
  if (findAgentByAddress(loadAgents() as any[], address, getOrganization() || undefined)) {
    return invalidField('address', 'belongs to an agent of this company; contacts are for outside addresses')
  }

  const contacts = loadContacts()
  if (contacts.some(c => c.address === address)) return alreadyExists('Contact', address)

  const contact: Contact = {
    id: randomUUID(),
    address,
    name: b.name.trim(),
    ...(b.avatar ? { avatar: b.avatar as string } : {}),
    ...(b.platform ? { platform: (b.platform as string).trim() } : {}),
    ...(b.ownerName ? { ownerName: (b.ownerName as string).trim() } : {}),
    ...(b.addedBy ? { addedBy: (b.addedBy as string).trim() } : {}),
    addedAt: new Date().toISOString(),
  }
  try {
    saveContacts([...contacts, contact])
  } catch (error) {
    return operationFailed('save contact', (error as Error).message)
  }
  return { data: { contact }, status: 201 }
}

export function removeContact(id: string): ServiceResult<{ success: true }> {
  const contacts = loadContacts()
  const remaining = contacts.filter(c => c.id !== id)
  if (remaining.length === contacts.length) return notFound('Contact', id)
  try {
    saveContacts(remaining)
  } catch (error) {
    return operationFailed('remove contact', (error as Error).message)
  }
  return { data: { success: true }, status: 200 }
}
