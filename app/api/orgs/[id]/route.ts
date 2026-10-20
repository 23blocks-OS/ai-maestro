/**
 * GET    /api/orgs/:id — one organization record
 * PATCH  /api/orgs/:id — change name or description (PUT works too)
 * DELETE /api/orgs/:id — remove the record; agent tags and card labels naming it stay
 */

import { NextRequest } from 'next/server'
import { getOrgById, updateOrg, deleteOrg } from '@/services/orgs-service'
import { toResponse } from '@/app/api/_helpers'

type Ctx = { params: Promise<{ id: string }> }

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  return toResponse(getOrgById(id))
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(updateOrg(id, body))
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(updateOrg(id, body))
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  return toResponse(deleteOrg(id))
}
