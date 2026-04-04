/**
 * Client type detection and capability mapping.
 * Different AI coding clients support different features.
 * The profile panel adapts its visible sections based on client capabilities.
 *
 * Supported (converter + tmux launch): claude, codex, gemini, opencode, kiro
 * Deprecated: aider (kept for backward compat, CreateAgent will auto-fallback)
 */

export type ClientType = 'claude' | 'codex' | 'gemini' | 'opencode' | 'kiro' | 'aider' | 'unknown'

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
  /** CLI launch/session commands — used by tmux session management */
  cli: {
    binary: string                    // e.g. 'claude', 'kiro-cli', 'codex'
    resume: string                    // flag/subcommand to resume last conversation
    skipPermissions: string           // flag to bypass tool confirmations
    useAgent: string                  // flag to load an agent persona (use %s for agent name)
    exit: string                      // command typed inside client to exit
    compact: string                   // command typed inside client to compact context
    clearLine: string                 // tmux key to clear input line before sending commands
    cancel: string                    // tmux key to cancel current operation
    update: string                    // command to update the client binary
    envVars: Record<string, string>   // environment variables to prepend to launch command
    noAltScreen: string               // flag to disable alternate screen (for tmux scrollback)
  }
}

const CAPABILITIES: Record<ClientType, ClientCapabilities> = {
  claude: {
    skills: true, plugins: true, agents: true, hooks: true,
    rules: true, commands: true, mcpServers: true, lspServers: true, rolePlugins: true,
    configFile: 'CLAUDE.md',
    skillPaths: { project: '.claude/skills', user: '~/.claude/skills' },
    // Verified from: claude --help, CLAUDE.md
    cli: {
      binary: 'claude',
      resume: '--continue',
      skipPermissions: '--dangerously-skip-permissions',
      useAgent: '--agent %s',         // supports plugin:agent namespace
      exit: '/exit',
      compact: '/compact',
      clearLine: 'C-u',              // tmux send-keys notation
      cancel: 'C-c',
      update: 'claude update',
      envVars: { CLAUDE_CODE_NO_FLICKER: '1' },
      noAltScreen: '',                // not needed — claude handles tmux well
    },
  },
  codex: {
    skills: true, plugins: true, agents: true, hooks: false,
    rules: false, commands: false, mcpServers: true, lspServers: false, rolePlugins: false,
    configFile: 'config.toml',
    skillPaths: { project: '.codex/skills', user: '~/.codex/skills' },
    // Verified from: codex --help
    cli: {
      binary: 'codex',
      resume: 'resume --last',        // subcommand: codex resume --last
      skipPermissions: '--full-auto',  // convenience alias for sandbox + auto-approve
      useAgent: '-p %s',              // uses --profile for config profiles
      exit: '/exit',
      compact: '/compact',
      clearLine: 'C-u',
      cancel: 'C-c',
      update: 'npm update -g @openai/codex',
      envVars: {},
      noAltScreen: '--no-alt-screen', // for tmux scrollback
    },
  },
  gemini: {
    skills: true, plugins: false, agents: false, hooks: true,
    rules: false, commands: true, mcpServers: true, lspServers: false, rolePlugins: false,
    configFile: 'GEMINI.md',
    skillPaths: { project: '.gemini/skills', user: '~/.gemini/skills' },
    // Verified from: gemini --help + geminicli.com/docs/cli/system-prompt
    cli: {
      binary: 'gemini',
      resume: '-r latest',            // --resume latest
      skipPermissions: '-y',          // --yolo mode (auto-approve all)
      useAgent: '',                   // no --agent flag — use GEMINI_SYSTEM_MD env var instead
      exit: '/exit',
      compact: '/compact',
      clearLine: 'C-u',
      cancel: 'C-c',
      update: 'npm update -g @anthropic-ai/gemini-cli',
      envVars: {},                    // GEMINI_SYSTEM_MD=/path/to/agent.md added dynamically by launch builder
      noAltScreen: '',
    },
  },
  opencode: {
    skills: true, plugins: false, agents: false, hooks: false,
    rules: false, commands: false, mcpServers: true, lspServers: false, rolePlugins: false,
    configFile: 'AGENTS.md',
    skillPaths: { project: '.opencode/skills', user: '~/.opencode/skills' },
    // Verified from: opencode --help (not installed on this host)
    cli: {
      binary: 'opencode',
      resume: '',                     // no resume flag documented
      skipPermissions: '',            // no auto-approve flag documented
      useAgent: '',                   // no agent flag documented
      exit: '/exit',
      compact: '',
      clearLine: 'C-u',
      cancel: 'C-c',
      update: 'go install github.com/opencode-ai/opencode@latest',
      envVars: {},
      noAltScreen: '',
    },
  },
  kiro: {
    skills: true, plugins: false, agents: true, hooks: true,
    rules: false, commands: false, mcpServers: true, lspServers: false, rolePlugins: false,
    configFile: '.kiro/settings.json',
    skillPaths: { project: '.kiro/skills', user: '~/.kiro/skills' },
    // Verified from: kiro-cli chat --help
    cli: {
      binary: 'kiro-cli',
      resume: 'chat --resume',                // subcommand-first: kiro-cli chat --resume
      skipPermissions: 'chat --trust-all-tools',
      useAgent: 'chat --agent %s',
      exit: '/exit',
      compact: '/compact',
      clearLine: 'C-u',
      cancel: 'C-c',
      update: 'kiro-cli update --non-interactive --relaunch-dashboard false',
      envVars: {},
      noAltScreen: '',
    },
  },
  aider: {
    skills: true, plugins: false, agents: false, hooks: false,
    rules: false, commands: false, mcpServers: false, lspServers: false, rolePlugins: false,
    configFile: '.aider.conf.yml',
    skillPaths: { project: 'skills', user: '' },
    // DEPRECATED — kept for backward compat
    cli: {
      binary: 'aider',
      resume: '',
      skipPermissions: '--yes',
      useAgent: '',
      exit: '/exit',
      compact: '',
      clearLine: 'C-u',
      cancel: 'C-c',
      update: 'pip install --upgrade aider-chat',
      envVars: {},
      noAltScreen: '',
    },
  },
  unknown: {
    skills: true, plugins: false, agents: false, hooks: false,
    rules: false, commands: false, mcpServers: false, lspServers: false, rolePlugins: false,
    configFile: '',
    skillPaths: { project: '', user: '' },
    cli: {
      binary: '',
      resume: '',
      skipPermissions: '',
      useAgent: '',
      exit: '/exit',
      compact: '',
      clearLine: 'C-u',
      cancel: 'C-c',
      update: '',
      envVars: {},
      noAltScreen: '',
    },
  },
}

/** Detect client type from the program name string stored in the agent registry */
export function detectClientType(program: string): ClientType {
  if (!program) return 'unknown'
  const p = program.toLowerCase().trim()
  if (p.includes('claude')) return 'claude'
  if (p.includes('codex')) return 'codex'
  if (p.includes('gemini')) return 'gemini'
  if (p.includes('opencode')) return 'opencode'
  if (p.includes('kiro')) return 'kiro'  // binary is 'kiro-cli' on all platforms
  if (p.includes('aider')) return 'aider'  // deprecated — kept for backward compat
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

/**
 * Build the full tmux launch command for a client session.
 * Combines binary, skip-permissions, agent persona, and any extra args.
 *
 * @param program - The program field from the agent registry (e.g. 'claude', 'kiro-cli')
 * @param options - Optional: agentName (persona), resume, extraArgs
 * @returns The full command string to run in tmux (e.g. 'kiro-cli chat --trust-all-tools --agent my-bot')
 */
export function buildLaunchCommand(
  program: string,
  options?: { agentName?: string; resume?: boolean; extraArgs?: string },
): string {
  const caps = getClientCapabilities(program)
  const cli = caps.cli
  const parts: string[] = [cli.binary || program]

  // For kiro, subcommand comes before flags (e.g. 'kiro-cli chat --trust-all-tools')
  // The skipPermissions/resume/useAgent fields already include 'chat' prefix for kiro
  if (options?.resume && cli.resume) {
    parts.push(cli.resume)
  } else if (cli.skipPermissions) {
    parts.push(cli.skipPermissions)
  }

  if (options?.agentName && cli.useAgent) {
    // Replace %s with agent name, or append if no placeholder
    const agentFlag = cli.useAgent.includes('%s')
      ? cli.useAgent.replace('%s', options.agentName)
      : `${cli.useAgent} ${options.agentName}`
    // Avoid duplicating 'chat' if already added by resume/skipPermissions
    const dedupedFlag = agentFlag.replace(/^chat\s+/, '')
    if (!parts.some(p => p.includes('chat'))) {
      parts.push(agentFlag)
    } else {
      parts.push(dedupedFlag)
    }
  }

  if (options?.extraArgs) {
    parts.push(options.extraArgs)
  }

  return parts.join(' ')
}

/** Human-readable label for the detected client type */
export function clientTypeLabel(clientType: ClientType): string {
  const labels: Record<ClientType, string> = {
    claude: 'Claude Code',
    codex: 'Codex CLI',
    gemini: 'Gemini CLI',
    opencode: 'OpenCode',
    kiro: 'Kiro',
    aider: 'Aider (deprecated)',
    unknown: 'Unknown',
  }
  return labels[clientType]
}
