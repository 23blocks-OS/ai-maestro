/**
 * POST /api/people-devices/:deviceId/key/approve — { keyId }  the operator approves the device's signing key
 * POST /api/people-devices/:deviceId/key/revoke  — { keyId }  revoke it (for good: the device needs a new key)
 */

import { NextRequest } from 'next/server'
import { setDeviceKey } from '@/services/person-devices-service'
import { toResponse } from '@/app/api/_helpers'
import { notFound } from '@/services/service-errors'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ deviceId: string; action: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  const { deviceId, action } = await params
  if (action !== 'approve' && action !== 'revoke') return toResponse(notFound('Action', action))
  const parsed = await request.json().catch(() => ({}))
  const body = parsed && typeof parsed === 'object' ? parsed : {}
  return toResponse(setDeviceKey(deviceId, body, action === 'approve' ? 'active' : 'revoked'))
}
