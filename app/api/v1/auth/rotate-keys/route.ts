/**
 * AMP v1 Keypair Rotation
 *
 * POST /api/v1/auth/rotate-keys — Rotate the agent's Ed25519 keypair
 *
 * Generates a new Ed25519 keypair for the authenticated agent,
 * replacing the old one. The old public key is no longer valid
 * for signature verification.
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/amp-auth'
import { generateKeyPair, saveKeyPair } from '@/lib/amp-keys'
import { getAgent, updateAgent } from '@/lib/agent-registry'
import type { AMPError } from '@/lib/types/amp'

export async function POST(request: NextRequest) {
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

  // Generate new keypair and save to disk
  const newKeyPair = await generateKeyPair()
  saveKeyPair(auth.agentId!, newKeyPair)

  // Update agent metadata with new fingerprint
  const existingAmpMeta = (agent.metadata?.amp || {}) as Record<string, unknown>
  existingAmpMeta.fingerprint = newKeyPair.fingerprint
  updateAgent(auth.agentId!, {
    metadata: {
      ...agent.metadata,
      amp: existingAmpMeta,
    }
  } as any)

  return NextResponse.json({
    rotated: true,
    address: auth.address,
    fingerprint: newKeyPair.fingerprint,
    public_key: newKeyPair.publicPem,
    key_algorithm: 'Ed25519',
  })
}
