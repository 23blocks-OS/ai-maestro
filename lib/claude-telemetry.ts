/**
 * Claude Code OTLP telemetry → AI Maestro (`claude_code.*` metrics).
 *
 * When enabled, agent launches export OpenTelemetry metrics to AI Maestro's
 * receiver. Each metric carries a `session.id` attribute (on by default), which
 * we map to an agent via `Agent.claudeSessionId` to populate real token/cost
 * usage on the agent's metrics tiles.
 *
 * Off by default (opt-in via AIMAESTRO_TELEMETRY): telemetry adds an exporter to
 * every agent process, so the fleet is unaffected until an operator opts in.
 * Mirrors AIMAESTRO_SESSION_NAME / AIMAESTRO_CHANNEL_FLAG rollout.
 *
 * Exact env surface + metric names verified against
 * https://code.claude.com/docs/en/monitoring-usage.md
 */

const CLAUDE_PROGRAMS = new Set(['claude', 'claude-code'])

/** True when AIMAESTRO_TELEMETRY opts this host into exporting OTLP telemetry. */
export function isTelemetryEnabled(): boolean {
  const v = (process.env.AIMAESTRO_TELEMETRY || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

/**
 * Base URL of the receiver AI Maestro exposes for OTLP/HTTP. The exporter posts
 * metrics to `<endpoint>/v1/metrics`. Overridable so remote hosts can point at a
 * central collector; defaults to the local AI Maestro server.
 */
export function telemetryEndpoint(): string {
  return (process.env.AIMAESTRO_TELEMETRY_ENDPOINT || 'http://localhost:23000/api/telemetry').replace(/\/+$/, '')
}

/**
 * `KEY='value' ...` env-export prefix to prepend to a claude launch command so
 * the process exports OTLP metrics to AI Maestro. Empty string when disabled or
 * not a claude program. http/json protocol so the receiver parses plain JSON
 * (no protobuf dependency). Values are fixed/sanitized, so the prefix is
 * shell-safe.
 */
export function claudeTelemetryEnvPrefix(program: string): string {
  if (!isTelemetryEnabled()) return ''
  if (!CLAUDE_PROGRAMS.has((program || '').toLowerCase())) return ''
  const pairs: Record<string, string> = {
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_ENDPOINT: telemetryEndpoint(),
    // session.id is included by default; keep metric cardinality per-session so
    // the receiver can attribute usage to an agent.
    OTEL_METRICS_INCLUDE_SESSION_ID: 'true',
    // Export a bit more often than the 60s default for fresher dashboard tiles.
    OTEL_METRIC_EXPORT_INTERVAL: '30000',
  }
  return Object.entries(pairs).map(([k, v]) => `${k}='${v}'`).join(' ') + ' '
}
