/**
 * Organizations Service
 *
 * An organization record is the name and description behind an `org:<id>` agent tag. Every route here
 * answers for the records THIS host stores; the Org page asks every host and joins them by id.
 * Routes are thin wrappers that call these functions.
 */

import {
  loadOrgs, getOrg, createOrg as createOrgRecord, updateOrg as updateOrgRecord, deleteOrg as deleteOrgRecord, isOrgId,
  getDefaultOrg, setDefaultOrg, RESERVED_ORG_IDS,
} from '@/lib/org-registry'
import { getSelfHostId } from '@/lib/hosts-config'
import { type ServiceResult, missingField, notFound, invalidField, alreadyExists, operationFailed } from '@/services/service-errors'
import type { OrganizationRecord } from '@/types/org'

const MAX_NAME = 80
const MAX_DESCRIPTION = 2000

export interface OrgParams {
  id?: unknown
  name?: unknown
  description?: unknown
}

const withHost = (o: Omit<OrganizationRecord, 'hostId'>): OrganizationRecord => ({ ...o, hostId: getSelfHostId() })

function checkFields(params: OrgParams, creating: boolean): ServiceResult<never> | null {
  if (creating || params.name !== undefined) {
    if (typeof params.name !== 'string' || !params.name.trim()) return missingField('name')
    if (params.name.trim().length > MAX_NAME) return invalidField('name', `name can be at most ${MAX_NAME} characters`)
  }
  if (params.description !== undefined && (typeof params.description !== 'string' || params.description.length > MAX_DESCRIPTION)) {
    return invalidField('description', `description must be text of at most ${MAX_DESCRIPTION} characters`)
  }
  return null
}

export function listOrgs(): ServiceResult<{ organizations: OrganizationRecord[]; defaultOrg: string }> {
  return { data: { organizations: loadOrgs().map(withHost), defaultOrg: getDefaultOrg() }, status: 200 }
}

export function getDefault(): ServiceResult<{ defaultOrg: string }> {
  return { data: { defaultOrg: getDefaultOrg() }, status: 200 }
}

/** Which organization the dashboard shows agents and cards with no org of their own under */
export function setDefault(params: { id?: unknown }): ServiceResult<{ defaultOrg: string }> {
  const id = typeof params.id === 'string' ? params.id.trim().toLowerCase() : ''
  if (!isOrgId(id) || RESERVED_ORG_IDS.includes(id)) return invalidField('id', 'id must be an organization id: lowercase letters, digits and hyphens')
  if (!setDefaultOrg(id)) return operationFailed('save the default organization', 'could not write the setting')
  return { data: { defaultOrg: id }, status: 200 }
}

export function getOrgById(id: string): ServiceResult<{ organization: OrganizationRecord }> {
  const o = getOrg(id)
  if (!o) return notFound('Organization', id)
  return { data: { organization: withHost(o) }, status: 200 }
}

export function createOrg(params: OrgParams): ServiceResult<{ organization: OrganizationRecord }> {
  const bad = checkFields(params, true)
  if (bad) return bad
  // The id is the `org:` tag value; default it from the name ("3Metas" -> "3metas")
  const id = (typeof params.id === 'string' && params.id.trim()
    ? params.id.trim()
    : String(params.name).trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  ).toLowerCase()
  if (RESERVED_ORG_IDS.includes(id)) return invalidField('id', `"${id}" is reserved`)
  if (!isOrgId(id)) return invalidField('id', 'id must be lowercase letters, digits and hyphens (it is the value of the agent org: tag), at most 64 characters')
  if (getOrg(id)) return alreadyExists('Organization', id)
  try {
    const o = createOrgRecord({ id, name: String(params.name).trim(), description: typeof params.description === 'string' ? params.description.trim() : undefined })
    return { data: { organization: withHost(o) }, status: 201 }
  } catch (error) {
    return operationFailed('create organization', (error as Error).message)
  }
}

export function updateOrg(id: string, params: OrgParams): ServiceResult<{ organization: OrganizationRecord }> {
  if (!getOrg(id)) return notFound('Organization', id)
  const bad = checkFields(params, false)
  if (bad) return bad
  try {
    const o = updateOrgRecord(id, {
      name: typeof params.name === 'string' ? params.name.trim() : undefined,
      description: typeof params.description === 'string' ? params.description.trim() : undefined,
    })
    if (!o) return notFound('Organization', id)
    return { data: { organization: withHost(o) }, status: 200 }
  } catch (error) {
    return operationFailed('update organization', (error as Error).message)
  }
}

export function deleteOrg(id: string): ServiceResult<{ success: boolean }> {
  if (!deleteOrgRecord(id)) return notFound('Organization', id)
  return { data: { success: true }, status: 200 }
}
