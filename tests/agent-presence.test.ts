/**
 * One rule for what an agent is doing, shared by every view
 * (lib/agent-presence.ts): green working, orange needs you, yellow ready,
 * grey offline. Before, green meant "working" in the sidebar and "ready" in
 * the chat, and a minute of idleness showed as "waiting".
 */

import { describe, it, expect } from 'vitest'
import { presenceFrom, hookNeedsYou, PRESENCE_STYLE } from '@/lib/agent-presence'
import { avatarStateForPresence, avatarStateFrom } from '@/components/LiveAvatar'

describe('hookNeedsYou', () => {
  it('is a real block: an approval or an open question', () => {
    expect(hookNeedsYou('permission_request')).toBe(true)
    expect(hookNeedsYou('waiting_for_input', 'permission_prompt')).toBe(true)
    expect(hookNeedsYou('waiting_for_input', 'elicitation_dialog')).toBe(true)
  })
  it('is not "still idle after a minute" (Claude Code idle_prompt) nor a finished turn', () => {
    expect(hookNeedsYou('waiting_for_input', 'idle_prompt')).toBe(false)
    expect(hookNeedsYou('idle')).toBe(false)
    expect(hookNeedsYou('active')).toBe(false)
  })
})

describe('presenceFrom', () => {
  it('maps each situation to one presence', () => {
    expect(presenceFrom({ online: false })).toBe('offline')
    expect(presenceFrom({ online: true, activity: 'active' })).toBe('working')
    expect(presenceFrom({ online: true, hookStatus: 'working' })).toBe('working')
    expect(presenceFrom({ online: true, hookStatus: 'permission_request' })).toBe('needs-you')
    expect(presenceFrom({ online: true, activity: 'waiting' })).toBe('needs-you')
    expect(presenceFrom({ online: true, activity: 'idle' })).toBe('ready')
    expect(presenceFrom({ online: true, activity: 'waiting', hookStatus: 'waiting_for_input', notificationType: 'idle_prompt' })).toBe('ready')
  })

  it('uses distinct colours: green, orange, yellow, grey', () => {
    expect(PRESENCE_STYLE.working.dot).toContain('emerald')
    expect(PRESENCE_STYLE['needs-you'].dot).toContain('orange')
    expect(PRESENCE_STYLE.ready.dot).toContain('yellow')
    expect(PRESENCE_STYLE.offline.dot).toContain('gray')
    expect(PRESENCE_STYLE.ready.dot).not.toContain('animate-pulse') // ready is steady
  })
})

describe('the avatar follows the same presence', () => {
  it('plays the matching loop', () => {
    expect(avatarStateForPresence('working')).toBe('working')
    expect(avatarStateForPresence('needs-you')).toBe('waiting')
    expect(avatarStateForPresence('ready')).toBe('idle')
    expect(avatarStateForPresence('offline')).toBe('sleeping')
    expect(avatarStateFrom({ online: true, activity: 'waiting', hookStatus: 'waiting_for_input', notificationType: 'idle_prompt' })).toBe('idle')
  })
})
