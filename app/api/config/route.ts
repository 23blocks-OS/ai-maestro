import { NextRequest, NextResponse } from 'next/server'
import { getSystemConfig } from '@/services/config-service'
import { updateSystemSettings, type SystemSettings } from '@/lib/system-settings'

export async function GET() {
  try {
    const result = getSystemConfig()
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('[Config] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const patch: Partial<SystemSettings> = {}

    if (typeof body.conversationIndexerEnabled === 'boolean') {
      patch.conversationIndexerEnabled = body.conversationIndexerEnabled
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid settings provided' }, { status: 400 })
    }

    const updated = updateSystemSettings(patch)
    return NextResponse.json({ success: true, settings: updated })
  } catch (error) {
    console.error('[Config PATCH] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
