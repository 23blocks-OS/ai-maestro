/**
 * Who a mail is from, and whether the receiving server vouched for it.
 *
 * Three classes (see docs/EMAIL-BRIDGE-TRUST-SPLIT-SPEC.md):
 *   trusted  - the sender is on the allowlist (operator addresses) AND our own mail server's authentication passed: wakes the agent
 *   company  - the sender's domain is a company domain AND authentication passed: goes into the digest, labelled, never a wake
 *   spoofed  - the sender claims the allowlist or a company domain but authentication did not pass
 *   external - everyone else
 *
 * Authentication is read ONLY from an Authentication-Results header that carries our server's
 * authserv-id, the topmost such header. Anything the sender wrote into other headers, or into an
 * Authentication-Results header naming another server, counts for nothing.
 */

import { getDomain } from 'tldts'

export type TrustClass = 'trusted' | 'company' | 'spoofed' | 'external'

export interface Header { name: string; value: string }

/** Split a raw RFC 822 header block into headers, top first, with folded lines joined. */
export function parseHeaderBlock(raw: string): Header[] {
  const out: Header[] = []
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  for (const line of lines) {
    if (line === '') break // end of the header block
    if (/^[ \t]/.test(line) && out.length > 0) {
      out[out.length - 1].value += ' ' + line.trim()
      continue
    }
    const i = line.indexOf(':')
    if (i <= 0) continue
    out.push({ name: line.slice(0, i).trim().toLowerCase(), value: line.slice(i + 1).trim() })
  }
  return out
}

export interface AuthResults {
  authservId: string
  dmarc?: { result: string; headerFrom?: string }
  dkim: Array<{ result: string; d?: string }>
  spf?: { result: string; mailfrom?: string }
}

/** Remove comments "(...)" which Authentication-Results allows anywhere. */
function stripComments(s: string): string {
  let prev = ''
  let cur = s
  while (prev !== cur) { prev = cur; cur = cur.replace(/\([^()]*\)/g, ' ') }
  return cur
}

/**
 * Parse one Authentication-Results value (RFC 8601): "<authserv-id> [version]; method=result prop.x=y; ...".
 */
export function parseAuthenticationResults(value: string): AuthResults | null {
  const parts = stripComments(value).split(';').map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return null
  const id = parts[0].split(/\s+/)[0].toLowerCase()
  if (!id || id.includes('=')) return null
  const out: AuthResults = { authservId: id, dkim: [] }
  for (const seg of parts.slice(1)) {
    const m = /^([a-z0-9-]+)\s*=\s*([a-z0-9-]+)/i.exec(seg)
    if (!m) continue
    const method = m[1].toLowerCase()
    const result = m[2].toLowerCase()
    const prop = (key: string) => new RegExp(`\\b${key.replace('.', '\\.')}\\s*=\\s*("[^"]*"|[^\\s;]+)`, 'i').exec(seg)?.[1]?.replace(/^"|"$/g, '')
    if (method === 'dmarc') out.dmarc = { result, headerFrom: prop('header.from') }
    else if (method === 'dkim') out.dkim.push({ result, d: prop('header.d') })
    else if (method === 'spf' && !out.spf) out.spf = { result, mailfrom: prop('smtp.mailfrom') }
  }
  return out
}

/** The topmost Authentication-Results header that names our server, parsed; null when there is none. */
export function ourAuthResults(headers: Header[], authservId: string): AuthResults | null {
  if (!authservId) return null
  for (const h of headers) {
    if (h.name !== 'authentication-results') continue
    const parsed = parseAuthenticationResults(h.value)
    if (parsed && parsed.authservId === authservId.toLowerCase()) return parsed
  }
  return null
}

/** Every authserv-id seen in the headers: the shadow week logs these so the operator can pick ours. */
export function seenAuthservIds(headers: Header[]): string[] {
  const ids: string[] = []
  for (const h of headers) {
    if (h.name !== 'authentication-results') continue
    const p = parseAuthenticationResults(h.value)
    if (p) ids.push(p.authservId)
  }
  return ids
}

/** The organisational domain (public suffix list), or null for an address, a bare suffix or garbage. */
export function orgDomain(host: string | undefined): string | null {
  if (!host) return null
  const h = host.includes('@') ? host.slice(host.lastIndexOf('@') + 1) : host
  return getDomain(h.trim().toLowerCase(), { allowPrivateDomains: false })
}

export function aligned(a: string | undefined, b: string | undefined): boolean {
  const x = orgDomain(a)
  const y = orgDomain(b)
  return x !== null && y !== null && x === y
}

export type AuthVia = 'dmarc' | 'dkim' | 'spf'

/** Did our server vouch for this From domain? Returns how, or null. */
export function authenticated(auth: AuthResults | null, fromAddress: string): AuthVia | null {
  if (!auth) return null
  const fromDomain = fromAddress.slice(fromAddress.lastIndexOf('@') + 1)
  if (auth.dmarc?.result === 'pass' && (!auth.dmarc.headerFrom || aligned(auth.dmarc.headerFrom, fromDomain))) return 'dmarc'
  if (auth.dkim.some(d => d.result === 'pass' && aligned(d.d, fromDomain))) return 'dkim'
  if (auth.spf?.result === 'pass' && aligned(auth.spf.mailfrom, fromDomain)) return 'spf'
  return null
}

/** An address on the allowlist: exact address, or "@domain" for exactly that domain (no subdomains). */
export function onAllowlist(fromAddress: string, allowlist: string[]): boolean {
  const addr = fromAddress.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+$/.test(addr)) return false
  const domain = addr.slice(addr.lastIndexOf('@'))
  return allowlist.some(entry => entry === addr || (entry.startsWith('@') && entry === domain))
}

export interface Classification {
  cls: TrustClass
  /** Safe to log: no subject, no body */
  reason: string
  via?: AuthVia
  seenIds: string[]
}

export function classify(
  fromAddress: string,
  headers: Header[],
  cfg: { trustedSenders: string[]; authservId: string; companyDomains?: string[] }
): Classification {
  const seenIds = seenAuthservIds(headers)
  const operator = onAllowlist(fromAddress, cfg.trustedSenders)
  const domain = fromAddress.includes('@') ? fromAddress.slice(fromAddress.lastIndexOf('@') + 1).toLowerCase() : ''
  const company = !operator && /^[^@\s]+@[^@\s]+$/.test(fromAddress.trim()) && (cfg.companyDomains || []).includes(domain)
  if (!operator && !company) return { cls: 'external', reason: 'sender not on the allowlist or a company domain', seenIds }
  const via = authenticated(ourAuthResults(headers, cfg.authservId), fromAddress)
  if (via) {
    return operator
      ? { cls: 'trusted', reason: `allowlisted and authenticated (${via})`, via, seenIds }
      : { cls: 'company', reason: `company domain and authenticated (${via})`, via, seenIds }
  }
  const why = !cfg.authservId ? 'AUTHSERV_ID is not set' : seenIds.includes(cfg.authservId) ? 'authentication did not pass' : 'no Authentication-Results from our server'
  return { cls: 'spoofed', reason: `${operator ? 'allowlisted' : 'company domain'} but not authenticated (${why})`, via: undefined, seenIds }
}
