/**
 * The long-term memory SKILL, per agent.
 *
 * The agent is the product and long-term memory is one of its skills. Not every
 * agent needs it: some do their work fine within one session. Others act on
 * systems whose entities and relations outlive any one conversation (which
 * bucket holds production data, what depends on a service, what broke last time
 * it changed), and for those the skill is what lets them act with the
 * consequences in view.
 *
 * Stored in the agent's own directory (`skill-settings.json`, `memory` key), so
 * it moves with the agent. Default ON: the fleet builds memory until an agent
 * is switched off.
 *
 *   enabled      the skill: off means nothing is built and nothing is injected
 *   recall       memories are injected into its prompts (session start + each prompt)
 *   consolidate  new memories are built from its conversations (nightly run and
 *                history backfill). Off keeps recall of what was already built
 *                without spending anything on new memories.
 *
 * Off means nothing runs and nothing is injected. What was already built is
 * kept, and memory-search can still read it.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

export interface MemorySkill {
  enabled: boolean
  recall: boolean
  consolidate: boolean
}

export const DEFAULT_MEMORY_SKILL: MemorySkill = { enabled: true, recall: true, consolidate: true }

function settingsPath(agentId: string): string {
  return path.join(os.homedir(), '.aimaestro', 'agents', agentId, 'skill-settings.json')
}

export function readMemorySkill(agentId: string): MemorySkill {
  if (!/^[A-Za-z0-9_-]+$/.test(agentId)) return { ...DEFAULT_MEMORY_SKILL }
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(agentId), 'utf-8'))
    const memory = raw?.memory || {}
    return {
      enabled: memory.enabled !== false,
      // Recall follows the skill: an agent without memory has nothing to recall
      recall: memory.enabled !== false && memory.recall !== false,
      consolidate: memory.enabled !== false && memory.consolidate !== false,
    }
  } catch {
    return { ...DEFAULT_MEMORY_SKILL }
  }
}

export function isMemorySkillEnabled(agentId: string): boolean {
  return readMemorySkill(agentId).enabled
}

/** Does this agent build new memories? (The host may still be paused; see lib/memory/settings.ts) */
export function isMemoryConsolidationEnabled(agentId: string): boolean {
  return readMemorySkill(agentId).consolidate
}
