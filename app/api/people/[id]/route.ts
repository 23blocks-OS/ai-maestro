/**
 * GET    /api/people/:id               — one person stored on this host
 * PATCH  /api/people/:id               — edit fields; { active: true } brings back a deactivated person
 * DELETE /api/people/:id               — deactivate (soft delete); ?purge=1 removes the record
 */

import { NextRequest } from 'next/server'
import { getPersonById, updatePerson, deletePerson } from '@/services/people-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  return toResponse(getPersonById(id))
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(updatePerson(id, body))
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  return toResponse(deletePerson(id, { purge: request.nextUrl.searchParams.get('purge') === '1' }))
}
