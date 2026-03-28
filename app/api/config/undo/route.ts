import { NextResponse } from 'next/server'
import { undo, getStatus } from '@/lib/config-transaction'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await undo()
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }
    const status = getStatus()
    return NextResponse.json({ success: true, description: result.description, ...status })
  } catch (error) {
    console.error('[config/undo] Failed:', error)
    return NextResponse.json({ error: 'Undo failed' }, { status: 500 })
  }
}
