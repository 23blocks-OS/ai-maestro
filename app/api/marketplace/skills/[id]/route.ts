/**
 * Single Skill API
 *
 * GET /api/marketplace/skills/:id - Get a single skill by ID
 *
 * Skill ID format: marketplace:plugin:skill
 * Example: claude-plugins-official:code-review:code-review
 */

import type { NextRequest } from 'next/server'
import { getMarketplaceSkillById } from '@/services/marketplace-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = await getMarketplaceSkillById(id)
  return toResponse(result)
}
