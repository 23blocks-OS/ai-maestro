import { NextRequest, NextResponse } from 'next/server'
import { listAllGroups, createNewGroup } from '@/services/groups-service'

// Force dynamic -- reads runtime filesystem state (group registry)
export const dynamic = 'force-dynamic'

// GET /api/groups - List all groups
export async function GET() {
  const result = listAllGroups()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

// POST /api/groups - Create a new group
// No governance/authentication checks -- groups are open
export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, description, subscriberIds } = body

  const result = await createNewGroup({ name, description, subscriberIds })
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
