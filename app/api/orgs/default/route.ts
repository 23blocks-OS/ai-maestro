/**
 * GET /api/orgs/default — the default organization of this host ("personal" until changed)
 * PUT /api/orgs/default — set it { id }: agents and cards with no organization of their own are shown under it
 */

import { NextRequest } from 'next/server'
import { getDefault, setDefault } from '@/services/orgs-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  return toResponse(getDefault())
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(setDefault(body))
}
