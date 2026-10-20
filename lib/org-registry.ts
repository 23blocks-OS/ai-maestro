/**
 * Organization registry: one JSON file per organization record.
 * Storage: ~/.aimaestro/organizations/{id}.json, on the host where the record was created.
 * The id is the value of the agents' `org:` tag, so it is a safe lowercase slug.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Organization } from '@/types/org'

const ORGS_DIR = path.join(os.homedir(), '.aimaestro', 'organizations')

export const ORG_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Where agents and cards with no organization of their own are shown, until the user picks another */
export const FALLBACK_DEFAULT_ORG = 'personal'
/** Ids that name something else in the routes ("default" is the default-organization setting) */
export const RESERVED_ORG_IDS = ['default']
const DEFAULT_FILE = path.join(os.homedir(), '.aimaestro', 'organization-default.json')

export function isOrgId(id: unknown): id is string {
  return typeof id === 'string' && ORG_ID.test(id)
}

function orgFile(id: string): string {
  if (!isOrgId(id)) throw new Error('Invalid organization id')
  return path.join(ORGS_DIR, `${id}.json`)
}

function read(id: string): Organization | null {
  try {
    const file = orgFile(id)
    if (!fs.existsSync(file)) return null
    const o = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (!o || typeof o !== 'object' || typeof o.name !== 'string') return null
    return { ...o, id }
  } catch (error) {
    console.error(`Failed to read organization ${id}:`, error)
    return null
  }
}

function write(o: Organization): boolean {
  try {
    fs.mkdirSync(ORGS_DIR, { recursive: true })
    fs.writeFileSync(orgFile(o.id), JSON.stringify(o, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error(`Failed to save organization ${o.id}:`, error)
    return false
  }
}

export function loadOrgs(): Organization[] {
  try {
    if (!fs.existsSync(ORGS_DIR)) return []
    return fs.readdirSync(ORGS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5))
      .filter(isOrgId)
      .map(read)
      .filter((o): o is Organization => o !== null)
      .sort((a, b) => a.id.localeCompare(b.id))
  } catch (error) {
    console.error('Failed to list organizations:', error)
    return []
  }
}

export function getOrg(id: string): Organization | null {
  return isOrgId(id) ? read(id) : null
}

export function createOrg(data: { id: string; name: string; description?: string }): Organization {
  const now = new Date().toISOString()
  const o: Organization = {
    id: data.id,
    name: data.name,
    ...(data.description ? { description: data.description } : {}),
    createdAt: now,
    updatedAt: now,
  }
  if (!write(o)) throw new Error('Could not save the organization')
  return o
}

export function updateOrg(id: string, updates: Partial<Pick<Organization, 'name' | 'description'>>): Organization | null {
  const existing = getOrg(id)
  if (!existing) return null
  const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined))
  const next: Organization = { ...existing, ...clean, id, updatedAt: new Date().toISOString() }
  if (next.description === '') delete next.description
  if (!write(next)) throw new Error('Could not save the organization')
  return next
}

/** The default organization of this host's dashboard: the saved one, else "personal" */
export function getDefaultOrg(): string {
  try {
    if (fs.existsSync(DEFAULT_FILE)) {
      const d = JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf-8'))
      if (isOrgId(d?.id)) return d.id
    }
  } catch (error) {
    console.error('Failed to read the default organization:', error)
  }
  return FALLBACK_DEFAULT_ORG
}

export function setDefaultOrg(id: string): boolean {
  try {
    fs.mkdirSync(path.dirname(DEFAULT_FILE), { recursive: true })
    fs.writeFileSync(DEFAULT_FILE, JSON.stringify({ id }, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to save the default organization:', error)
    return false
  }
}

/** Remove the record only. Agent tags and card labels that name the organization stay as they are. */
export function deleteOrg(id: string): boolean {
  if (!getOrg(id)) return false
  fs.rmSync(orgFile(id), { force: true })
  return true
}
