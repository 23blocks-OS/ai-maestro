/**
 * Kill endpoint for Haephestos session — accepts POST from sendBeacon.
 *
 * navigator.sendBeacon() can only send POST requests, so this dedicated
 * endpoint handles cleanup when the browser tab closes (beforeunload).
 * This prevents zombie Haephestos sessions from running indefinitely.
 */

import { NextResponse } from 'next/server'
import { deleteCreationHelper } from '@/services/creation-helper-service'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export const dynamic = 'force-dynamic'

const SESSION_NAME = '_aim-creation-helper'

export async function POST() {
  try {
    // Kill the tmux session directly — this is the most critical action
    // to stop token consumption. The deleteCreationHelper service may
    // do additional cleanup but killing tmux stops Claude immediately.
    await execFileAsync('tmux', ['kill-session', '-t', SESSION_NAME]).catch(() => {})

    // Also run the full service cleanup
    const result = await deleteCreationHelper()
    return NextResponse.json({ killed: true, service: result.data || result.error })
  } catch {
    return NextResponse.json({ killed: true })
  }
}
