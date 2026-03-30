/**
 * Group types for the Groups feature
 *
 * Groups are lightweight collections of agents for broadcast messaging.
 * Unlike teams, groups have no governance, no COS, no kanban — just
 * a list of subscriber agents who receive group-addressed messages.
 */

export interface Group {
  id: string
  name: string
  description?: string
  subscriberIds: string[]
  createdAt: string
  updatedAt: string
  lastMeetingAt?: string
}

export interface GroupsFile {
  version: 1
  groups: Group[]
}
