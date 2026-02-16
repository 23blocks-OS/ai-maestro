/**
 * Marketplace Skills API
 *
 * GET /api/marketplace/skills - List all skills from all marketplaces
 * GET /api/marketplace/skills?marketplace=X - Filter by marketplace
 * GET /api/marketplace/skills?plugin=X - Filter by plugin
 * GET /api/marketplace/skills?category=X - Filter by category
 * GET /api/marketplace/skills?search=X - Search by name/description
 * GET /api/marketplace/skills?includeContent=true - Include full SKILL.md content
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { listMarketplaceSkills } from '@/services/marketplace-service'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const params = {
    marketplace: searchParams.get('marketplace') || undefined,
    plugin: searchParams.get('plugin') || undefined,
    category: searchParams.get('category') || undefined,
    search: searchParams.get('search') || undefined,
    includeContent: searchParams.get('includeContent') === 'true',
  }

  const result = await listMarketplaceSkills(params)

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json(result.data)
}
