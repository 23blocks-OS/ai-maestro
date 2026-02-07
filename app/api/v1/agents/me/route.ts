/**
 * AMP v1 Agent Self-Management Endpoint
 *
 * GET    /api/v1/agents/me  — Get current agent info
 * PATCH  /api/v1/agents/me  — Update current agent
 * DELETE /api/v1/agents/me  — Deregister current agent
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/amp-auth'
import { getAgent, updateAgent, deleteAgent } from '@/lib/agent-registry'
import { loadKeyPair } from '@/lib/amp-keys'
import { revokeAllKeysForAgent } from '@/lib/amp-auth'
import type { AMPError } from '@/lib/types/amp'

/**
 * GET /api/v1/agents/me — Get current authenticated agent info
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return NextResponse.json({
      error: auth.error || 'unauthorized',
      message: auth.message || 'Authentication required'
    } as AMPError, { status: 401 })
  }

  const agent = getAgent(auth.agentId!)
  if (!agent) {
    return NextResponse.json({
      error: 'not_found',
      message: 'Agent not found'
    } as AMPError, { status: 404 })
  }

  const keyPair = loadKeyPair(auth.agentId!)

  return NextResponse.json({
    address: auth.address,
    alias: agent.alias || agent.label,
    delivery: agent.metadata?.amp?.delivery || {},
    fingerprint: keyPair?.fingerprint || agent.metadata?.amp?.fingerprint || null,
    registered_at: agent.metadata?.amp?.registeredAt || agent.createdAt,
    last_seen_at: agent.lastActive || null,
  })
}

/**
 * PATCH /api/v1/agents/me — Update current agent
 */
export async function PATCH(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return NextResponse.json({
      error: auth.error || 'unauthorized',
      message: auth.message || 'Authentication required'
    } as AMPError, { status: 401 })
  }

  const agent = getAgent(auth.agentId!)
  if (!agent) {
    return NextResponse.json({
      error: 'not_found',
      message: 'Agent not found'
    } as AMPError, { status: 404 })
  }

  let body: { alias?: string; delivery?: Record<string, unknown>; metadata?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({
      error: 'invalid_request',
      message: 'Invalid JSON body'
    } as AMPError, { status: 400 })
  }

  // Update allowed fields
  const updates: Record<string, unknown> = {}
  if (body.alias !== undefined) {
    updates.label = body.alias
  }

  // Merge delivery and metadata into agent's amp metadata
  if (body.delivery !== undefined || body.metadata !== undefined) {
    const existingAmpMeta = (agent.metadata?.amp || {}) as Record<string, unknown>
    if (body.delivery !== undefined) {
      existingAmpMeta.delivery = { ...(existingAmpMeta.delivery as Record<string, unknown> || {}), ...body.delivery }
    }
    updates.metadata = {
      ...agent.metadata,
      amp: existingAmpMeta,
      ...(body.metadata || {})
    }
  }

  if (Object.keys(updates).length > 0) {
    updateAgent(auth.agentId!, updates as any)
  }

  return NextResponse.json({
    updated: true,
    address: auth.address,
  })
}

/**
 * DELETE /api/v1/agents/me — Deregister current agent
 */
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return NextResponse.json({
      error: auth.error || 'unauthorized',
      message: auth.message || 'Authentication required'
    } as AMPError, { status: 401 })
  }

  // Revoke all API keys for this agent
  revokeAllKeysForAgent(auth.agentId!)

  // Delete agent from registry
  const deleted = deleteAgent(auth.agentId!)
  if (!deleted) {
    return NextResponse.json({
      error: 'not_found',
      message: 'Agent not found'
    } as AMPError, { status: 404 })
  }

  return NextResponse.json({
    deregistered: true,
    address: auth.address,
    deregistered_at: new Date().toISOString(),
  })
}
