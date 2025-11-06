import { NextResponse } from 'next/server'
import { updateAgentMetrics, incrementAgentMetric, getAgent } from '@/lib/agent-registry'
import type { UpdateAgentMetricsRequest } from '@/types/agent'

/**
 * GET /api/agents/[id]/metrics
 * Get agent metrics
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const agent = getAgent(params.id)

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ metrics: agent.metrics || {} })
  } catch (error) {
    console.error('Failed to get agent metrics:', error)
    return NextResponse.json({ error: 'Failed to get agent metrics' }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/[id]/metrics
 * Update agent metrics (full update or increment)
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { action, metric, amount, ...metrics } = body

    // Handle increment action
    if (action === 'increment' && metric) {
      const success = incrementAgentMetric(params.id, metric, amount || 1)

      if (!success) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }

      const agent = getAgent(params.id)
      return NextResponse.json({ metrics: agent?.metrics })
    }

    // Handle full metrics update
    const agent = updateAgentMetrics(params.id, metrics as UpdateAgentMetricsRequest)

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ metrics: agent.metrics })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update metrics'
    console.error('Failed to update agent metrics:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
