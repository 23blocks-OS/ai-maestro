/**
 * Provider Registry — metadata for all supported AI coding clients.
 *
 * Each provider defines: directory paths, file formats, model names,
 * argument syntax, and capability flags needed for conversion.
 *
 * Ported from crucible's registry.js, extended with acplugin's element fields.
 * No Cursor (CLI clients only). No Aider (dead platform).
 */

import type { Provider, ProviderId } from './types'

const PROVIDERS: Provider[] = [
  {
    id: 'claude-code',
    displayName: 'Claude Code',
    configDir: '.claude',
    skillsPath: '.claude/skills',
    userSkillsPath: '~/.claude/skills',
    agentsPath: '.claude/agents',
    agentsFormat: 'markdown-yaml',
    agentsExtension: '.md',
    modelName: 'Claude',
    configFile: 'CLAUDE.md',
    askInstruction: 'STOP and call the AskUserQuestionTool to clarify.',
    argSyntax: 'mustache',
    mcpConfigPath: '.mcp.json',
    commandsPath: '.claude/commands',
    hooksPath: '.claude/settings.json',
    supportsPlugins: true,
    userConfigDir: '~/.claude',
  },
  {
    id: 'codex',
    displayName: 'Codex CLI',
    configDir: '.codex',
    skillsPath: '.codex/skills',
    userSkillsPath: '~/.codex/skills',
    agentsPath: '.codex/agents',
    agentsFormat: 'toml',
    agentsExtension: '.toml',
    modelName: 'GPT',
    configFile: 'AGENTS.md',
    askInstruction: 'ask the user directly to clarify what you cannot infer.',
    argSyntax: 'dollar',
    mcpConfigPath: '.codex/config.toml',
    commandsPath: null,
    hooksPath: '.codex/hooks.json',
    supportsPlugins: true,
    userConfigDir: '~/.codex',
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    configDir: '.gemini',
    skillsPath: '.gemini/skills',
    userSkillsPath: '~/.gemini/skills',
    agentsPath: '.gemini/agents',
    agentsFormat: 'markdown-yaml',
    agentsExtension: '.md',
    modelName: 'Gemini',
    configFile: 'GEMINI.md',
    askInstruction: 'ask the user directly to clarify what you cannot infer.',
    argSyntax: 'collapsed',
    mcpConfigPath: '.gemini/settings.json',
    commandsPath: '.gemini/commands',
    hooksPath: '.gemini/settings.json',
    supportsPlugins: false,
    userConfigDir: '~/.gemini',
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    configDir: '.opencode',
    skillsPath: '.opencode/skills',
    userSkillsPath: '~/.opencode/skills',
    agentsPath: '.opencode/agents',
    agentsFormat: 'markdown-yaml',
    agentsExtension: '.md',
    modelName: 'Claude',
    configFile: 'AGENTS.md',
    askInstruction: 'STOP and call the AskUserQuestionTool to clarify.',
    argSyntax: 'mustache',
    mcpConfigPath: 'opencode.json',
    commandsPath: '.opencode/commands',
    hooksPath: null,
    supportsPlugins: false,
    userConfigDir: '~/.config/opencode',
  },
  {
    id: 'kiro',
    displayName: 'Kiro',
    configDir: '.kiro',
    skillsPath: '.kiro/skills',
    userSkillsPath: '~/.kiro/skills',
    agentsPath: '.kiro/agents',
    agentsFormat: 'json',
    agentsExtension: '.json',
    modelName: 'Claude',
    configFile: '.kiro/settings.json',
    askInstruction: 'ask the user directly to clarify what you cannot infer.',
    argSyntax: 'none',
    mcpConfigPath: '.kiro/settings/mcp.json',
    commandsPath: null,
    hooksPath: '.kiro/settings/hooks.json',
    supportsPlugins: false,
    userConfigDir: '~/.kiro',
  },
]

/** All supported provider IDs */
export const PROVIDER_IDS: ProviderId[] = PROVIDERS.map(p => p.id)

/** Look up a provider by ID. Returns null if not found. */
export function getProvider(id: ProviderId | string): Provider | null {
  return PROVIDERS.find(p => p.id === id) ?? null
}

/** Return all providers. */
export function getAllProviders(): Provider[] {
  return [...PROVIDERS]
}

/** Return provider IDs that support a given element type. */
export function getProvidersSupporting(element: 'skills' | 'agents' | 'mcp' | 'commands' | 'hooks' | 'plugins'): Provider[] {
  return PROVIDERS.filter(p => {
    switch (element) {
      case 'skills': return true  // All providers support skills
      case 'agents': return true  // All providers support agents (different formats)
      case 'mcp': return p.mcpConfigPath !== null
      case 'commands': return p.commandsPath !== null
      case 'hooks': return p.hooksPath !== null
      case 'plugins': return p.supportsPlugins
    }
  })
}

/**
 * Resolve ~ in a path to the actual home directory.
 * Does NOT resolve if path doesn't start with ~.
 */
export function resolveHomePath(pathWithTilde: string): string {
  if (pathWithTilde.startsWith('~/')) {
    return pathWithTilde.replace('~', process.env.HOME || '/root')
  }
  return pathWithTilde
}
