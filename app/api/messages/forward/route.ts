import { NextRequest } from 'next/server'
import { forwardMessage } from '@/services/messages-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await forwardMessage(body)
  return toResponse(result)
}
