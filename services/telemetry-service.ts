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
import { getAgentByClaudeSessionId, updateAgentMetrics } from '@/lib/agent-registry'

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
const ACTIVE_TIME_METRIC = 'claude_code.active_time.total' // seconds (counter)

function attrString(attrs: OtlpAttr[] | undefined, key: string): string | undefined {
  return (attrs || []).find(a => a.key === key)?.value?.stringValue
}
function pointValue(dp: OtlpDataPoint): number {
  if (dp.asDouble !== undefined && dp.asDouble !== null) return Number(dp.asDouble) || 0
  if (dp.asInt !== undefined && dp.asInt !== null) return Number(dp.asInt) || 0
  return 0
}

/**
 * Pure parse: OTLP metrics JSON → per-session cumulative { tokens, cost,
 * activeSeconds }. All three are cumulative counters, summed across series.
 */
export function parseClaudeMetrics(body: any): Record<string, { tokens: number; cost: number; activeSeconds: number }> {
  const bySession: Record<string, { tokens: number; cost: number; activeSeconds: number }> = {}
  for (const rm of (body?.resourceMetrics || [])) {
    for (const sm of (rm?.scopeMetrics || [])) {
      for (const m of (sm?.metrics || []) as OtlpMetric[]) {
        const isToken = m?.name === TOKEN_METRIC
        const isCost = m?.name === COST_METRIC
        const isActive = m?.name === ACTIVE_TIME_METRIC
        if (!isToken && !isCost && !isActive) continue
        const dps = m?.sum?.dataPoints || m?.gauge?.dataPoints || []
        for (const dp of dps) {
          const sid = attrString(dp.attributes, 'session.id')
          if (!sid) continue
          if (!bySession[sid]) bySession[sid] = { tokens: 0, cost: 0, activeSeconds: 0 }
          const v = pointValue(dp)
          if (isToken) bySession[sid].tokens += v
          else if (isCost) bySession[sid].cost += v
          else bySession[sid].activeSeconds += v
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
    const { tokens, cost, activeSeconds } = bySession[sid]
    const metrics: Record<string, number> = {}
    if (tokens > 0) metrics.totalTokensUsed = Math.round(tokens)
    if (cost > 0) metrics.estimatedCost = cost
    if (activeSeconds > 0) metrics.uptimeHours = activeSeconds / 3600
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

function attrNumber(attrs: OtlpAttr[] | undefined, key: string): number | undefined {
  const v = (attrs || []).find(a => a.key === key)?.value
  if (!v) return undefined
  if (v.doubleValue !== undefined && v.doubleValue !== null) return Number(v.doubleValue)
  if (v.intValue !== undefined && v.intValue !== null) return Number(v.intValue)
  if (v.stringValue) { const n = Number(v.stringValue); return Number.isFinite(n) ? n : undefined }
  return undefined
}

/**
 * Pure parse: OTLP logs JSON → per-session { count, durationSumMs } of
 * api_request events in this export (a delta, not a cumulative total).
 */
export function parseApiRequests(body: any): Record<string, { count: number; durationSumMs: number }> {
  const out: Record<string, { count: number; durationSumMs: number }> = {}
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
        if (!out[sid]) out[sid] = { count: 0, durationSumMs: 0 }
        out[sid].count += 1
        const d = attrNumber(attrs, 'duration_ms')
        if (d && d > 0) out[sid].durationSumMs += d
      }
    }
  }
  return out
}

/**
 * For each matching agent: increment totalApiCalls by the number of api_request
 * events, and update averageResponseTime as a running average using duration_ms.
 */
export function ingestClaudeLogs(body: any): { sessions: number; updated: number; unmatched: number; apiCalls: number } {
  const byS = parseApiRequests(body)
  const sessionIds = Object.keys(byS)
  let updated = 0
  let unmatched = 0
  let apiCalls = 0
  for (const sid of sessionIds) {
    const { count, durationSumMs } = byS[sid]
    apiCalls += count
    const agent = getAgentByClaudeSessionId(sid)
    if (!agent) { unmatched++; continue }
    const oldCalls = agent.metrics?.totalApiCalls || 0
    const oldAvg = agent.metrics?.averageResponseTime || 0
    const newCalls = oldCalls + count
    const metrics: Record<string, number> = { totalApiCalls: newCalls }
    if (durationSumMs > 0 && newCalls > 0) {
      // Running mean over all calls seen so far.
      metrics.averageResponseTime = Math.round((oldAvg * oldCalls + durationSumMs) / newCalls)
    }
    updateAgentMetrics(agent.id, metrics as any)
    updated++
  }
  return { sessions: sessionIds.length, updated, unmatched, apiCalls }
}
