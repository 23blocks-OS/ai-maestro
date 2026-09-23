import { NextRequest } from 'next/server'
import { browseDirectory, browseRemote, createFolder } from '@/services/browse-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET  /api/browse?path=/Users/foo[&host=mac-mini]  — sub-folders, for the folder picker
 * POST /api/browse { parent, name }                   — create a folder ("New folder")
 *
 * Thin wrapper — logic in services/browse-service.ts (also served headless).
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const host = searchParams.get('host')
  const requestedPath = searchParams.get('path')
  if (host) return toResponse(await browseRemote(host, requestedPath))
  return toResponse(browseDirectory(requestedPath))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(createFolder(body?.parent, body?.name))
}
