import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AgentIdentityLine from '@/components/AgentIdentityLine'

// The components use JSX; Next compiles it, vitest's transform needs React in scope
;(globalThis as any).React = React

const html = (props: any) => renderToStaticMarkup(createElement(AgentIdentityLine, props))

describe('AgentIdentityLine (the mobile chat\'s folder and address)', () => {
  it('shows the folder with the home directory as ~, then the address', () => {
    const out = html({ workingDirectory: '/Users/me/agents/3m-web', address: '3m-web@rnd23blocks.aimaestro.local' })
    expect(out).toContain('~/agents/3m-web')
    expect(out).toContain('3m-web@rnd23blocks.aimaestro.local')
    expect(out.indexOf('~/agents/3m-web')).toBeLessThan(out.indexOf('3m-web@rnd23blocks'))
  })

  it('leaves out whatever is unknown, and the whole line when both are', () => {
    expect(html({ address: 'a@b.aimaestro.local' })).not.toContain('~')
    expect(html({ workingDirectory: '/home/me/x' })).not.toContain('@')
    expect(html({})).toBe('')
    expect(html({ workingDirectory: null, address: null })).toBe('')
  })

  it('truncates rather than wraps: long values cannot push the layout sideways', () => {
    const out = html({ workingDirectory: '/Users/me/' + 'deep/'.repeat(20), address: 'x'.repeat(80) + '@h.aimaestro.local' })
    expect(out).toContain('truncate')
    expect(out).not.toContain('whitespace-normal')
  })
})

describe('the mobile and tablet dashboards hand the agent\'s folder and address to the chat', () => {
  for (const file of ['components/MobileDashboard.tsx', 'components/TabletDashboard.tsx']) {
    it(file, () => {
      const src = fs.readFileSync(path.join(process.cwd(), file), 'utf-8')
      const block = src.slice(src.indexOf('<MobileChatView'), src.indexOf('/>', src.indexOf('<MobileChatView')))
      expect(block).toContain('workingDirectory=')
      expect(block).toContain('address={primaryAmpAddress(')
    })
  }
})
