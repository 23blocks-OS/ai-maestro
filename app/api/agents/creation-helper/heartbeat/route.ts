/**
 * Heartbeat endpoint for Haephestos session watchdog.
 *
 * The agent-creation page sends a POST every 30s to keep the session alive.
 * If no heartbeat is received for 2 minutes, the watchdog kills the session
 * to prevent zombie sessions from consuming tokens indefinitely.
 */

import { NextResponse } from 'next/server'
import { heartbeatCreationHelper } from '@/services/creation-helper-service'

export const dynamic = 'force-dynamic'

export async function POST() {
  heartbeatCreationHelper()
  return NextResponse.json({ ok: true })
}
