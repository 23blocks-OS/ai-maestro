/**
 * A project: a named piece of work that crosses agents and teams. It has an owner agent, a status and
 * its own board of cards (Task, with projectId set); a card can be assigned to any agent on any host.
 * It is stored on the OWNER AGENT'S host (~/.aimaestro/projects/<id>/), and addressed as <hostId>:<projectId>.
 */

export type ProjectStatus = 'active' | 'paused' | 'done'

export interface Project {
  id: string
  name: string
  description?: string
  /** An agent on the host that stores the project; null when nobody owns it yet */
  ownerAgentId: string | null
  status: ProjectStatus
  createdAt: string
  updatedAt: string
}

export interface ProjectView extends Project {
  /** The host that stores it (this host's id); with `id`, the address of the project */
  hostId: string
  counts: { open: number; waiting: number; total: number }
}
