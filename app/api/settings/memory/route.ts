import { NextRequest } from 'next/server'
import { getMemorySettings, updateMemorySettings, removeMemoryApiKey } from '@/services/memory-settings-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

/** GET /api/settings/memory — classifier settings, API key masked */
export async function GET() {
  return toResponse(getMemorySettings())
}

/** PUT /api/settings/memory — { classifier: { url?, model?, apiKey?, minDurable?, minImportance? } } */
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(updateMemorySettings(body))
}

/** DELETE /api/settings/memory — remove the stored API key */
export async function DELETE() {
  return toResponse(removeMemoryApiKey())
}
