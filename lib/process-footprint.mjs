import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export function parseFootprint(summary) {
  const match = summary.match(/^Physical footprint:\s+([\d.]+)([KMGT])\s*$/m)
  if (!match) throw new Error('vmmap did not report a physical footprint')
  return Number(match[1]) * 1024 ** ('KMGT'.indexOf(match[2]) + 1)
}

// RSS misses compressed/swapped allocations on macOS. Never confuse a failed
// footprint sample with a trustworthy zero; callers keep their previous sample.
export async function processFootprint(pid = process.pid) {
  if (process.platform !== 'darwin') {
    if (pid !== process.pid) throw new Error('Remote RSS sampling is not supported')
    return process.memoryUsage().rss
  }
  const { stdout } = await run('/usr/bin/vmmap', ['-summary', String(pid)], {
    timeout: 3000, maxBuffer: 256 * 1024,
  })
  return parseFootprint(stdout)
}
