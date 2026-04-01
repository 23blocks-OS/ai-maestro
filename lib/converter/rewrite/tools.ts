/**
 * Tool name mapping — convert agent tool references between providers.
 * Ported from acplugin converter/agent.ts (inline tool mapping).
 *
 * Claude uses capitalized names (Read, Write, Edit, Bash, Grep, Glob).
 * Gemini/OpenCode use snake_case (read_file, write_file, edit_file).
 * Codex/Kiro accept both but prefer snake_case.
 */

import type { Provider, AgentIR } from '../types'
import { WarningCollector } from '../utils/warnings'

/** Claude tool names → snake_case equivalents */
const CLAUDE_TO_SNAKE: Record<string, string> = {
  'Read': 'read_file',
  'Write': 'write_file',
  'Edit': 'edit_file',
  'Bash': 'run_terminal_command',
  'Grep': 'search_files',
  'Glob': 'list_files',
  'WebSearch': 'web_search',
  'WebFetch': 'web_fetch',
  'Agent': 'spawn_agent',
  'TodoRead': 'todo_read',
  'TodoWrite': 'todo_write',
  'NotebookEdit': 'notebook_edit',
}

/** Reverse mapping: snake_case → Claude */
const SNAKE_TO_CLAUDE: Record<string, string> = Object.fromEntries(
  Object.entries(CLAUDE_TO_SNAKE).map(([k, v]) => [v, k])
)

/** Detect if a tool list uses Claude-style capitalized names */
function isClaudeToolSyntax(tools: string[]): boolean {
  return tools.some(t => /^[A-Z][a-z]/.test(t) && CLAUDE_TO_SNAKE[t])
}

/** Map a single tool name between providers */
export function mapToolName(tool: string, source: Provider, target: Provider): string {
  if (source.id === target.id) return tool

  // Claude → non-Claude: capitalize → snake_case
  if (source.id === 'claude-code' && target.id !== 'claude-code') {
    return CLAUDE_TO_SNAKE[tool] ?? tool
  }

  // Non-Claude → Claude: snake_case → capitalize
  if (source.id !== 'claude-code' && target.id === 'claude-code') {
    return SNAKE_TO_CLAUDE[tool] ?? tool
  }

  // Non-Claude → Non-Claude: pass through (both use snake_case)
  return tool
}

/** Apply tool mapping to all agents. Returns new array (no mutation). */
export function rewriteAgentTools(
  agents: AgentIR[], source: Provider, target: Provider, warnings: WarningCollector
): AgentIR[] {
  return agents.map(agent => {
    let tools = agent.tools
    let disallowed = agent.disallowedTools

    if (tools) {
      const mapped = tools.map(t => mapToolName(t, source, target))
      if (mapped.some((t, i) => t !== tools![i])) {
        warnings.add(`Agent "${agent.name}": tool names remapped (${source.id} → ${target.id})`)
        tools = mapped
      }
    }

    if (disallowed) {
      disallowed = disallowed.map(t => mapToolName(t, source, target))
    }

    return { ...agent, tools, disallowedTools: disallowed }
  })
}
