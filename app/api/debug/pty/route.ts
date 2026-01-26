import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

// Disable Next.js caching for this endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/debug/pty
 *
 * Returns PTY usage statistics for monitoring and debugging PTY leaks.
 * Useful for diagnosing issue #104 (PTY handle leak).
 */
export async function GET() {
  try {
    // Get session data from server.mjs internal endpoint
    // (Next.js API routes run in a separate process and can't access server.mjs globals)
    let aiMaestroData = { activeSessions: 0, sessions: [] }
    try {
      const internalResponse = await fetch('http://127.0.0.1:23000/api/internal/pty-sessions', {
        cache: 'no-store'
      })
      if (internalResponse.ok) {
        aiMaestroData = await internalResponse.json()
      }
    } catch (e) {
      // Internal endpoint may not be available during startup
    }

    // Get system PTY info (macOS specific)
    let systemPtyCount = 0
    let ptyLimit = 511 // Default macOS limit
    let ptyProcesses: { command: string; count: number }[] = []

    try {
      // Get PTY limit
      const limitOutput = execSync('sysctl -n kern.tty.ptmx_max 2>/dev/null || echo 511', { encoding: 'utf8' })
      ptyLimit = parseInt(limitOutput.trim()) || 511

      // Count PTY devices in use
      const ptyCountOutput = execSync('ls /dev/ttys* 2>/dev/null | wc -l', { encoding: 'utf8' })
      systemPtyCount = parseInt(ptyCountOutput.trim()) || 0

      // Get processes holding PTYs
      const lsofOutput = execSync(
        "lsof /dev/ttys* 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -10",
        { encoding: 'utf8' }
      )
      ptyProcesses = lsofOutput
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const match = line.trim().match(/^(\d+)\s+(.+)$/)
          if (match) {
            return { count: parseInt(match[1]), command: match[2] }
          }
          return null
        })
        .filter(Boolean) as { command: string; count: number }[]
    } catch (e) {
      // Commands may fail on non-macOS systems
    }

    // Calculate health status
    const usagePercent = (systemPtyCount / ptyLimit) * 100
    let health: 'healthy' | 'warning' | 'critical' = 'healthy'
    if (usagePercent > 80) health = 'critical'
    else if (usagePercent > 60) health = 'warning'

    return NextResponse.json({
      health,
      system: {
        ptyLimit,
        ptyInUse: systemPtyCount,
        usagePercent: Math.round(usagePercent * 10) / 10,
        topProcesses: ptyProcesses
      },
      aiMaestro: aiMaestroData,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Debug PTY] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
