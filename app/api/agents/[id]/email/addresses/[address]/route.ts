import { NextRequest, NextResponse } from 'next/server'
import {
  getEmailAddressDetail,
  updateEmailAddressOnAgent,
  removeEmailAddressFromAgent,
} from '@/services/agents-messaging-service'
import { isValidUuid } from '@/lib/validation'

// SF-047: Basic format validation for email address parameter
// Allows local-part@domain or simple names (alphanumeric, dots, hyphens, underscores)
const ADDRESS_PATTERN = /^[a-zA-Z0-9._@+-]+$/

/**
 * GET /api/agents/[id]/email/addresses/[address]
 * Get a specific email address details
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; address: string }> }
) {
  try {
    const { id, address } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    // SF-047: Validate address format (defense-in-depth)
    if (!ADDRESS_PATTERN.test(address) || address.length > 254) {
      return NextResponse.json({ error: 'Invalid address format' }, { status: 400 })
    }

    const result = getEmailAddressDetail(id, address)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Email Address GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/agents/[id]/email/addresses/[address]
 * Update an email address (displayName, primary, metadata)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; address: string }> }
) {
  try {
    const { id, address } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    // SF-047: Validate address format (defense-in-depth)
    if (!ADDRESS_PATTERN.test(address) || address.length > 254) {
      return NextResponse.json({ error: 'Invalid address format' }, { status: 400 })
    }
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await updateEmailAddressOnAgent(id, address, body)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Email Address PATCH] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/[id]/email/addresses/[address]
 * Remove an email address from an agent
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; address: string }> }
) {
  try {
    const { id, address } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    // SF-047: Validate address format (defense-in-depth)
    if (!ADDRESS_PATTERN.test(address) || address.length > 254) {
      return NextResponse.json({ error: 'Invalid address format' }, { status: 400 })
    }

    const result = await removeEmailAddressFromAgent(id, address)

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Email Address DELETE] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
