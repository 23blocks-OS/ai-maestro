import { NextResponse } from 'next/server'
import { getActivity } from '@/services/sessions-service'

// Disable caching - this endpoint reads from global state that changes frequently
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const activity = await getActivity()
    return NextResponse.json({ activity })
  } catch (error) {
    console.error('Failed to fetch activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity', activity: {} },
      { status: 500 }
    )
  }
}
