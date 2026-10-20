/**
 * An organization record: the name and description behind an `org:<id>` tag.
 *
 * The id is the tag value (lowercase slug), so agents are linked to an organization by their tags,
 * not by a second list. A record is optional: an organization that only exists as tags is still listed.
 * Records live on the host where they were created; the Org page joins every host's records by id.
 */
export interface Organization {
  /** The `org:` tag value: lowercase letters, digits and hyphens */
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
}

/** A record as a host returns it, with the host that stores it */
export interface OrganizationRecord extends Organization {
  hostId: string
}
