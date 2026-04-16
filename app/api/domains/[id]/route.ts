import { getDomainById, updateDomainById, deleteDomainById } from '@/services/domains-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/domains/[id]
 * Get a single domain by ID
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = getDomainById(id)
  return toResponse(result)
}

/**
 * PATCH /api/domains/[id]
 * Update a domain (description or isDefault)
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const result = updateDomainById(id, body)
  return toResponse(result)
}

/**
 * DELETE /api/domains/[id]
 * Delete a domain
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = deleteDomainById(id)
  return toResponse(result)
}
