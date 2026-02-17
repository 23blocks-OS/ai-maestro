/**
 * Marketplace Service
 *
 * Pure business logic extracted from app/api/marketplace/** routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET  /api/marketplace/skills        -> listMarketplaceSkills
 *   GET  /api/marketplace/skills/[id]   -> getMarketplaceSkillById
 */

import {
  getAllMarketplaceSkills,
  hasClaudePlugins,
  getSkillById,
} from '@/lib/marketplace-skills'
import type { SkillSearchParams } from '@/types/marketplace'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number  // HTTP-like status code for the route to use
}

// ===========================================================================
// PUBLIC API -- called by API routes
// ===========================================================================

/**
 * List all skills from all marketplaces with optional filters.
 */
export async function listMarketplaceSkills(params: SkillSearchParams): Promise<ServiceResult<any>> {
  try {
    // Check if Claude plugins directory exists
    const hasPlugins = await hasClaudePlugins()
    if (!hasPlugins) {
      return {
        data: {
          skills: [],
          marketplaces: [],
          stats: {
            totalSkills: 0,
            totalMarketplaces: 0,
            totalPlugins: 0,
          },
          warning: 'Claude Code plugins directory not found. Install Claude Code and add some marketplaces.',
        },
        status: 200,
      }
    }

    // Get all skills
    const result = await getAllMarketplaceSkills(params)
    return { data: result, status: 200 }
  } catch (error) {
    console.error('Error fetching marketplace skills:', error)
    return {
      error: 'Failed to fetch marketplace skills',
      status: 500,
    }
  }
}

/**
 * Get a single skill by ID (format: marketplace:plugin:skill).
 */
export async function getMarketplaceSkillById(rawId: string): Promise<ServiceResult<any>> {
  try {
    // Decode the skill ID (may be URL encoded)
    const skillId = decodeURIComponent(rawId)

    // Validate format
    const parts = skillId.split(':')
    if (parts.length !== 3) {
      return {
        error: 'Invalid skill ID format. Skill ID must be in format: marketplace:plugin:skill',
        status: 400,
      }
    }

    // Get the skill with full content
    const skill = await getSkillById(skillId, true)

    if (!skill) {
      return { error: 'Skill not found', status: 404 }
    }

    return { data: skill, status: 200 }
  } catch (error) {
    console.error('Error fetching skill:', error)
    return {
      error: 'Failed to fetch skill',
      status: 500,
    }
  }
}
