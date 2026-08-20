import { describe, it, expect, afterEach } from 'vitest'
import { isTelemetryEnabled, telemetryEndpoint, claudeTelemetryEnvPrefix } from '@/lib/claude-telemetry'
import { parseClaudeMetrics, parseApiRequests } from '@/services/telemetry-service'

const ORIG = { ...process.env }
afterEach(() => {
  process.env = { ...ORIG }
})

describe('claudeTelemetryEnvPrefix', () => {
  it('is empty by default (opt-in)', () => {
    delete process.env.AIMAESTRO_TELEMETRY
    expect(claudeTelemetryEnvPrefix('claude')).toBe('')
  })
  it('emits the OTLP env prefix for claude when enabled', () => {
    process.env.AIMAESTRO_TELEMETRY = '1'
    const p = claudeTelemetryEnvPrefix('claude')
    expect(p).toContain("CLAUDE_CODE_ENABLE_TELEMETRY='1'")
    expect(p).toContain("OTEL_METRICS_EXPORTER='otlp'")
    expect(p).toContain("OTEL_LOGS_EXPORTER='otlp'")
    expect(p).toContain("OTEL_EXPORTER_OTLP_PROTOCOL='http/json'")
    expect(p).toContain("OTEL_EXPORTER_OTLP_ENDPOINT='http://localhost:23000/api/telemetry'")
    expect(p.endsWith(' ')).toBe(true) // trailing space so it prefixes the command
  })
  it('is empty for non-claude programs even when enabled', () => {
    process.env.AIMAESTRO_TELEMETRY = 'on'
    expect(claudeTelemetryEnvPrefix('codex')).toBe('')
  })
  it('honors a custom endpoint override', () => {
    process.env.AIMAESTRO_TELEMETRY = 'true'
    process.env.AIMAESTRO_TELEMETRY_ENDPOINT = 'http://collector.internal:4318/'
    expect(telemetryEndpoint()).toBe('http://collector.internal:4318')
    expect(claudeTelemetryEnvPrefix('claude')).toContain("OTEL_EXPORTER_OTLP_ENDPOINT='http://collector.internal:4318'")
  })
  it('isTelemetryEnabled reads truthy/falsey values', () => {
    for (const v of ['1', 'true', 'yes', 'on']) { process.env.AIMAESTRO_TELEMETRY = v; expect(isTelemetryEnabled()).toBe(true) }
    for (const v of ['0', 'false', 'off', '']) { process.env.AIMAESTRO_TELEMETRY = v; expect(isTelemetryEnabled()).toBe(false) }
  })
})

describe('parseClaudeMetrics (OTLP JSON)', () => {
  // One export: session s1 has input+output tokens (summed) and a cost;
  // session s2 has only cost; a data point with no session.id is ignored.
  const body = {
    resourceMetrics: [{
      scopeMetrics: [{
        metrics: [
          {
            name: 'claude_code.token.usage',
            sum: { dataPoints: [
              { attributes: [{ key: 'session.id', value: { stringValue: 's1' } }, { key: 'type', value: { stringValue: 'input' } }], asInt: '1000' },
              { attributes: [{ key: 'session.id', value: { stringValue: 's1' } }, { key: 'type', value: { stringValue: 'output' } }], asInt: '250' },
              { attributes: [{ key: 'type', value: { stringValue: 'input' } }], asInt: '999' }, // no session.id → ignored
            ] },
          },
          {
            name: 'claude_code.cost.usage',
            sum: { dataPoints: [
              { attributes: [{ key: 'session.id', value: { stringValue: 's1' } }], asDouble: 0.42 },
              { attributes: [{ key: 'session.id', value: { stringValue: 's2' } }], asDouble: 1.5 },
            ] },
          },
          { name: 'claude_code.session.count', sum: { dataPoints: [{ attributes: [{ key: 'session.id', value: { stringValue: 's1' } }], asInt: '1' }] } }, // ignored metric
        ],
      }],
    }],
  }

  it('sums tokens across type series per session and reads cost', () => {
    const r = parseClaudeMetrics(body)
    expect(r.s1).toEqual({ tokens: 1250, cost: 0.42, activeSeconds: 0 })
    expect(r.s2).toEqual({ tokens: 0, cost: 1.5, activeSeconds: 0 })
  })
  it('ignores data points without a session.id', () => {
    const r = parseClaudeMetrics(body)
    // the 999-token point had no session.id, so s1 tokens stay 1250 (not 2249)
    expect(r.s1.tokens).toBe(1250)
  })
  it('handles empty / malformed bodies without throwing', () => {
    expect(parseClaudeMetrics({})).toEqual({})
    expect(parseClaudeMetrics(null)).toEqual({})
    expect(parseClaudeMetrics({ resourceMetrics: [{}] })).toEqual({})
  })
})

describe('parseApiRequests (OTLP logs)', () => {
  const body = {
    resourceLogs: [{
      scopeLogs: [{
        logRecords: [
          // two api_request events for s1, with duration_ms (int + double forms)
          { attributes: [{ key: 'event.name', value: { stringValue: 'api_request' } }, { key: 'session.id', value: { stringValue: 's1' } }, { key: 'duration_ms', value: { intValue: '100' } }] },
          { attributes: [{ key: 'event.name', value: { stringValue: 'api_request' } }, { key: 'session.id', value: { stringValue: 's1' } }, { key: 'duration_ms', value: { doubleValue: 200 } }] },
          // one for s2, with the full event name form, no duration
          { attributes: [{ key: 'event.name', value: { stringValue: 'claude_code.api_request' } }, { key: 'session.id', value: { stringValue: 's2' } }] },
          // a different event → ignored
          { attributes: [{ key: 'event.name', value: { stringValue: 'user_prompt' } }, { key: 'session.id', value: { stringValue: 's1' } }] },
          // api_request without session.id → ignored
          { attributes: [{ key: 'event.name', value: { stringValue: 'api_request' } }] },
        ],
      }],
    }],
  }

  it('counts api_request events + sums duration_ms per session', () => {
    expect(parseApiRequests(body)).toEqual({
      s1: { count: 2, durationSumMs: 300 },
      s2: { count: 1, durationSumMs: 0 },
    })
  })
  it('ignores non-api_request events and records without session.id', () => {
    expect(parseApiRequests(body).s1.count).toBe(2)
  })
  it('handles empty / malformed bodies', () => {
    expect(parseApiRequests({})).toEqual({})
    expect(parseApiRequests(null)).toEqual({})
  })
})
