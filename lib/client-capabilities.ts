/**
 * Client type detection and capability mapping.
 * Different AI clients (Claude, Codex, Gemini, Aider) support different features.
 * The profile panel adapts its visible sections based on client capabilities.
 */

export type ClientType = 'claude' | 'codex' | 'gemini' | 'aider' | 'unknown'

export interface ClientCapabilities {
  skills: boolean
  plugins: boolean
  agents: boolean
  hooks: boolean
  rules: boolean
  commands: boolean
  mcpServers: boolean
  lspServers: boolean
  rolePlugins: boolean
  /** Config file name for custom instructions */
  configFile: string
  /** Skill storage paths (project, user) */
  skillPaths: { project: string; user: string }
}

const CAPABILITIES: Record<ClientType, ClientCapabilities> = {
  claude: {
    skills: true, plugins: true, agents: true, hooks: true,
    rules: true, commands: true, mcpServers: true, lspServers: true, rolePlugins: true,
    configFile: 'CLAUDE.md',
    skillPaths: { project: '.claude/skills', user: '~/.claude/skills' },
  },
  codex: {
    skills: true, plugins: true, agents: true, hooks: false,
    rules: false, commands: false, mcpServers: true, lspServers: false, rolePlugins: false,
    configFile: 'config.toml',
    skillPaths: { project: '.codex/skills', user: '~/.codex/skills' },
  },
  gemini: {
    skills: true, plugins: false, agents: false, hooks: false,
    rules: false, commands: false, mcpServers: false, lspServers: false, rolePlugins: false,
    configFile: 'GEMINI.md',
    skillPaths: { project: '.gemini/skills', user: '~/.gemini/skills' },
  },
  aider: {
    skills: false, plugins: false, agents: false, hooks: false,
    rules: false, commands: false, mcpServers: false, lspServers: false, rolePlugins: false,
    configFile: '.aider.conf.yml',
    skillPaths: { project: '', user: '' },
  },
  unknown: {
    skills: true, plugins: false, agents: false, hooks: false,
    rules: false, commands: false, mcpServers: false, lspServers: false, rolePlugins: false,
    configFile: '',
    skillPaths: { project: '', user: '' },
  },
}

/** Detect client type from the program name string stored in the agent registry */
export function detectClientType(program: string): ClientType {
  if (!program) return 'unknown'
  const p = program.toLowerCase().trim()
  if (p.includes('claude')) return 'claude'
  if (p.includes('codex')) return 'codex'
  if (p.includes('gemini')) return 'gemini'
  if (p.includes('aider')) return 'aider'
  return 'unknown'
}

/** Get capability set for a given program name */
export function getClientCapabilities(program: string): ClientCapabilities {
  return CAPABILITIES[detectClientType(program)]
}

/**
 * Check whether a profile-panel tab should be visible for the given client.
 * The 'settings' / 'overview' / 'advanced' top-level tabs are always visible.
 * Config sub-tabs (role, plugins, skills, etc.) map to capability flags.
 */
export function isTabSupported(tabId: string, capabilities: ClientCapabilities): boolean {
  const map: Record<string, keyof ClientCapabilities> = {
    'role': 'rolePlugins',
    'plugins': 'plugins',
    'skills': 'skills',
    'agents': 'agents',
    'hooks': 'hooks',
    'rules': 'rules',
    'commands': 'commands',
    'mcps': 'mcpServers',
    'lsp': 'lspServers',
  }
  const key = map[tabId]
  // Tabs without a capability mapping (e.g. outputStyles) are always visible
  if (!key) return true
  return capabilities[key] as boolean
}

/** Human-readable label for the detected client type */
export function clientTypeLabel(clientType: ClientType): string {
  const labels: Record<ClientType, string> = {
    claude: 'Claude Code',
    codex: 'Codex CLI',
    gemini: 'Gemini CLI',
    aider: 'Aider',
    unknown: 'Unknown',
  }
  return labels[clientType]
}
