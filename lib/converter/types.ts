/**
 * Cross-Client Element Conversion Library — Type Definitions
 *
 * IR (Intermediate Representation) types for bidirectional conversion
 * of skills, agents, instructions, MCP, commands, and hooks between
 * AI coding clients (Claude, Codex, Gemini, OpenCode, Kiro, Copilot).
 *
 * Architecture: crucible IR hub pattern + acplugin element breadth.
 * Reference: docs_dev/2026-04-01-acplugin-vs-crucible-comparison.md
 */

// ═══════════════════════════════════════════════════════════════
// Provider (client platform definition)
// ═══════════════════════════════════════════════════════════════

/** Supported AI coding client identifiers */
export type ProviderId =
  | 'claude-code'
  | 'codex'
  | 'gemini'
  | 'opencode'
  | 'kiro'

/** Argument syntax category for body rewriting */
export type ArgSyntax = 'mustache' | 'dollar' | 'collapsed' | 'none'

/** Agent file format */
export type AgentFormat = 'markdown-yaml' | 'toml' | 'json'

/** Platform provider definition — all metadata needed for parsing and emitting */
export interface Provider {
  id: ProviderId
  displayName: string
  /** Client config directory relative to project root (e.g., '.claude') */
  configDir: string
  /** Skills directory relative to project root */
  skillsPath: string
  /** User-scope skills directory (absolute with ~) */
  userSkillsPath: string
  /** Agents directory relative to project root */
  agentsPath: string
  /** Agent file format */
  agentsFormat: AgentFormat
  /** Agent file extension */
  agentsExtension: string
  /** Model display name for body rewriting (e.g., 'Claude', 'GPT', 'Gemini') */
  modelName: string
  /** Primary instruction/config file name (e.g., 'CLAUDE.md', 'AGENTS.md') */
  configFile: string
  /** Ask-user instruction text for body rewriting */
  askInstruction: string
  /** Argument placeholder syntax category */
  argSyntax: ArgSyntax
  /** MCP config file path relative to project root (null if unsupported) */
  mcpConfigPath: string | null
  /** Commands directory relative to project root (null if unsupported) */
  commandsPath: string | null
  /** Hooks config file/dir path relative to project root (null if unsupported) */
  hooksPath: string | null
  /** Whether this client supports the plugin system */
  supportsPlugins: boolean
  /** User-scope config directory (absolute with ~) */
  userConfigDir: string
}

// ═══════════════════════════════════════════════════════════════
// Skill IR
// ═══════════════════════════════════════════════════════════════

/** Skill argument definition (from frontmatter or body detection) */
export interface SkillArg {
  name: string
  description: string
  required: boolean
}

/** Reference file bundled with a skill (from references/ subdirectory) */
export interface SkillReference {
  /** Relative path within the skill directory (e.g., 'references/api.md') */
  path: string
  content: string
}

/** Auxiliary file bundled with a skill (scripts, assets, etc.) */
export interface AuxFile {
  /** Relative path within the skill directory (e.g., 'scripts/helper.py') */
  relativePath: string
  content: string
}

/** Skill Intermediate Representation */
export interface SkillIR {
  name: string
  description: string
  userInvokable: boolean
  args: SkillArg[]
  license: string | null
  compatibility: string | null
  metadata: Record<string, string> | null
  allowedTools: string | null
  /** Glob patterns restricting when this skill is active (v2.1.86+) */
  paths: string[] | null
  body: string
  references: SkillReference[]
  auxFiles: AuxFile[]
  /** Source directory name (for output path construction) */
  dirName: string
  /** Original source path on disk */
  sourcePath: string
}

// ═══════════════════════════════════════════════════════════════
// Agent IR
// ═══════════════════════════════════════════════════════════════

/** Agent Intermediate Representation (18 fields + extras bag) */
export interface AgentIR {
  name: string
  description: string
  body: string
  model: string | null
  temperature: number | null
  reasoningEffort: string | null
  tools: string[] | null
  disallowedTools: string[] | null
  permissionMode: string | null
  maxTurns: number | null
  timeoutMins: number | null
  background: boolean
  isolation: string | null
  mcpServers: Record<string, unknown> | null
  skills: string[] | null
  hooks: Record<string, unknown> | null
  memory: string | null
  /** Platform-specific data that has no cross-platform equivalent.
   *  Keyed by provider ID (e.g., extras.kiro = { toolAliases: ... }) */
  extras: Record<string, unknown>
  /** Original source file name (for output path) */
  fileName: string
  /** Original source path on disk */
  sourcePath: string
}

// ═══════════════════════════════════════════════════════════════
// Instruction IR
// ═══════════════════════════════════════════════════════════════

/** Instruction/rule file IR (CLAUDE.md, AGENTS.md, rules/*.md) */
export interface InstructionIR {
  /** File name (e.g., 'CLAUDE.md', 'no-console-log.md') */
  fileName: string
  /** Full markdown content */
  content: string
  /** True if from a rules/ directory (vs. main instruction file) */
  isRule: boolean
  /** Original source path on disk */
  sourcePath: string
}

// ═══════════════════════════════════════════════════════════════
// MCP Server IR
// ═══════════════════════════════════════════════════════════════

/** Single MCP server definition */
export interface MCPServerDef {
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** 'stdio' or 'http' — inferred from fields if not explicit */
  type?: string
  url?: string
  headers?: Record<string, string>
}

/** MCP configuration IR */
export interface MCPIR {
  servers: MCPServerDef[]
  /** Original source path on disk */
  sourcePath: string
}

// ═══════════════════════════════════════════════════════════════
// Command IR
// ═══════════════════════════════════════════════════════════════

/** Slash command IR */
export interface CommandIR {
  /** Command name (e.g., 'review', 'test') */
  name: string
  /** Full command content (markdown or TOML depending on source) */
  content: string
  /** Parsed frontmatter (if any) */
  frontmatter?: Record<string, unknown>
  /** Original source path on disk */
  sourcePath: string
}

// ═══════════════════════════════════════════════════════════════
// Hook IR
// ═══════════════════════════════════════════════════════════════

/** Single hook definition */
export interface HookIR {
  /** Lifecycle event name (normalized to Claude naming: PreToolUse, PostToolUse, etc.) */
  event: string
  /** Tool/event matcher pattern (optional) */
  matcher?: string
  /** Hook type: 'command' (shell), 'prompt', 'http' */
  type: string
  /** Shell command (for type=command) */
  command?: string
  /** URL (for type=http) */
  url?: string
}

// ═══════════════════════════════════════════════════════════════
// Plugin Metadata
// ═══════════════════════════════════════════════════════════════

/** Plugin manifest metadata */
export interface PluginMeta {
  name: string
  description?: string
  version?: string
  author?: { name: string; email?: string }
  displayName?: string
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
  category?: string
  source?: string
}

// ═══════════════════════════════════════════════════════════════
// Project IR (aggregate of all elements)
// ═══════════════════════════════════════════════════════════════

/** Complete scan result — all elements found in a directory */
export interface ProjectIR {
  skills: SkillIR[]
  agents: AgentIR[]
  instructions: InstructionIR[]
  mcp: MCPIR | null
  commands: CommandIR[]
  hooks: HookIR[]
  pluginMeta?: PluginMeta
  /** Detected source provider */
  sourceProvider: ProviderId
  /** Root directory that was scanned */
  rootDir: string
}

// ═══════════════════════════════════════════════════════════════
// Conversion Output
// ═══════════════════════════════════════════════════════════════

/** Element type identifiers */
export type ElementType = 'skills' | 'agents' | 'instructions' | 'mcp' | 'commands' | 'hooks'

/** Single output file from conversion */
export interface ConvertedFile {
  /** Output path relative to target root */
  path: string
  /** File content (text) */
  content: string
  /** Element type this file belongs to */
  type: ElementType
  /** Warnings specific to this file (lossy conversions, unsupported features) */
  warnings: string[]
}

/** Options for the main convert() function */
export interface ConvertOptions {
  /** Source provider ID (auto-detected if not specified) */
  from?: ProviderId
  /** Target provider ID */
  to: ProviderId
  /** Source directory to scan */
  dir: string
  /** Filter to specific element types (default: all detected) */
  elements?: ElementType[]
  /** Where to write output: 'user' = ~/.client/, 'project' = .client/ */
  scope?: 'user' | 'project'
  /** Project root for project-scope output (defaults to cwd) */
  projectDir?: string
  /** Preview without writing to disk */
  dryRun?: boolean
  /** Overwrite existing files */
  force?: boolean
}

/** Result of a conversion operation */
export interface ConvertResult {
  ok: boolean
  error?: string
  files: ConvertedFile[]
  warnings: string[]
  elements: Record<ElementType, number>
  sourceProvider: ProviderId
  targetProvider: ProviderId
}

// ═══════════════════════════════════════════════════════════════
// Conversion Provenance (stored in frontmatter as _converted)
// ═══════════════════════════════════════════════════════════════

/** Metadata injected into converted files for traceability */
export interface ConversionProvenance {
  /** Source provider ID */
  from: ProviderId
  /** ISO date of conversion */
  date: string
  /** Lossy conversion warnings */
  warnings?: string[]
}

// ═══════════════════════════════════════════════════════════════
// Parser and Emitter interfaces
// ═══════════════════════════════════════════════════════════════

/** Parser: reads elements from a client's directory structure into IR */
export interface Parser {
  providerId: ProviderId
  /** Parse all elements from a directory */
  parse(dir: string): Promise<ProjectIR>
}

/** Emitter: converts IR into files for a target client */
export interface Emitter {
  providerId: ProviderId
  /** Emit converted files from IR */
  emit(project: ProjectIR, options?: { scope?: 'user' | 'project'; projectDir?: string }): ConvertedFile[]
}
