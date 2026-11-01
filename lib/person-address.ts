/**
 * A person's AMP address (spec 13.1): a stable id, never the name, in the same namespace as agents.
 * The local part is "p-<personId>", so it can never be read as an agent name or an agent id.
 */

import { getAMPProviderDomain } from '@/lib/types/amp'
import { getOrganization } from '@/lib/hosts-config'
import { isPersonId } from '@/lib/people-registry'

export function personAddress(personId: string): string {
  return `p-${personId}@${getAMPProviderDomain(getOrganization() || undefined)}`
}

/** The person id an address names, or null when it is not a person's address */
export function personIdFromAddress(address: string | undefined | null): string | null {
  const local = (address || '').split('@')[0]
  if (!local.startsWith('p-')) return null
  const id = local.slice(2)
  return isPersonId(id) ? id : null
}
