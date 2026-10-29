/**
 * GET /api/people-devices  — apps paired to this host, with an online flag (?personId= filters)
 */

import { NextRequest } from 'next/server'
import { listDevices } from '@/services/person-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  return toResponse(listDevices({ personId: request.nextUrl.searchParams.get('personId') }))
}
