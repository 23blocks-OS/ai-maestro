import { NextResponse } from 'next/server'
import { getOrganization, setOrganizationName } from '@/services/config-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/organization
 * Returns the current organization configuration.
 */
export async function GET() {
  const result = getOrganization()
  return toResponse(result)
}

/**
 * POST /api/organization
 * Set the organization name. Can only be done once.
 * Body: { organization: string, setBy?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { organization, setBy } = body

    const result = setOrganizationName({ organization, setBy })
    return toResponse(result)
  } catch (error) {
    console.error('[Organization API] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
