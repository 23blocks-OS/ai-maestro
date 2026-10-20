import { describe, it, expect } from 'vitest'
import { agentRoleLine, agentTitle } from '@/lib/agent-role-line'

describe('agentRoleLine', () => {
  it('is "<role> · <company>" from the tags', () => {
    expect(agentRoleLine(['kind:employee', 'org:3metas', 'role:gm'])).toBe('gm · 3metas')
  })
  it('shows what exists when only one tag is there', () => {
    expect(agentRoleLine(['role:web'])).toBe('web')
    expect(agentRoleLine(['org:23blocks'])).toBe('23blocks')
  })
  it('is empty without the tags (an agent that is not in an organization)', () => {
    expect(agentRoleLine(undefined)).toBe('')
    expect(agentRoleLine(['kind:employee', 'frontend'])).toBe('')
  })
  it('uses the first when a tag repeats, and ignores case', () => {
    expect(agentRoleLine(['ORG:Acme', 'org:other', 'Role:CTO'])).toBe('cto · acme')
  })
  it('agentTitle puts the name first', () => {
    expect(agentTitle('Emilia', ['role:gm', 'org:3metas'])).toBe('Emilia · gm · 3metas')
    expect(agentTitle('Emilia', [])).toBe('Emilia')
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AgentHeaderBar from '@/components/AgentHeaderBar'

describe('AgentHeaderBar role line', () => {
  const props = { name: 'Emilia', presence: 'ready' as const }
  it('shows the role and company after the name', () => {
    const html = renderToStaticMarkup(createElement(AgentHeaderBar, { ...props, roleLine: 'gm · 3metas' }))
    expect(html).toContain('Emilia')
    expect(html).toContain('gm · 3metas')
  })
  it('shows nothing extra for an agent without the tags', () => {
    const html = renderToStaticMarkup(createElement(AgentHeaderBar, props))
    expect(html).not.toContain('·')
  })
})
