import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/ChatView', () => ({ default: (p: any) => createElement('div', { 'data-testid': 'chat', 'data-active': String(p.isActive) }) }))
vi.mock('@/components/TerminalView', () => ({ default: (p: any) => createElement('div', { 'data-testid': 'terminal', 'data-visible': String(p.isVisible) }) }))

const { default: ChatTerminalSwitch, readViewChoice } = await import('@/components/ChatTerminalSwitch')
const { default: MeetingTerminalArea } = await import('@/components/team-meeting/MeetingTerminalArea')

afterEach(() => { delete (globalThis as any).localStorage })

describe('chat beside every terminal (F111)', () => {
  it('the switch shows both choices and marks the current one', () => {
    const html = renderToStaticMarkup(createElement(ChatTerminalSwitch, { mode: 'chat', onChange: () => {} }))
    expect(html).toContain('data-testid="switch-chat"')
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="switch-chat"/)
    expect(html).toMatch(/aria-pressed="false"[^>]*data-testid="switch-terminal"/)
  })

  it('reads a remembered choice per view, and falls back without storage or on junk', () => {
    expect(readViewChoice('meeting', 'chat')).toBe('chat') // no localStorage in node
    const store: Record<string, string> = { 'aimaestro-view-meeting': 'terminal', 'aimaestro-view-zoom': 'junk' }
    ;(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null }
    expect(readViewChoice('meeting', 'chat')).toBe('terminal')
    expect(readViewChoice('zoom', 'chat')).toBe('chat')
  })

  it('the meeting room opens on the chat and keeps the terminal mounted, hidden', () => {
    const agent = { id: 'a1', name: 'acme-dev', hostId: 'local', session: { tmuxSessionName: 'acme-dev', status: 'online' } } as any
    const html = renderToStaticMarkup(createElement(MeetingTerminalArea, { agents: [agent], activeAgentId: 'a1' }))
    expect(html).toContain('data-testid="chat" data-active="true"')
    expect(html).toContain('data-testid="terminal" data-visible="false"')
    expect(html).toMatch(/visibility:hidden[^"]*"><div data-testid="terminal"/)
  })
})
