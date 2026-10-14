import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const list = fs.readFileSync(path.resolve(__dirname, '..', 'components/AgentList.tsx'), 'utf8')

describe('the sidebar row buttons on hover', () => {
  // They used to sit in the flow next to the name. A sleeping agent has the most buttons (star, wake,
  // wake with, companion, profile, delete), took the width the name needs, and lost its name on hover.
  it('float over the right end of the row instead of taking width from the name', () => {
    const m = list.match(/<div\s+data-testid="agent-row-actions"\s+className="([^"]+)"/)
    expect(m).not.toBeNull()
    const cls = m![1]
    expect(cls).toContain('absolute')
    expect(cls).toContain('hidden group-hover/agent:flex')
  })

  it('the old in-flow toolbar is gone', () => {
    expect(list).not.toContain('<div className="hidden group-hover/agent:flex items-center gap-1">')
  })

  it('the row is positioned, so the buttons sit inside it', () => {
    expect(list).toMatch(/cursor-pointer rounded-lg relative overflow-hidden/)
  })
})
