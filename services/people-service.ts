/**
 * People Service
 *
 * The humans directory. Every route here answers for the people THIS host stores; the People page asks
 * every host and lists what each returns (no copying, so nothing to merge). Routes are thin wrappers.
 */

import {
  loadPeople, getPerson, createPerson as createPersonRecord, updatePerson as updatePersonRecord,
  deactivatePerson as deactivateRecord, reactivatePerson as reactivateRecord, deletePerson as deleteRecord,
  isPersonId, type PersonFields,
} from '@/lib/people-registry'
import { getSelfHostId } from '@/lib/hosts-config'
import { type ServiceResult, missingField, notFound, invalidField, operationFailed } from '@/services/service-errors'
import type { Person, PersonRecord } from '@/types/person'

const MAX_TEXT = 120
const E164 = /^\+[1-9]\d{6,14}$/
const TEXT_FIELDS = ['givenName', 'familyName', 'title', 'role', 'externalId'] as const
/** An organization id, as in agents' `org:` tags */
const ORG_ID = /^[a-z0-9][a-z0-9_.-]{0,63}$/
const MAX_ORGS = 20

export type PersonParams = Record<string, unknown>

const withHost = (p: Person): PersonRecord => ({ ...p, hostId: getSelfHostId() })

/** "+34 600-111-222" -> "+34600111222"; null when it cannot be a phone number */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s().-]/g, '')
  return E164.test(s) ? s : null
}

function parse(params: PersonParams, creating: boolean): ServiceResult<never> | PersonFields {
  const out: PersonFields = {}
  if (creating || params.displayName !== undefined) {
    if (typeof params.displayName !== 'string' || !params.displayName.trim()) return missingField('displayName')
    if (params.displayName.trim().length > MAX_TEXT) return invalidField('displayName', `displayName can be at most ${MAX_TEXT} characters`)
    out.displayName = params.displayName.trim()
  }
  for (const k of TEXT_FIELDS) {
    if (params[k] === undefined) continue
    if (typeof params[k] !== 'string' || (params[k] as string).length > MAX_TEXT) return invalidField(k, `${k} must be text of at most ${MAX_TEXT} characters`)
    out[k] = (params[k] as string).trim()
  }
  if (params.email !== undefined) {
    if (typeof params.email !== 'string' || (params.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(params.email.trim()))) return invalidField('email', 'email must look like name@example.com')
    out.email = params.email.trim()
  }
  if (params.orgs !== undefined) {
    if (!Array.isArray(params.orgs) || params.orgs.length > MAX_ORGS) return invalidField('orgs', `orgs must be a list of at most ${MAX_ORGS} organization ids`)
    const orgs = [...new Set(params.orgs.map(o => (typeof o === 'string' ? o.trim().toLowerCase() : '')))]
    if (!orgs.every(o => ORG_ID.test(o))) return invalidField('orgs', 'each organization must be an id such as acme or acme-labs (letters, digits, . _ -)')
    out.orgs = orgs
  }
  if (params.managerPersonId !== undefined) {
    // null or '' clears. The manager can be stored on another host, so only its shape is checked here;
    // the People page, which sees every host, refuses a loop before saving.
    if (params.managerPersonId === null || params.managerPersonId === '') out.managerPersonId = ''
    else if (!isPersonId(params.managerPersonId)) return invalidField('managerPersonId', 'managerPersonId must be a person id from GET /api/people')
    else out.managerPersonId = params.managerPersonId
  }
  if (params.phone !== undefined) {
    if (typeof params.phone !== 'string') return invalidField('phone', 'phone must be text')
    if (params.phone.trim() === '') out.phone = ''
    else {
      const n = normalizePhone(params.phone)
      if (!n) return invalidField('phone', 'phone must be an international number such as +34600111222')
      out.phone = n
    }
  }
  return out
}

const isErr = (x: ServiceResult<never> | PersonFields): x is ServiceResult<never> => 'status' in x && typeof (x as ServiceResult<never>).status === 'number'

/** People stored on this host. Deactivated ones are listed only when asked for. */
export function listPeople(opts: { includeInactive?: boolean } = {}): ServiceResult<{ people: PersonRecord[] }> {
  const all = loadPeople().filter(p => opts.includeInactive || p.active)
  return { data: { people: all.map(withHost) }, status: 200 }
}

export function getPersonById(id: string): ServiceResult<{ person: PersonRecord }> {
  const p = getPerson(id)
  if (!p) return notFound('Person', id)
  return { data: { person: withHost(p) }, status: 200 }
}

export function createPerson(params: PersonParams): ServiceResult<{ person: PersonRecord }> {
  const f = parse(params, true)
  if (isErr(f)) return f
  try {
    return { data: { person: withHost(createPersonRecord({ ...f, displayName: f.displayName! })) }, status: 201 }
  } catch (error) {
    return operationFailed('add person', (error as Error).message)
  }
}

export function updatePerson(id: string, params: PersonParams): ServiceResult<{ person: PersonRecord }> {
  if (!isPersonId(id) || !getPerson(id)) return notFound('Person', id)
  const f = parse(params, false)
  if (isErr(f)) return f
  if (f.managerPersonId && f.managerPersonId === id) return invalidField('managerPersonId', 'A person cannot report to themselves')
  try {
    // { active: true } brings back a deactivated person
    if (params.active === true) reactivateRecord(id)
    const p = updatePersonRecord(id, f)
    return p ? { data: { person: withHost(p) }, status: 200 } : notFound('Person', id)
  } catch (error) {
    return operationFailed('update person', (error as Error).message)
  }
}

/** DELETE deactivates (soft delete); `?purge=1` removes the record for a mistaken entry */
export function deletePerson(id: string, opts: { purge?: boolean } = {}): ServiceResult<{ success: boolean; person?: PersonRecord }> {
  if (!isPersonId(id) || !getPerson(id)) return notFound('Person', id)
  try {
    if (opts.purge) return deleteRecord(id) ? { data: { success: true }, status: 200 } : notFound('Person', id)
    const p = deactivateRecord(id)
    return p ? { data: { success: true, person: withHost(p) }, status: 200 } : notFound('Person', id)
  } catch (error) {
    return operationFailed('deactivate person', (error as Error).message)
  }
}
