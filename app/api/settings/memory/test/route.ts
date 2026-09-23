import { NextRequest } from 'next/server'
import { testMemoryClassifier } from '@/services/memory-settings-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/** POST /api/settings/memory/test — one live classifier call with stored or form values */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(await testMemoryClassifier(body))
}
