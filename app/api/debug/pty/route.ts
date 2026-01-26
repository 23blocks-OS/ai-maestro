import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

/**
 * GET /api/debug/pty
 *
 * Returns PTY usage statistics for monitoring and debugging PTY leaks.
 * Useful for diagnosing issue #104 (PTY handle leak).
 */
export async function GET() {
  try {
    // Get the sessions map from global state
    const sessions = (global as any).terminalSessions as Map<string, any> || new Map()

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

    // Build session info
    const sessionInfo: {
      name: string
      clients: number
      hasPty: boolean
      pid: number | null
      hasCleanupTimer: boolean
    }[] = []

    sessions.forEach((state: any, name: string) => {
      sessionInfo.push({
        name,
        clients: state.clients?.size || 0,
        hasPty: !!state.ptyProcess,
        pid: state.ptyProcess?.pid || null,
        hasCleanupTimer: !!state.cleanupTimer
      })
    })

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
      aiMaestro: {
        activeSessions: sessions.size,
        sessions: sessionInfo
      },
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
