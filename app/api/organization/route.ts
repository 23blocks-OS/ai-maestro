import { NextResponse } from 'next/server'
import { getOrganization, setOrganizationName } from '@/services/config-service'

/**
 * GET /api/organization
 * Returns the current organization configuration.
 */
export async function GET() {
  const result = getOrganization()
  return NextResponse.json(result.data, { status: result.status })
}

/**
 * POST /api/organization
 * Set the organization name. Can only be done once.
 * Body: { organization: string, setBy?: string }
 */
export async function POST(request: Request) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { organization, setBy } = body

    const result = setOrganizationName({ organization, setBy })
    // SF-011 fix: Use explicit error check instead of ?? which can swallow errors
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('[Organization API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
