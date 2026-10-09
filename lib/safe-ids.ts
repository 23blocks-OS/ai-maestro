/**
 * Ids that become path components (B009, B010).
 *
 * Dependency-free on purpose: low-level writers (schedule, brain inbox) import it
 * without pulling in the agent runtime.
 */

/**
 * An agent id names a directory (`~/.aimaestro/agents/<id>`), so it has to be a plain
 * name: no separators, no `.`/`..`, no NUL.
 */
export function isSafeAgentId(agentId: unknown): agentId is string {
  return typeof agentId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(agentId) && !agentId.includes('..')
}
