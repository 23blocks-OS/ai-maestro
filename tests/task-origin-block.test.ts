import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TaskOriginBlock, { kindLabel } from '@/components/team-meeting/TaskOriginBlock'

const agents = [{ id: 'a1', name: 'agents-web', label: 'Dev' }] as any

describe('TaskOriginBlock', () => {
  it('renders nothing without an origin', () => {
    expect(renderToStaticMarkup(createElement(TaskOriginBlock, { origin: undefined, agents }))).toBe('')
    expect(renderToStaticMarkup(createElement(TaskOriginBlock, { origin: {}, agents }))).toBe('')
  })
  it('shows the agent, repo, note and a link to its conversation', () => {
    const html = renderToStaticMarkup(createElement(TaskOriginBlock, { origin: { agentId: 'a1', hostId: 'h', repo: 'agents-web', note: 'saw it in sync' }, agents }))
    expect(html).toContain('Dev')
    expect(html).toContain('agents-web')
    expect(html).toContain('saw it in sync')
    expect(html).toContain('href="/?agent=a1"')
  })
  it('names the host for an agent this dashboard does not list, and links by id', () => {
    const html = renderToStaticMarkup(createElement(TaskOriginBlock, { origin: { agentId: 'b2c3d4e5-0000', hostId: 'mac-mini' }, agents }))
    expect(html).toContain('b2c3d4e5')
    expect(html).toContain('host mac-mini')
    expect(html).toContain('href="/?agent=b2c3d4e5-0000"')
  })
  it('kindLabel names parked kinds only', () => {
    expect(kindLabel(undefined)).toBeNull()
    expect(kindLabel('task')).toBeNull()
    expect(kindLabel('bug')).toBe('Bug')
  })
})
