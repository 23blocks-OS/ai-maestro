import { describe, it, expect } from 'vitest'
import { parseAMPAddress } from '@/lib/types/amp'

describe('parseAMPAddress', () => {
  it('parses a standard AMP address', () => {
    const result = parseAMPAddress('alice@rnd23blocks.aimaestro.local')
    expect(result).toEqual({
      name: 'alice',
      organization: 'rnd23blocks',
      provider: 'aimaestro.local',
      full: 'alice@rnd23blocks.aimaestro.local',
    })
  })

  it('parses external provider address', () => {
    const result = parseAMPAddress('carol@acme.crabmail.ai')
    expect(result).toEqual({
      name: 'carol',
      organization: 'acme',
      provider: 'crabmail.ai',
      full: 'carol@acme.crabmail.ai',
    })
  })

  it('returns null for bare name without @', () => {
    expect(parseAMPAddress('alice')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseAMPAddress('')).toBeNull()
  })

  it('returns null for address without domain', () => {
    expect(parseAMPAddress('alice@')).toBeNull()
  })

  it('parses single-part domain address (e.g., agent@localhost)', () => {
    // "alice@local" has only 1 part after @, treated as organization with provider='local'
    const result = parseAMPAddress('alice@local')
    expect(result).toEqual({
      name: 'alice',
      organization: 'local',
      provider: 'local',
      full: 'alice@local',
    })
  })

  it('parses agent@localhost address', () => {
    const result = parseAMPAddress('agent@localhost')
    expect(result).toEqual({
      name: 'agent',
      organization: 'localhost',
      provider: 'local',
      full: 'agent@localhost',
    })
  })

  it('handles hyphenated agent names', () => {
    const result = parseAMPAddress('backend-architect@myorg.aimaestro.local')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('backend-architect')
    expect(result!.organization).toBe('myorg')
  })

  it('handles complex provider domains', () => {
    const result = parseAMPAddress('agent@org.provider.domain')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('agent')
    expect(result!.organization).toBe('org')
    expect(result!.provider).toBe('provider.domain')
  })
})
