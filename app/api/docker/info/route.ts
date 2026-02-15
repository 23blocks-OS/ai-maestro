import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const dynamic = 'force-dynamic'

/**
 * GET /api/docker/info
 * Check if Docker is available on this host.
 * Returns { available: boolean, version?: string, error?: string }
 */
export async function GET() {
  try {
    const { stdout } = await execAsync("docker version --format '{{.Server.Version}}'", {
      timeout: 5000,
    })
    const version = stdout.trim().replace(/'/g, '')
    return NextResponse.json({ available: true, version })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Docker not available'
    return NextResponse.json({ available: false, error: message })
  }
}
