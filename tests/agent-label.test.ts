import { describe, it, expect } from 'vitest'
import { labelLookup } from '@/lib/agent-label'

describe('labelLookup', () => {
  const labelOf = labelLookup([
    { name: '3m-gm', alias: 'Emilia' },
    { name: '3m-hr', alias: '3m-hr' },
    { name: 'dup', alias: 'One' },
    { name: 'dup', alias: 'Two' },
  ])

  it('returns the label for a technical name, ignoring case', () => {
    expect(labelOf('3m-gm')).toBe('Emilia')
    expect(labelOf('3M-GM')).toBe('Emilia')
  })
  it('returns nothing when the agent has no label of its own or is unknown', () => {
    expect(labelOf('3m-hr')).toBeUndefined()
    expect(labelOf('nobody')).toBeUndefined()
    expect(labelOf(undefined)).toBeUndefined()
  })
  it('shows the plain name when two agents share a name with different labels', () => {
    expect(labelOf('dup')).toBeUndefined()
  })
})
