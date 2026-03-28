import { NextResponse } from 'next/server'
import { getStatus } from '@/lib/config-transaction'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json(getStatus())
  } catch (error) {
    console.error('[config/undo-status] Failed:', error)
    return NextResponse.json({ undoCount: 0, redoCount: 0 })
  }
}
