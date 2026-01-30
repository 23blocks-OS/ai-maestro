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
import {
  getAllMarketplaceSkills,
  hasClaudePlugins,
} from '@/lib/marketplace-skills'
import type { SkillSearchParams } from '@/types/marketplace'

export async function GET(request: NextRequest) {
  try {
    // Check if Claude plugins directory exists
    const hasPlugins = await hasClaudePlugins()
    if (!hasPlugins) {
      return NextResponse.json(
        {
          skills: [],
          marketplaces: [],
          stats: {
            totalSkills: 0,
            totalMarketplaces: 0,
            totalPlugins: 0,
          },
          warning: 'Claude Code plugins directory not found. Install Claude Code and add some marketplaces.',
        },
        { status: 200 }
      )
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const params: SkillSearchParams = {
      marketplace: searchParams.get('marketplace') || undefined,
      plugin: searchParams.get('plugin') || undefined,
      category: searchParams.get('category') || undefined,
      search: searchParams.get('search') || undefined,
      includeContent: searchParams.get('includeContent') === 'true',
    }

    // Get all skills
    const result = await getAllMarketplaceSkills(params)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching marketplace skills:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch marketplace skills',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
