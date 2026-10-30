/**
 * A person in the humans directory: someone who works with a team's agents.
 *
 * A person is not on a host: they are in the real world, with an app that connects to the hosts they
 * use. Like an agent, a record lives on the host where the operator added it; other hosts show it by
 * asking their peers. Nothing is replicated, so there is nothing to merge.
 *
 * No authentication, by design: the operator who adds a person is the authority, and per-person
 * permissions are policy in a trusted network, not a security boundary.
 */

/** Where the record came from. `manual` now; directory sync (SCIM, LDAP) writes the same records later. */
export type PersonSource = 'manual' | string

export interface Person {
  /** Our own id, never reused. Agents' `owner` and `humanManager` will point at it. */
  id: string
  source: PersonSource
  /** The directory's stable id (Entra object id, AD objectGUID, LDAP entryUUID), never UPN or email */
  externalId?: string
  displayName: string
  givenName?: string
  familyName?: string
  email?: string
  /** E.164 (+34600111222). Kept for a later phone-provider integration; calls do not use it today. */
  phone?: string
  title?: string
  /** Free text; a policy hook for later */
  role?: string
  /**
   * Organizations this person belongs to, added by hand (org ids, as in agents' `org:` tags). A person also
   * shows in every organization of the agents that report to them; that part is derived, not stored.
   */
  orgs?: string[]
  /** The person this person reports to (a person id, possibly stored on another host) */
  managerPersonId?: string
  /** Soft delete: a deactivated person is kept but hidden from calls and meetings */
  active: boolean
  deactivatedAt?: string
  createdAt: string
  updatedAt: string
}

/** A record as a host returns it, with the host that stores it */
export interface PersonRecord extends Person {
  hostId: string
}
