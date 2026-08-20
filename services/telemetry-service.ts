/**
 * OTLP telemetry receiver for Claude Code `claude_code.*` metrics.
 *
 * Agents launched with AIMAESTRO_TELEMETRY export OTLP/HTTP+JSON metrics here.
 * Each metric data point carries a `session.id` attribute; we sum token/cost
 * usage per session and map it to an agent via Agent.claudeSessionId, filling
 * the Tokens Used / API Cost tiles with real data.
 *
 * Metric names + attributes per https://code.claude.com/docs/en/monitoring-usage.md
 *   - claude_code.token.usage  (counter, tokens; attr: session.id, type, model)
 *   - claude_code.cost.usage   (counter, USD;    attr: session.id, model, ...)
 * Both are cumulative counters, so the latest export's per-session sum IS the
 * running total — we SET (not accumulate) on the agent.
 */
import { getAgentByClaudeSessionId, updateAgentMetrics, incrementAgentMetric } from '@/lib/agent-registry'

interface OtlpAttr {
  key: string
  value?: { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean }
}
interface OtlpDataPoint { attributes?: OtlpAttr[]; asInt?: string | number; asDouble?: number }
interface OtlpMetric {
  name?: string
  sum?: { dataPoints?: OtlpDataPoint[] }
  gauge?: { dataPoints?: OtlpDataPoint[] }
}

const TOKEN_METRIC = 'claude_code.token.usage'
const COST_METRIC = 'claude_code.cost.usage'

function attrString(attrs: OtlpAttr[] | undefined, key: string): string | undefined {
  return (attrs || []).find(a => a.key === key)?.value?.stringValue
}
function pointValue(dp: OtlpDataPoint): number {
  if (dp.asDouble !== undefined && dp.asDouble !== null) return Number(dp.asDouble) || 0
  if (dp.asInt !== undefined && dp.asInt !== null) return Number(dp.asInt) || 0
  return 0
}

/**
 * Pure parse: OTLP metrics JSON → per-session cumulative { tokens, cost }.
 * Sums across type/model series so each session gets a single total.
 */
export function parseClaudeMetrics(body: any): Record<string, { tokens: number; cost: number }> {
  const bySession: Record<string, { tokens: number; cost: number }> = {}
  for (const rm of (body?.resourceMetrics || [])) {
    for (const sm of (rm?.scopeMetrics || [])) {
      for (const m of (sm?.metrics || []) as OtlpMetric[]) {
        const isToken = m?.name === TOKEN_METRIC
        const isCost = m?.name === COST_METRIC
        if (!isToken && !isCost) continue
        const dps = m?.sum?.dataPoints || m?.gauge?.dataPoints || []
        for (const dp of dps) {
          const sid = attrString(dp.attributes, 'session.id')
          if (!sid) continue
          if (!bySession[sid]) bySession[sid] = { tokens: 0, cost: 0 }
          const v = pointValue(dp)
          if (isToken) bySession[sid].tokens += v
          else bySession[sid].cost += v
        }
      }
    }
  }
  return bySession
}

/**
 * Parse an OTLP metrics export and write per-session totals onto the matching
 * agents. Returns a small summary for the response/logs.
 */
export function ingestClaudeMetrics(body: any): { sessions: number; updated: number; unmatched: number } {
  const bySession = parseClaudeMetrics(body)
  const sessionIds = Object.keys(bySession)
  let updated = 0
  let unmatched = 0
  for (const sid of sessionIds) {
    const agent = getAgentByClaudeSessionId(sid)
    if (!agent) { unmatched++; continue }
    const { tokens, cost } = bySession[sid]
    const metrics: Record<string, number> = {}
    if (tokens > 0) metrics.totalTokensUsed = Math.round(tokens)
    if (cost > 0) metrics.estimatedCost = cost
    if (Object.keys(metrics).length > 0) {
      updateAgentMetrics(agent.id, metrics as any)
      updated++
    }
  }
  return { sessions: sessionIds.length, updated, unmatched }
}

// ── Logs: claude_code.api_request events → Total API Calls ──────────────────
// Unlike metrics (cumulative counters), each OTLP logs export is a BATCH of new
// events since the last export, so we INCREMENT the agent's call count rather
// than set it. Each record carries event.name + session.id (standard attribute).

const API_REQUEST_EVENTS = new Set(['api_request', 'claude_code.api_request'])

/**
 * Pure parse: OTLP logs JSON → per-session count of api_request events in this
 * export (a delta, not a cumulative total).
 */
export function parseApiRequestCounts(body: any): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const rl of (body?.resourceLogs || [])) {
    for (const sl of (rl?.scopeLogs || [])) {
      for (const rec of (sl?.logRecords || [])) {
        const attrs = rec?.attributes as OtlpAttr[] | undefined
        const evt = attrString(attrs, 'event.name')
        // Some exporters put the event name in the record body instead.
        const bodyVal = rec?.body?.stringValue
        if (!API_REQUEST_EVENTS.has(evt || '') && !API_REQUEST_EVENTS.has(bodyVal || '')) continue
        const sid = attrString(attrs, 'session.id')
        if (!sid) continue
        counts[sid] = (counts[sid] || 0) + 1
      }
    }
  }
  return counts
}

/**
 * Increment each matching agent's totalApiCalls by the number of api_request
 * events in this export.
 */
export function ingestClaudeLogs(body: any): { sessions: number; updated: number; unmatched: number; apiCalls: number } {
  const counts = parseApiRequestCounts(body)
  const sessionIds = Object.keys(counts)
  let updated = 0
  let unmatched = 0
  let apiCalls = 0
  for (const sid of sessionIds) {
    apiCalls += counts[sid]
    const agent = getAgentByClaudeSessionId(sid)
    if (!agent) { unmatched++; continue }
    incrementAgentMetric(agent.id, 'totalApiCalls', counts[sid])
    updated++
  }
  return { sessions: sessionIds.length, updated, unmatched, apiCalls }
}
