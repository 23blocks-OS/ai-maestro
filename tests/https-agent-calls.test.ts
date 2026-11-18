import { describe, it, expect } from 'vitest'
import { sameOriginFor } from '@/lib/https-agent-calls'

const AGENT = '11111111-2222-4333-8444-555555555555'
const PAGE = 'https://dashboard.example.ts.net'

describe('the dashboard on HTTPS reaches agents of other hosts through its own host', () => {
  it('sends a plain-HTTP call to another host\'s agent route to this host', () => {
    expect(sameOriginFor(`http://100.64.0.2:23000/api/agents/${AGENT}/canvas?file=a.html`, 'https:', PAGE)).toBe(`/api/agents/${AGENT}/canvas?file=a.html`)
    expect(sameOriginFor(`http://100.64.0.2:23000/api/agents/${AGENT}`, 'https:', PAGE)).toBe(`/api/agents/${AGENT}`)
  })
  it('leaves everything else alone', () => {
    expect(sameOriginFor(`http://100.64.0.2:23000/api/agents/${AGENT}/canvas`, 'http:', 'http://localhost:23000')).toBeNull() // page on HTTP: works already
    expect(sameOriginFor('http://100.64.0.2:23000/api/hosts/identity', 'https:', PAGE)).toBeNull() // not an agent route
    expect(sameOriginFor('http://100.64.0.2:23000/api/agents/directory', 'https:', PAGE)).toBeNull() // not an agent id
    expect(sameOriginFor(`https://other.example/api/agents/${AGENT}`, 'https:', PAGE)).toBeNull() // already secure
    expect(sameOriginFor(`/api/agents/${AGENT}`, 'https:', PAGE)).toBeNull() // already same origin
  })

  it('a video of another host\'s agent loads from this host on HTTPS (the loops in LiveAvatar)', () => {
    expect(sameOriginFor(`http://100.64.0.2:23000/api/agents/${AGENT}/avatar-loops/idle`, 'https:', PAGE)).toBe(`/api/agents/${AGENT}/avatar-loops/idle`)
  })
})
