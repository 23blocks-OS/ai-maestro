import { NextRequest } from 'next/server'
import { listContacts, addContact } from '@/services/contacts-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/** GET /api/contacts — outside addresses the company works with */
export async function GET() {
  return toResponse(listContacts())
}

/** POST /api/contacts — { address, name, avatar?, platform?, ownerName?, addedBy? } */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(addContact(body))
}
