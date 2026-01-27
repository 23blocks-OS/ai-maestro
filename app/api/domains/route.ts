import { NextResponse } from 'next/server'
import { listDomains, createDomain } from '@/lib/domain-service'
import type { CreateDomainRequest } from '@/types/agent'

/**
 * GET /api/domains
 * List all email domains
 */
export async function GET() {
  try {
    const domains = listDomains()

    return NextResponse.json({ domains })
  } catch (error) {
    console.error('Failed to list domains:', error)
    return NextResponse.json(
      { error: 'Failed to list domains' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/domains
 * Create a new email domain
 *
 * Request body:
 * {
 *   "domain": "example.com",
 *   "description": "Optional description",
 *   "isDefault": false
 * }
 */
export async function POST(request: Request) {
  try {
    const body: CreateDomainRequest = await request.json()

    // Validate required fields
    if (!body.domain) {
      return NextResponse.json(
        { error: 'Domain is required' },
        { status: 400 }
      )
    }

    const domain = createDomain(body)

    return NextResponse.json(
      { domain },
      { status: 201 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create domain'

    if (message.includes('already exists')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }

    if (message.includes('Invalid domain')) {
      return NextResponse.json({ error: message }, { status: 400 })
    }

    console.error('Failed to create domain:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
