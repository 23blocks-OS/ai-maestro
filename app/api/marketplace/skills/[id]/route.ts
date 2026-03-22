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
  { params }: { params: { id: string } }
) {
  const { id } = await params
  // Validate skill ID: reject excessively long or control-character-containing IDs
  if (!id || id.length > 200 || /[\x00-\x1f]/.test(id)) {
    return NextResponse.json({ error: 'Invalid skill ID format' }, { status: 400 })
  }
  const result = await getMarketplaceSkillById(id)

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}
