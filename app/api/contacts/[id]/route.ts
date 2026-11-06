import { NextRequest } from 'next/server'
import { removeContact } from '@/services/contacts-service'
import { toResponse } from '@/app/api/_helpers'

/** DELETE /api/contacts/:id */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(removeContact(id))
}
