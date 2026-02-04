import { NextResponse } from 'next/server'
import {
  getOrganizationInfo,
  setOrganization,
  isValidOrganizationName,
} from '@/lib/hosts-config'

/**
 * GET /api/organization
 *
 * Returns the current organization configuration.
 * Used to check if organization is set before showing onboarding.
 */
export async function GET() {
  const info = getOrganizationInfo()

  return NextResponse.json({
    organization: info.organization,
    setAt: info.setAt,
    setBy: info.setBy,
    isSet: info.organization !== null,
  })
}

/**
 * POST /api/organization
 *
 * Set the organization name. Can only be done once.
 * This is typically called during initial setup.
 *
 * Body: { organization: string, setBy?: string }
 *
 * When joining an existing network, setBy can be provided to credit
 * the original host that established the organization.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { organization, setBy } = body

    // Validate presence
    if (!organization || typeof organization !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: 'Organization name is required',
        },
        { status: 400 }
      )
    }

    // Normalize to lowercase and trim
    const normalizedName = organization.toLowerCase().trim()

    // Validate format
    if (!isValidOrganizationName(normalizedName)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid organization name. Must be 1-63 lowercase characters (letters, numbers, hyphens). Must start with a letter and cannot start/end with a hyphen.',
          examples: ['acme-corp', 'mycompany', 'team-alpha'],
        },
        { status: 400 }
      )
    }

    // Attempt to set (pass setBy if provided, e.g., when joining existing network)
    const result = setOrganization(normalizedName, setBy)

    if (!result.success) {
      // Check if it's because org is already set
      const currentInfo = getOrganizationInfo()
      if (currentInfo.organization) {
        return NextResponse.json(
          {
            success: false,
            error: result.error,
            currentOrganization: currentInfo.organization,
          },
          { status: 409 } // Conflict
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 400 }
      )
    }

    // Return success with the new organization info
    const newInfo = getOrganizationInfo()
    return NextResponse.json({
      success: true,
      organization: newInfo.organization,
      setAt: newInfo.setAt,
      setBy: newInfo.setBy,
    })
  } catch (error) {
    console.error('[Organization API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}
