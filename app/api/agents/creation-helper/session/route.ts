/**
 * Creation Helper Session API
 *
 * POST   /api/agents/creation-helper/session - Start creation helper agent
 * DELETE /api/agents/creation-helper/session - Kill creation helper agent
 * GET    /api/agents/creation-helper/session - Check creation helper status
 */

import { NextResponse } from 'next/server'
import {
  createCreationHelper,
  deleteCreationHelper,
  getCreationHelperStatus,
} from '@/services/creation-helper-service'

export async function POST() {
  try {
    const result = await createCreationHelper()
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[CreationHelper] POST session error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const result = await deleteCreationHelper()
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[CreationHelper] DELETE session error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const result = await getCreationHelperStatus()
    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[CreationHelper] GET session error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
