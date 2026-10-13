'use client'

/**
 * Which tools can start on a host (F040 step 4), for the launch panel. One fetch per host, remembered for a
 * minute so opening the wake dialog twice does not run the checks twice. A failure just means "unknown": the
 * panel shows nothing rather than a false warning, and waking still works as before.
 */
import { useEffect, useState } from 'react'
import type { ReadinessReport, ToolReadiness } from '@/lib/tool-readiness'

const TTL_MS = 60_000
const cache = new Map<string, { at: number; report: ReadinessReport }>()
const inflight = new Map<string, Promise<ReadinessReport | null>>()

function load(hostUrl: string): Promise<ReadinessReport | null> {
  const hit = cache.get(hostUrl)
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.report)
  const running = inflight.get(hostUrl)
  if (running) return running
  const url = hostUrl ? `/api/tools/readiness?hostUrl=${encodeURIComponent(hostUrl)}` : '/api/tools/readiness'
  const p = fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<ReadinessReport>) : null))
    .then((report) => {
      if (report && Array.isArray(report.tools)) cache.set(hostUrl, { at: Date.now(), report })
      return report && Array.isArray(report.tools) ? report : null
    })
    .catch(() => null)
    .finally(() => { inflight.delete(hostUrl) })
  inflight.set(hostUrl, p)
  return p
}

export function useToolReadiness(hostUrl?: string): { report: ReadinessReport | null; tool: (id: string) => ToolReadiness | undefined } {
  const key = hostUrl || ''
  const [report, setReport] = useState<ReadinessReport | null>(() => cache.get(key)?.report ?? null)
  useEffect(() => {
    let live = true
    load(key).then((r) => { if (live) setReport(r) })
    return () => { live = false }
  }, [key])
  return { report, tool: (id) => report?.tools.find((t) => t.id === id) }
}
