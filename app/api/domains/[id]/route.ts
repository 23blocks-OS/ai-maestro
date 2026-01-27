import { NextResponse } from 'next/server'
import { getDomain, deleteDomain, updateDomain } from '@/lib/domain-service'

/**
 * GET /api/domains/[id]
 * Get a single domain by ID
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const domain = getDomain(params.id)

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ domain })
  } catch (error) {
    console.error('Failed to get domain:', error)
    return NextResponse.json(
      { error: 'Failed to get domain' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/domains/[id]
 * Update a domain (description or isDefault)
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const domain = updateDomain(params.id, {
      description: body.description,
      isDefault: body.isDefault,
    })

    if (!domain) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ domain })
  } catch (error) {
    console.error('Failed to update domain:', error)
    return NextResponse.json(
      { error: 'Failed to update domain' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/domains/[id]
 * Delete a domain
 */
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const success = deleteDomain(params.id)

    if (!success) {
      return NextResponse.json(
        { error: 'Domain not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete domain:', error)
    return NextResponse.json(
      { error: 'Failed to delete domain' },
      { status: 500 }
    )
  }
}
