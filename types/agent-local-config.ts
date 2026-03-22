/**
 * Types for the Agent Profile Panel's local-config scanner.
 * Used by GET /api/agents/[id]/local-config and useAgentLocalConfig hook.
 */

export interface LocalSkill {
  name: string
  path: string
  description?: string
  /** Plugin this element belongs to (undefined = individually installed) */
  sourcePlugin?: string
}

export interface LocalAgent {
  name: string
  path: string
  description?: string
  sourcePlugin?: string
}

export interface LocalHook {
  name: string
  path: string
  eventType?: string
  sourcePlugin?: string
}

export interface LocalRule {
  name: string
  path: string
  preview?: string
  sourcePlugin?: string
}

export interface LocalCommand {
  name: string
  path: string
  trigger?: string
  sourcePlugin?: string
}

export interface LocalMcpServer {
  name: string
  command?: string
  args?: string[]
  sourcePlugin?: string
}

export interface LocalLspServer {
  name: string
  command: string
  languages: string[]
  sourcePlugin?: string
}

export interface LocalOutputStyle {
  name: string
  path: string
  sourcePlugin?: string
}

export interface LocalPlugin {
  name: string
  /** Full plugin key in "name@marketplace" format, used for enable/disable toggle */
  key?: string
  path: string
  description?: string
  enabled: boolean
  /** True if this plugin matches the Role-Plugin quad-match but is NOT the official one */
  isConflictingRolePlugin?: boolean
}

export interface RolePlugin {
  name: string
  profilePath: string
  mainAgentName: string
  mainAgentPath: string
}

export interface GlobalDependencies {
  plugins: string[]
  skills: string[]
  mcpServers: string[]
  scripts: string[]
  hooks: string[]
  tools: string[]
  output_styles: string[]
}

export interface AgentLocalConfig {
  workingDirectory: string
  skills: LocalSkill[]
  agents: LocalAgent[]
  hooks: LocalHook[]
  rules: LocalRule[]
  commands: LocalCommand[]
  mcpServers: LocalMcpServer[]
  lspServers: LocalLspServer[]
  outputStyles: LocalOutputStyle[]
  plugins: LocalPlugin[]
  rolePlugin: RolePlugin | null
  globalDependencies: GlobalDependencies | null
  settings: Record<string, unknown>
  lastScanned: string
}
