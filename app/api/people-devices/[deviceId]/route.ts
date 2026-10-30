/**
 * PUT    /api/people-devices/:deviceId  — { personId, personName?, deviceName?, platform?, appVersion?, pushToken?, pushTypes? }
 *                                         "this app is person X". Send again every ~30 s as a heartbeat.
 * DELETE /api/people-devices/:deviceId  — unpair
 */

import { NextRequest } from 'next/server'
import { pairDevice, unpairDevice } from '@/services/person-devices-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ deviceId: string }> }

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { deviceId } = await params
  // A JSON null or number is not a body: treat it as empty rather than failing with a 500
  const parsed = await request.json().catch(() => ({}))
  const body = parsed && typeof parsed === 'object' ? parsed : {}
  return toResponse(pairDevice(deviceId, body))
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { deviceId } = await params
  return toResponse(unpairDevice(deviceId))
}
