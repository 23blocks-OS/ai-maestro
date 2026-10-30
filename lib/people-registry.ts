/**
 * People registry: one JSON file per person.
 * Storage: ~/.aimaestro/people/{id}.json, on the host where the operator added the person.
 * Same shape as the organization registry; nothing is replicated between hosts.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { Person } from '@/types/person'

const PEOPLE_DIR = path.join(os.homedir(), '.aimaestro', 'people')

export const PERSON_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/

export function isPersonId(id: unknown): id is string {
  return typeof id === 'string' && PERSON_ID.test(id)
}

function personFile(id: string): string {
  if (!isPersonId(id)) throw new Error('Invalid person id')
  return path.join(PEOPLE_DIR, `${id}.json`)
}

function read(id: string): Person | null {
  try {
    const file = personFile(id)
    if (!fs.existsSync(file)) return null
    const p = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (!p || typeof p !== 'object' || typeof p.displayName !== 'string') return null
    return { ...p, id }
  } catch (error) {
    console.error(`Failed to read person ${id}:`, error)
    return null
  }
}

function write(p: Person): boolean {
  try {
    fs.mkdirSync(PEOPLE_DIR, { recursive: true })
    fs.writeFileSync(personFile(p.id), JSON.stringify(p, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error(`Failed to save person ${p.id}:`, error)
    return false
  }
}

export function loadPeople(): Person[] {
  try {
    if (!fs.existsSync(PEOPLE_DIR)) return []
    return fs.readdirSync(PEOPLE_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5))
      .filter(isPersonId)
      .map(read)
      .filter((p): p is Person => p !== null)
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  } catch (error) {
    console.error('Failed to list people:', error)
    return []
  }
}

export function getPerson(id: string): Person | null {
  return isPersonId(id) ? read(id) : null
}

export type PersonFields = Partial<Omit<Person, 'id' | 'createdAt' | 'updatedAt' | 'active' | 'deactivatedAt'>>

export function createPerson(data: PersonFields & { displayName: string }): Person {
  const now = new Date().toISOString()
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== ''))
  const p: Person = {
    ...clean,
    id: uuidv4(),
    source: data.source || 'manual',
    displayName: data.displayName,
    active: true,
    createdAt: now,
    updatedAt: now,
  }
  if (!write(p)) throw new Error('Could not save the person')
  return p
}

/** An empty string clears an optional field */
export function updatePerson(id: string, updates: PersonFields): Person | null {
  const existing = getPerson(id)
  if (!existing) return null
  const next: Person = { ...existing, ...Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined)), id, updatedAt: new Date().toISOString() }
  for (const k of ['externalId', 'givenName', 'familyName', 'email', 'phone', 'title', 'role', 'managerPersonId'] as const) {
    if (next[k] === '') delete next[k]
  }
  if (Array.isArray(next.orgs) && next.orgs.length === 0) delete next.orgs
  if (!write(next)) throw new Error('Could not save the person')
  return next
}

/**
 * Soft delete. The record stays (with an id and a tombstone) so a later sync or call history can still
 * name it, but the phone number and email are dropped: privacy asks for no more than is needed.
 */
export function deactivatePerson(id: string): Person | null {
  const existing = getPerson(id)
  if (!existing) return null
  const { phone: _phone, email: _email, ...rest } = existing
  const next: Person = { ...rest, active: false, deactivatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  if (!write(next)) throw new Error('Could not save the person')
  return next
}

export function reactivatePerson(id: string): Person | null {
  const existing = getPerson(id)
  if (!existing) return null
  const { deactivatedAt: _d, ...rest } = existing
  const next: Person = { ...rest, active: true, updatedAt: new Date().toISOString() }
  if (!write(next)) throw new Error('Could not save the person')
  return next
}

/** Remove the record for good (a mistaken entry). Prefer deactivating. */
export function deletePerson(id: string): boolean {
  if (!getPerson(id)) return false
  fs.rmSync(personFile(id), { force: true })
  return true
}
