/**
 * Model identifier mapping — convert agent model field between providers.
 * Ported from acplugin utils/model.ts.
 *
 * Maps provider-specific model IDs to cross-provider equivalents.
 * Body text model name replacement is in body.ts (different concern).
 */

import type { Provider, AgentIR } from '../types'
import { WarningCollector } from '../utils/warnings'

/** Claude → Codex model mapping */
const CLAUDE_TO_CODEX: Record<string, string> = {
  'sonnet': 'gpt-5.4',
  'claude-sonnet-4-6': 'gpt-5.4',
  'claude-sonnet-4': 'gpt-5.4',
  'haiku': 'gpt-4-turbo',
  'claude-haiku-4-5': 'gpt-4-turbo',
  'opus': 'gpt-5-pro',
  'claude-opus-4-6': 'gpt-5-pro',
  'claude-opus-4': 'gpt-5-pro',
}

/** Claude → Gemini model mapping */
const CLAUDE_TO_GEMINI: Record<string, string> = {
  'sonnet': 'gemini-2-flash',
  'claude-sonnet-4-6': 'gemini-2-flash',
  'claude-sonnet-4': 'gemini-2-flash',
  'haiku': 'gemini-3-flash',
  'claude-haiku-4-5': 'gemini-3-flash',
  'opus': 'gemini-2-pro',
  'claude-opus-4-6': 'gemini-2-pro',
  'claude-opus-4': 'gemini-2-pro',
}

/** Codex → Claude reverse mapping */
const CODEX_TO_CLAUDE: Record<string, string> = {
  'gpt-5.4': 'claude-sonnet-4-6',
  'gpt-5-pro': 'claude-opus-4-6',
  'gpt-4-turbo': 'claude-haiku-4-5',
  'o3': 'claude-opus-4-6',
  'o3-mini': 'claude-sonnet-4-6',
}

/** Gemini → Claude reverse mapping */
const GEMINI_TO_CLAUDE: Record<string, string> = {
  'gemini-2-flash': 'claude-sonnet-4-6',
  'gemini-2-pro': 'claude-opus-4-6',
  'gemini-3-flash': 'claude-haiku-4-5',
  'gemini-3-pro': 'claude-opus-4-6',
}

/** Get the mapping table for a source→target pair */
function getMappingTable(source: string, target: string): Record<string, string> | null {
  if (source === 'claude-code' && target === 'codex') return CLAUDE_TO_CODEX
  if (source === 'claude-code' && target === 'gemini') return CLAUDE_TO_GEMINI
  if (source === 'codex' && target === 'claude-code') return CODEX_TO_CLAUDE
  if (source === 'gemini' && target === 'claude-code') return GEMINI_TO_CLAUDE
  // For other pairs, pass through (OpenCode and Kiro accept most model strings)
  return null
}

/** Map a model identifier from source to target provider */
export function mapModel(model: string, source: Provider, target: Provider): string {
  if (source.id === target.id) return model
  const table = getMappingTable(source.id, target.id)
  if (!table) return model // Pass through for unmapped pairs
  return table[model] ?? model // Return original if no mapping found
}

/** Apply model mapping to all agents. Returns new array (no mutation). */
export function rewriteAgentModels(
  agents: AgentIR[], source: Provider, target: Provider, warnings: WarningCollector
): AgentIR[] {
  return agents.map(agent => {
    if (!agent.model) return agent
    const mapped = mapModel(agent.model, source, target)
    if (mapped !== agent.model) {
      warnings.add(`Agent "${agent.name}": model "${agent.model}" → "${mapped}"`)
    }
    return { ...agent, model: mapped }
  })
}
