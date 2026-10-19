import { describe, it, expect } from 'vitest'
import { classify, parseHeaderBlock, parseAuthenticationResults, onAllowlist, aligned, orgDomain } from '../src/trust.js'
import { AUTHSERV, AR_PASS, AR_FAIL, header } from './helpers.js'

const cfg = { trustedSenders: ['boss@acme.com', '@acme.com'], authservId: AUTHSERV }
const cls = (from: string, ar: string[], c = cfg, extra: string[] = []) => classify(from, parseHeaderBlock(header({ from, ar, extra })), c)

describe('classification (spec tests 1-15)', () => {
  it('1 allowlisted + dmarc=pass from our server -> trusted', () => expect(cls('boss@acme.com', [AR_PASS]).cls).toBe('trusted'))
  it('2 allowlisted + aligned dkim, no dmarc -> trusted', () => {
    const r = cls('boss@acme.com', [`${AUTHSERV}; dkim=pass header.d=acme.com`])
    expect(r.cls).toBe('trusted'); expect(r.via).toBe('dkim')
  })
  it('3 allowlisted + aligned spf -> trusted', () => {
    const r = cls('boss@acme.com', [`${AUTHSERV}; spf=pass smtp.mailfrom=bounce@acme.com`])
    expect(r.cls).toBe('trusted'); expect(r.via).toBe('spf')
  })
  it('4 allowlisted + every method failing -> spoofed', () => expect(cls('boss@acme.com', [AR_FAIL]).cls).toBe('spoofed'))
  it('5 allowlisted + no Authentication-Results at all -> spoofed', () => expect(cls('boss@acme.com', []).cls).toBe('spoofed'))
  it('6 a passing header that names ANOTHER server -> spoofed', () => {
    expect(cls('boss@acme.com', [AR_PASS.replace(AUTHSERV, 'evil.example.net')]).cls).toBe('spoofed')
  })
  it('7 a forged passing header lower down, the real failing one on top -> spoofed (topmost wins)', () => {
    expect(cls('boss@acme.com', [AR_FAIL, AR_PASS]).cls).toBe('spoofed')
  })
  it('8 a forged passing header with a foreign id on top, the real one below -> the one with our id decides', () => {
    expect(cls('boss@acme.com', [AR_PASS.replace(AUTHSERV, 'evil.example.net'), AR_PASS]).cls).toBe('trusted')
    expect(cls('boss@acme.com', [AR_PASS.replace(AUTHSERV, 'evil.example.net'), AR_FAIL]).cls).toBe('spoofed')
  })
  it('9 a look-alike From domain with dkim d=acme.com is not aligned', () => {
    const c = { trustedSenders: ['@acme.com.evil.com'], authservId: AUTHSERV }
    expect(cls('x@acme.com.evil.com', [`${AUTHSERV}; dkim=pass header.d=acme.com`], c).cls).toBe('spoofed')
    expect(aligned('acme.com', 'acme.com.evil.com')).toBe(false)
  })
  it('10 alignment is by organisational domain (public suffix list), not by suffix', () => {
    expect(aligned('mail.acme.co.uk', 'acme.co.uk')).toBe(true)
    expect(aligned('acme.co.uk', 'other.co.uk')).toBe(false)
    expect(orgDomain('co.uk')).toBeNull()
    expect(aligned('co.uk', 'co.uk')).toBe(false)
    expect(aligned('sub.acme.com', 'acme.com')).toBe(true)
  })
  it('11 not allowlisted, passing authentication -> external', () => expect(cls('stranger@other.com', [AR_PASS]).cls).toBe('external'))
  it('12 only the From ADDRESS counts, never the display name', () => {
    // The caller passes the address; a trusted display name on a stranger's address is external
    expect(cls('attacker@evil.com', [AR_PASS], cfg, ['From: "Boss <boss@acme.com>" <attacker@evil.com>']).cls).toBe('external')
  })
  it('13 Reply-To or Sender on the allowlist does not make a stranger trusted', () => {
    expect(cls('attacker@evil.com', [AR_PASS], cfg, ['Reply-To: boss@acme.com', 'Sender: boss@acme.com']).cls).toBe('external')
  })
  it('14 an unparseable Authentication-Results -> not passed', () => {
    expect(cls('boss@acme.com', ['this is not; a header ((']).cls).toBe('spoofed')
    expect(parseAuthenticationResults('=')).toBeNull()
  })
  it('15 an empty AUTHSERV_ID trusts nobody', () => {
    const r = cls('boss@acme.com', [AR_PASS], { trustedSenders: cfg.trustedSenders, authservId: '' })
    expect(r.cls).toBe('spoofed'); expect(r.reason).toContain('AUTHSERV_ID is not set')
  })
})

describe('allowlist and parsing details', () => {
  it('@domain means exactly that domain, not its subdomains; addresses are exact', () => {
    expect(onAllowlist('a@acme.com', ['@acme.com'])).toBe(true)
    expect(onAllowlist('a@mail.acme.com', ['@acme.com'])).toBe(false)
    expect(onAllowlist('A@ACME.COM', ['@acme.com'])).toBe(true)
    expect(onAllowlist('a@acme.com', ['b@acme.com'])).toBe(false)
    expect(onAllowlist('a@b@acme.com', ['@acme.com'])).toBe(false)
    expect(onAllowlist('', ['@acme.com'])).toBe(false)
  })
  it('comments and folded lines in Authentication-Results are handled', () => {
    const raw = `Authentication-Results: ${AUTHSERV} (internal comment (nested) ok);\r\n\tdkim=pass (good signature)\r\n\theader.d=acme.com\r\nFrom: boss@acme.com\r\n\r\n`
    expect(classify('boss@acme.com', parseHeaderBlock(raw), cfg).cls).toBe('trusted')
  })
  it('the header block ends at the blank line: body text cannot add headers', () => {
    const raw = `From: boss@acme.com\r\n\r\nAuthentication-Results: ${AR_PASS}\r\n`
    expect(classify('boss@acme.com', parseHeaderBlock(raw), cfg).cls).toBe('spoofed')
  })
  it('the authserv-ids seen are reported for the shadow week', () => {
    expect(cls('boss@acme.com', [AR_FAIL, AR_PASS.replace(AUTHSERV, 'other.example')]).seenIds).toEqual([AUTHSERV, 'other.example'])
  })
})
