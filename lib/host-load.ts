/**
 * Live load of this host: memory, swap, load averages, cores, and how many
 * agents have a running session. Measured when asked, nothing cached.
 *
 * "Free" memory is what a new process can get without swapping (available),
 * not the operating system's free-page count: macOS and Linux both keep most
 * RAM in cache, so the raw free number reads as a nearly full machine.
 */
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'

export interface HostLoad {
  measuredAt: string
  platform: string
  cores: number
  loadAverage: { m1: number; m5: number; m15: number }
  memory: { totalBytes: number; availableBytes: number }
  swap: { totalBytes: number; usedBytes: number }
  agentsOnline: number
}

const MB = 1024 * 1024

/** `vm.swapusage` prints "total = 3072.00M  used = 2303.25M  free = 768.75M  (encrypted)". */
export function parseSwapUsage(text: string): { totalBytes: number; usedBytes: number } | null {
  const unit = (n: string, u: string) => parseFloat(n) * ({ K: 1024, M: MB, G: 1024 * MB }[u] ?? 1)
  const t = text.match(/total\s*=\s*([\d.]+)([KMG])/)
  const u = text.match(/used\s*=\s*([\d.]+)([KMG])/)
  if (!t || !u) return null
  return { totalBytes: Math.round(unit(t[1], t[2])), usedBytes: Math.round(unit(u[1], u[2])) }
}

/** free + inactive + speculative pages, the memory macOS hands out without paging. */
export function parseVmStatAvailable(text: string): number | null {
  const size = text.match(/page size of (\d+) bytes/)
  if (!size) return null
  const pages = (label: string) => {
    const m = text.match(new RegExp(`^${label}:\\s+(\\d+)`, 'm'))
    return m ? parseInt(m[1], 10) : 0
  }
  return (pages('Pages free') + pages('Pages inactive') + pages('Pages speculative')) * parseInt(size[1], 10)
}

/** Linux: MemAvailable, SwapTotal and SwapFree in kB. */
export function parseMeminfo(text: string): { availableBytes: number | null; swapTotal: number; swapUsed: number } {
  const kb = (k: string) => {
    const m = text.match(new RegExp(`^${k}:\\s+(\\d+)\\s*kB`, 'm'))
    return m ? parseInt(m[1], 10) * 1024 : null
  }
  const swapTotal = kb('SwapTotal') ?? 0
  const swapFree = kb('SwapFree') ?? 0
  return { availableBytes: kb('MemAvailable'), swapTotal, swapUsed: Math.max(0, swapTotal - swapFree) }
}

function run(cmd: string, args: string[]): string | null {
  try { return execFileSync(cmd, args, { encoding: 'utf8', timeout: 3000 }) } catch { return null }
}

export function readHostLoad(agentsOnline: number): HostLoad {
  const [m1, m5, m15] = os.loadavg()
  let available: number | null = null
  let swap = { totalBytes: 0, usedBytes: 0 }

  if (process.platform === 'darwin') {
    const vm = run('vm_stat', [])
    if (vm) available = parseVmStatAvailable(vm)
    const sw = run('sysctl', ['-n', 'vm.swapusage'])
    swap = (sw && parseSwapUsage(sw)) || swap
  } else {
    try {
      const mi = parseMeminfo(fs.readFileSync('/proc/meminfo', 'utf8'))
      available = mi.availableBytes
      swap = { totalBytes: mi.swapTotal, usedBytes: mi.swapUsed }
    } catch { /* fall through to os.freemem */ }
  }

  return {
    measuredAt: new Date().toISOString(),
    platform: process.platform,
    cores: os.cpus().length,
    loadAverage: { m1, m5, m15 },
    memory: { totalBytes: os.totalmem(), availableBytes: available ?? os.freemem() },
    swap,
    agentsOnline,
  }
}
