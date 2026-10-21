/**
 * "<role> · <company>" for an agent, from its tags (`role:gm`, `org:3metas`). Shown next to the name
 * (the label, else the name) wherever an agent appears, so "Emilia" reads "Emilia · gm · 3metas".
 * Empty when the agent has neither tag. When there are several of a tag, the first is the main one.
 */
import { tagValues } from '@/lib/organization'

export function agentRoleLine(tags: string[] | undefined): string {
  const role = tagValues(tags, 'role')[0]
  const org = tagValues(tags, 'org')[0]
  return [role, org].filter(Boolean).join(' · ')
}

/** The full line: "Emilia · gm · 3metas" */
export function agentTitle(name: string, tags: string[] | undefined): string {
  const line = agentRoleLine(tags)
  return line ? `${name} · ${line}` : name
}
