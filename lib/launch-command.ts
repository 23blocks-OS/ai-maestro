/**
 * The command that starts an agent's program, built in ONE place for waking an agent and for creating one.
 *
 * Creating an agent used to launch a bare `claude` (no permission mode, no channels, no scrollback fix, no
 * telemetry) while a later wake built the full command, so a new agent behaved differently until its first
 * wake. Both now call this. Pure apart from reading the environment, which is passed in so tests can pin it.
 */
import { PERMISSION_MODE_TO_CLI, type AgentPermissionMode } from '@/types/agent'
import type { ProgramKind } from '@/lib/program-names'
import { sanitizeLaunchOptions, launchOptionArgs, grokPermissionFlags, copilotPermissionFlags } from '@/lib/launch-options'
import { claudeSessionNameFlag } from '@/lib/claude-session-name'
import { claudeTelemetryEnvPrefix } from '@/lib/claude-telemetry'

/** Arguments typed by a person (the agent's "extra arguments"): only characters that cannot end a shell word. */
export function sanitizeProgramArgs(args: string): string {
  return args.replace(/[^a-zA-Z0-9\s\-_.=/:,~@]/g, '').trim()
}

export interface LaunchCommandInput {
  /** The resolved start command (`claude`, `grok`, a wrapper path...). */
  command: string
  kind: ProgramKind | null
  agentName: string
  /** The agent's extra arguments (sanitised here). */
  programArgs?: string
  /** The agent's stored model; a model among the launch options replaces it. */
  model?: string
  permissionMode?: AgentPermissionMode | string | null
  /** The tool's declared launch choices (lib/launch-options); validated here. */
  launchOptions?: unknown
  env?: NodeJS.ProcessEnv
}

export function buildLaunchCommand(input: LaunchCommandInput): string {
  const env = input.env ?? process.env
  const kind = input.kind
  let full = input.command

  if (input.programArgs) {
    const args = sanitizeProgramArgs(input.programArgs)
    if (args) full = `${full} ${args}`
  }

  const options = sanitizeLaunchOptions(kind, input.launchOptions)
  const model = typeof options.model === 'string' ? options.model : input.model
  if (model) full = `${full} --model ${model}`

  // Grok Build and Copilot CLI have their own permission flags. None of the Claude-only additions below apply.
  if (kind === 'grok') {
    const flags = grokPermissionFlags(input.permissionMode)
    if (flags) full = `${full} ${flags}`
  }
  if (kind === 'copilot') {
    const flags = copilotPermissionFlags(input.permissionMode)
    if (flags) full = `${full} ${flags}`
  }

  // The tool's declared choices (continue, effort, extra folder...). Claude Code has only the model.
  if (kind !== 'claude') {
    const args = launchOptionArgs(kind, options)
    if (args.length > 0) full = `${full} ${args.join(' ')}`
  }

  // Keyed off the resolved KIND, not the literal command, so a wrapper named claude-sandboxed.sh still gets
  // Claude Code's flags: losing --permission-mode on a sandboxed agent would be a silent downgrade.
  if (kind === 'claude') {
    const mode = (input.permissionMode || 'supervised') as AgentPermissionMode
    if (mode !== 'supervised') {
      const cli = PERMISSION_MODE_TO_CLI[mode]
      if (cli) full = `${full} --permission-mode ${cli}`
    }

    // Claude Code's native session name (opt-in via AIMAESTRO_SESSION_NAME).
    full = `${full}${claudeSessionNameFlag(input.agentName, 'claude')}`

    // Channels: reliable idle-agent wake via MCP turn-injection. Off until AIMAESTRO_CHANNEL_FLAG is set.
    if (env.AIMAESTRO_CHANNEL_FLAG) full = `${full} ${env.AIMAESTRO_CHANNEL_FLAG}`

    // Inline renderer so terminal SCROLLBACK works (the fullscreen renderer keeps no tmux history).
    if (env.AIMAESTRO_KEEP_ALT_SCREEN !== 'true') full = `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 ${full}`

    // Opt-in OTLP telemetry env prefix (off by default).
    full = `${claudeTelemetryEnvPrefix('claude')}${full}`
  }

  return full
}
