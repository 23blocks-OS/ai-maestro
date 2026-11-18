/**
 * The dashboard on an HTTPS address (Tailscale serve, for the meeting microphone) cannot call other hosts over
 * plain HTTP: the browser blocks it ("mixed content"), so an agent's canvas, memory, docs and the other per-agent
 * panels failed for agents on another computer. On HTTPS, a call to another host's /api/agents/<agent id>/... goes
 * to this page's own host instead, which forwards it to the agent's host server to server (server.mjs).
 */
const AGENT_PATH = /^\/api\/agents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/|$)/i

/** The same-origin URL for a plain-HTTP call to another host's agent route, or null to leave the call alone */
export function sameOriginFor(url: string, pageProtocol: string, pageOrigin: string): string | null {
  if (pageProtocol !== 'https:' || !url.startsWith('http://')) return null
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.origin === pageOrigin || !AGENT_PATH.test(u.pathname)) return null
  return u.pathname + u.search
}

/** Installs the redirect once, in the browser */
export function installHttpsAgentCalls(): void {
  if (typeof window === 'undefined' || window.location.protocol !== 'https:') return
  const w = window as Window & { __aimHttpsAgentCalls?: boolean }
  if (w.__aimHttpsAgentCalls) return
  w.__aimHttpsAgentCalls = true
  const original = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const local = sameOriginFor(url, window.location.protocol, window.location.origin)
    if (!local) return original(input, init)
    return typeof input === 'string' || input instanceof URL ? original(local, init) : original(new Request(local, input), init)
  }
}

/**
 * The same rule for a picture or video address (an <img> or <video> src cannot go through fetch): on an HTTPS page,
 * another host's /api/agents/<agent id>/... is loaded from this page's own host, which forwards it.
 */
export function agentMediaUrl(url: string): string {
  if (typeof window === 'undefined') return url
  return sameOriginFor(url, window.location.protocol, window.location.origin) ?? url
}
