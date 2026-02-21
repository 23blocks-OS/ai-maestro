/**
 * Agent Repos API
 *
 * GET    /api/agents/[id]/repos — Get agent repositories
 * POST   /api/agents/[id]/repos — Add/update repositories
 * DELETE /api/agents/[id]/repos?url=X — Remove a repository
 *
 * Thin wrapper — business logic in services/agents-repos-service.ts
 */

import { NextResponse } from 'next/server'
import { listRepos, updateRepos, removeRepo } from '@/services/agents-repos-service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = listRepos(id)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error getting agent repos:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get repositories' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const result = updateRepos(id, body)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error updating agent repos:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update repositories' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const remoteUrl = searchParams.get('url')

    if (!remoteUrl) {
      return NextResponse.json({ error: 'url parameter required' }, { status: 400 })
    }

    const result = removeRepo(id, remoteUrl)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error removing repo:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove repository' },
      { status: 500 }
    )
  }
}
