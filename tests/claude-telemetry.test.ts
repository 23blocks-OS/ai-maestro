import { describe, it, expect, afterEach } from 'vitest'
import { isTelemetryEnabled, telemetryEndpoint, claudeTelemetryEnvPrefix } from '@/lib/claude-telemetry'
import { parseClaudeMetrics } from '@/services/telemetry-service'

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
    expect(r.s1).toEqual({ tokens: 1250, cost: 0.42 })
    expect(r.s2).toEqual({ tokens: 0, cost: 1.5 })
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
