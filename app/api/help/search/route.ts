/**
 * Help Search API Endpoint
 *
 * GET /api/help/search?q=<query>&limit=5&minScore=0.3
 *
 * Performs semantic search over help content (tutorials and glossary).
 * Uses pre-computed embeddings for fast search with cosine similarity.
 */

import { NextRequest, NextResponse } from 'next/server'
import { searchHelp, getHelpSearchStatus } from '@/lib/help-search'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')
    const limitStr = searchParams.get('limit')
    const minScoreStr = searchParams.get('minScore')

    // Check if this is a status request
    if (searchParams.get('status') === 'true') {
      const status = await getHelpSearchStatus()
      return NextResponse.json(status)
    }

    // Validate query parameter
    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameter: q (search query)',
        },
        { status: 400 }
      )
    }

    // Validate query length
    if (query.trim().length < 2) {
      return NextResponse.json(
        {
          success: false,
          error: 'Query must be at least 2 characters',
        },
        { status: 400 }
      )
    }

    // Parse optional parameters
    const limit = limitStr ? parseInt(limitStr, 10) : 5
    const minScore = minScoreStr ? parseFloat(minScoreStr) : 0.3

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 50) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid limit parameter (must be 1-50)',
        },
        { status: 400 }
      )
    }

    // Validate minScore
    if (isNaN(minScore) || minScore < 0 || minScore > 1) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid minScore parameter (must be 0-1)',
        },
        { status: 400 }
      )
    }

    // Perform search
    const startTime = Date.now()
    const results = await searchHelp(query, limit, minScore)
    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      query,
      results,
      count: results.length,
      duration: `${duration}ms`,
    })
  } catch (error) {
    console.error('[Help Search API] Error:', error)

    // Check if it's a missing index error
    if (error instanceof Error && error.message.includes('not available')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Help search index not available. Run `yarn prebuild` to generate it.',
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
