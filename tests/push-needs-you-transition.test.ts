/**
 * The push fires on the transition INTO "needs you", seen in broadcastActivityUpdate (the single
 * place that normalises hook status), and not again while the agent stays blocked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const pushNeedsYou = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/push-expo', () => ({ pushNeedsYou }))
vi.mock('@/lib/agent-registry', () => ({ loadAgents: () => [], getAgent: () => null, getAgentByName: () => null }))

const { broadcastActivityUpdate } = await import('@/services/sessions-service')

const tick = () => new Promise(r => setTimeout(r, 30))
// Hooks arrive as separate requests, so give each one its own turn
const hook = async (_s: string, status: string, notificationType?: string) => {
  broadcastActivityUpdate(`s${n}`, status, status, notificationType, 'agent-1')
  await tick()
}

// Each test gets its own session name: the hook state map is shared module state
let n = 0
beforeEach(() => { pushNeedsYou.mockClear(); n++ })

describe('needs-you push trigger', () => {
  it('fires once when the agent starts waiting, not on repeats', async () => {
    await hook('s1', 'active')
    await hook('s1', 'permission_request')
    await hook('s1', 'permission_request')
    expect(pushNeedsYou).toHaveBeenCalledTimes(1)
    expect(pushNeedsYou).toHaveBeenCalledWith('agent-1', expect.stringMatching(/^s\d+$/))
  })

  it('fires again after the agent worked in between', async () => {
    await hook('s1', 'permission_request')
    await hook('s1', 'active')
    await hook('s1', 'waiting_for_input', 'permission_prompt')
    expect(pushNeedsYou).toHaveBeenCalledTimes(2)
  })

  it('does not fire for an idle prompt or a finished turn', async () => {
    await hook('s1', 'active')
    await hook('s1', 'waiting_for_input', 'idle_prompt')
    await hook('s1', 'idle')
    expect(pushNeedsYou).not.toHaveBeenCalled()
  })
})
