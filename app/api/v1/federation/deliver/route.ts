/**
 * AMP v1 Federation Delivery Endpoint
 *
 * POST /api/v1/federation/deliver — Accept messages from external providers
 *
 * Validates provider identity, verifies message signatures,
 * applies content trust wrapping, and delivers locally.
 */

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { deliver } from '@/lib/message-delivery'
import { getAgent } from '@/lib/agent-registry'
import { resolveAgentIdentifier } from '@/lib/messageQueue'
import { queueMessage } from '@/lib/amp-relay'
import { verifySignature } from '@/lib/amp-keys'
import type { AMPEnvelope, AMPPayload, AMPError } from '@/lib/types/amp'

import fs from 'fs'
import path from 'path'
import os from 'os'

// ============================================================================
// Rate Limiter (in-memory, per-provider)
// ============================================================================

const RATE_LIMIT_MAX = 120 // Higher than route.ts since providers send in bulk
const RATE_LIMIT_WINDOW_MS = 60_000

const federationRateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkFederationRateLimit(providerKey: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = federationRateLimitMap.get(providerKey)

  if (!entry || now > entry.resetAt) {
    federationRateLimitMap.set(providerKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  // Periodic cleanup: remove expired entries every 100 checks
  if (entry.count % 100 === 0) {
    for (const [key, val] of federationRateLimitMap) {
      if (now > val.resetAt) federationRateLimitMap.delete(key)
    }
  }
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count }
}

/** File-based replay protection — survives process restarts */
const FEDERATION_DIR = path.join(os.homedir(), '.aimaestro', 'federation', 'delivered')
let lastCleanup = 0
const CLEANUP_INTERVAL = 3600_000 // 1 hour
const MAX_AGE = 86400_000 // 24 hours

function ensureFederationDir() {
  if (!fs.existsSync(FEDERATION_DIR)) {
    fs.mkdirSync(FEDERATION_DIR, { recursive: true })
  }
}

/** Lazy cleanup of entries older than 24h (runs at most once per hour) */
function cleanupOldEntries() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now

  try {
    const files = fs.readdirSync(FEDERATION_DIR)
    for (const file of files) {
      const filePath = path.join(FEDERATION_DIR, file)
      try {
        const stat = fs.statSync(filePath)
        if (now - stat.mtimeMs > MAX_AGE) {
          fs.unlinkSync(filePath)
        }
      } catch {
        // Ignore individual file errors
      }
    }
  } catch {
    // Directory may not exist yet
  }
}

function trackMessageId(id: string): boolean {
  ensureFederationDir()
  cleanupOldEntries()

  // Use URL-safe base64 of the ID as filename to avoid path issues
  const safeFilename = Buffer.from(id).toString('base64url')
  const filePath = path.join(FEDERATION_DIR, safeFilename)

  if (fs.existsSync(filePath)) {
    return false // Replay detected
  }

  try {
    fs.writeFileSync(filePath, id, 'utf-8')
  } catch {
    // If write fails, allow message through (fail open for delivery)
  }

  return true
}

export async function POST(request: NextRequest) {
  try {
    // ── Provider Identity ───────────────────────────────────────────────
    const providerName = request.headers.get('X-AMP-Provider')
    // Future: validate provider signature and timestamp for provider-level auth
    // const providerSignature = request.headers.get('X-AMP-Signature')
    // const providerTimestamp = request.headers.get('X-AMP-Timestamp')

    if (!providerName) {
      return NextResponse.json({
        error: 'missing_header',
        message: 'X-AMP-Provider header is required'
      } as AMPError, { status: 400 })
    }

    // ── Rate Limiting (per-provider) ─────────────────────────────────────
    const rateLimit = checkFederationRateLimit(providerName)
    if (!rateLimit.allowed) {
      return NextResponse.json({
        error: 'rate_limited',
        message: 'Federation rate limit exceeded'
      } as AMPError, { status: 429, headers: { 'Retry-After': '60' } })
    }

    // ── Body Parsing ────────────────────────────────────────────────────
    const body = await request.json()
    const { envelope, payload, sender_public_key } = body as {
      envelope: AMPEnvelope
      payload: AMPPayload
      sender_public_key?: string
    }

    if (!envelope || !payload) {
      return NextResponse.json({
        error: 'invalid_request',
        message: 'envelope and payload are required'
      } as AMPError, { status: 400 })
    }

    // ── Replay Protection ───────────────────────────────────────────────
    if (!trackMessageId(envelope.id)) {
      return NextResponse.json({
        error: 'duplicate_message',
        message: `Message ${envelope.id} has already been delivered`
      } as AMPError, { status: 409 })
    }

    // ── Message Signature Verification ──────────────────────────────────
    let signatureVerified = false
    if (envelope.signature && sender_public_key) {
      try {
        const payloadHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('base64')

        const signatureData = [
          envelope.from, envelope.to, envelope.subject,
          envelope.priority || 'normal', envelope.in_reply_to || '', payloadHash
        ].join('|')

        signatureVerified = verifySignature(signatureData, envelope.signature, sender_public_key)
      } catch {
        console.warn(`[Federation] Signature verification failed for ${envelope.id}`)
      }
    }

    // ── Recipient Resolution ────────────────────────────────────────────
    // Use rich resolution: exact name → UUID → alias → session → partial match
    // Content security wrapping is handled by deliver() via applyContentSecurity() —
    // no manual wrapping here to avoid double-wrapping.
    const recipientName = envelope.to.split('@')[0]
    const resolved = resolveAgentIdentifier(recipientName)
    const localAgent = resolved?.agentId ? getAgent(resolved.agentId) : null

    if (!localAgent) {
      if (resolved?.agentId) {
        // Agent UUID known via resolution but not currently registered locally — queue for relay
        queueMessage(resolved.agentId, envelope, payload, sender_public_key || '')
        return NextResponse.json({
          id: envelope.id,
          status: 'queued',
          method: 'relay',
          queued_at: new Date().toISOString(),
        })
      }
      // No match via any resolution method
      return NextResponse.json({
        error: 'not_found',
        message: `Recipient '${recipientName}' not found on any host`
      } as AMPError, { status: 404 })
    }

    // ── Local Delivery ──────────────────────────────────────────────────
    // deliver() applies content security based on senderPublicKeyHex (verified vs unverified)
    await deliver({
      envelope,
      payload,
      recipientAgentName: localAgent.name || recipientName,
      senderPublicKeyHex: signatureVerified ? sender_public_key : undefined,
      senderName: envelope.from.split('@')[0],
      senderHost: providerName,
      recipientAgentId: localAgent.id,
      subject: envelope.subject,
      priority: envelope.priority,
      messageType: payload.type,
    })

    return NextResponse.json({
      id: envelope.id,
      status: 'delivered',
      method: 'local',
      delivered_at: new Date().toISOString(),
    })

  } catch (error) {
    console.error('[Federation] Error:', error)
    return NextResponse.json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Internal server error'
    } as AMPError, { status: 500 })
  }
}
