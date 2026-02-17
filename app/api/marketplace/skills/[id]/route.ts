/**
 * Single Skill API
 *
 * GET /api/marketplace/skills/:id - Get a single skill by ID
 *
 * Skill ID format: marketplace:plugin:skill
 * Example: claude-plugins-official:code-review:code-review
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getMarketplaceSkillById } from '@/services/marketplace-service'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await getMarketplaceSkillById(id)

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}
