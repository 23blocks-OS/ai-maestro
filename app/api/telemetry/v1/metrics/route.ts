import { NextRequest } from 'next/server'
import { receiveClaudeMetrics } from '@/services/telemetry-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/**
 * OTLP/HTTP metrics receiver — agents launched with AIMAESTRO_TELEMETRY export
 * `claude_code.*` metrics here (OTEL_EXPORTER_OTLP_ENDPOINT=.../api/telemetry,
 * the SDK appends /v1/metrics). We attribute token/cost usage to agents via the
 * session.id on each data point. Always answers 200 with an empty
 * ExportMetricsServiceResponse so the exporter never retry-storms.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(receiveClaudeMetrics(body))
}
