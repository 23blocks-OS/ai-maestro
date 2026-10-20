/**
 * GET  /api/orgs  — organization records stored on this host
 * POST /api/orgs  — create one { name, id?, description? }; id is the agent org: tag value (default: from the name)
 */

import { NextRequest } from 'next/server'
import { listOrgs, createOrg } from '@/services/orgs-service'
import { toResponse } from '@/app/api/_helpers'

// Reads files that change: never prerendered
export const dynamic = 'force-dynamic'

export async function GET() {
  return toResponse(listOrgs())
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(createOrg(body))
}
