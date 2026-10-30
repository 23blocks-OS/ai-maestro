/**
 * PUT    /api/people-devices/:deviceId  — { personId, personName?, deviceName?, platform?, appVersion? }
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
  const body = await request.json().catch(() => ({}))
  return toResponse(pairDevice(deviceId, body))
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { deviceId } = await params
  return toResponse(unpairDevice(deviceId))
}
