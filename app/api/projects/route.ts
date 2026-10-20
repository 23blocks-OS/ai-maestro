/**
 * GET  /api/projects  — projects stored on this host (?assignee=<agentId>: only those with cards for that agent, and the cards)
 * POST /api/projects  — create one { name, description?, ownerAgentId? }; the owner must be an agent on this host
 */

import { NextRequest } from 'next/server'
import { listProjects, createProject } from '@/services/projects-service'
import { toResponse } from '@/app/api/_helpers'

// Reads files that change: never prerendered
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  return toResponse(listProjects({ assignee: url.searchParams.get('assignee') || undefined }))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return toResponse(createProject(body))
}
