/**
 * Claude Code native session naming (`claude --name <name>` / `-n`).
 *
 * When enabled, agent launches pass `--name <agent>` so Claude Code natively
 * knows the agent's name. The name surfaces in:
 *   - the statusline JSON as `session_name` (amp-statusline.sh reads it),
 *   - the terminal title,
 *   - `claude --resume <name>` (interactive resume-by-name).
 *
 * It does NOT reach hook payloads — Claude Code does not expose session_name to
 * hooks — so this does not change ai-maestro-hook.cjs identity resolution.
 *
 * Off by default (opt-in via AIMAESTRO_SESSION_NAME): an unknown flag would break
 * launches on a Claude Code too old to know `--name`, so the fleet is unaffected
 * until an operator flips the env var. Mirrors AIMAESTRO_CHANNEL_FLAG rollout.
 */

const CLAUDE_PROGRAMS = new Set(['claude', 'claude-code'])

/** True when AIMAESTRO_SESSION_NAME opts this host into passing `--name`. */
export function isSessionNamingEnabled(): boolean {
  const v = (process.env.AIMAESTRO_SESSION_NAME || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

/**
 * Coerce an agent name to the Claude Code / tmux session charset
 * (`^[A-Za-z0-9_-]+$`): map any other run of characters to a single '-', trim
 * leading/trailing '-', and cap length. Real agent names are already in this
 * charset, so this is a no-op for them and a safety net for anything unusual —
 * and it guarantees the value needs no shell quoting.
 */
export function sanitizeClaudeSessionName(name: string): string {
  return (name || '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/**
 * The ` --name <sanitized>` fragment to append to a claude launch command, or ''
 * when: session naming is disabled, the program is not claude, or the name is
 * empty. The returned fragment is shell-safe (sanitized charset, no quoting).
 */
export function claudeSessionNameFlag(agentName: string | undefined, program: string): string {
  if (!isSessionNamingEnabled()) return ''
  if (!CLAUDE_PROGRAMS.has((program || '').toLowerCase())) return ''
  const safe = sanitizeClaudeSessionName(agentName || '')
  return safe ? ` --name ${safe}` : ''
}
