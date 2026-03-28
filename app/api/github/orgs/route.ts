import { NextResponse } from 'next/server'
import { listOrgs } from '@/lib/github-cli'

// GET /api/github/orgs — List organizations
export async function GET() {
  try {
    const orgs = listOrgs()
    return NextResponse.json({ orgs })
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to list orgs: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}
