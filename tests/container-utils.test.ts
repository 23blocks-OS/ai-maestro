/**
 * Container Utils Tests
 *
 * Coverage for the `cancelCopyModeInContainer` primitive added for
 * kanban 96d317df / GH issue #70. Mirrors the host-side
 * `runtime.cancelCopyMode` (lib/agent-runtime.ts:145) for cloud agents.
 *
 * Why the cloud-side mirror exists: cloud agents run tmux INSIDE the
 * container, so the host runtime's cancelCopyMode can't see/touch their
 * panes. The notify route's cloud branches need a `docker exec`-based
 * equivalent before sending keys to a copy-mode-stuck pane (which would
 * otherwise hang the request and drop the payload — verified empirically
 * 2026-04-28 on Holmes/Rollie).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const { mockExec } = vi.hoisted(() => ({
  mockExec: vi.fn(),
}))

vi.mock('child_process', () => ({
  exec: mockExec,
}))

vi.mock('util', async () => {
  const actual = await vi.importActual<typeof import('util')>('util')
  return {
    ...actual,
    promisify: () => async (cmd: string, _opts?: unknown) => {
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        mockExec(cmd, (err: unknown, stdout: string, stderr: string) => {
          if (err) reject(err)
          else resolve({ stdout, stderr })
        })
      })
      return result
    },
  }
})

import { cancelCopyModeInContainer, removeContainer } from '@/lib/container-utils'

describe('cancelCopyModeInContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Stage-1 Escape clears plain copy-mode (no overlay) — no q follow-up', async () => {
    // probe=1 → Escape → re-probe=0 → return without q.
    const calls: string[] = []
    let probeCount = 0
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      calls.push(cmd)
      if (cmd.includes('display-message')) {
        probeCount += 1
        cb(null, probeCount === 1 ? '1\n' : '0\n', '')
      } else {
        cb(null, '', '')
      }
    })

    await cancelCopyModeInContainer('aim-test', 'test-session')

    expect(calls.length).toBe(3)
    expect(calls[0]).toContain('display-message')
    expect(calls[0]).toContain('pane_in_mode')
    expect(calls[0]).toContain("'aim-test'")
    expect(calls[0]).toContain("'test-session:0.0'")
    expect(calls[1]).toContain('send-keys')
    expect(calls[1]).toContain(' Escape')
    expect(calls[2]).toContain('display-message')
  })

  it('Stage-2 q fires when an overlay (jump-backward et al.) was on top of copy-mode', async () => {
    // probe=1 → Escape closes overlay only → re-probe=1 → q forces exit.
    // This is the bug class PR #94 left open: bare `q` against a copy-mode
    // pane with active command-prompt is consumed as the prompt's argument
    // and silently drops the next sendKeys.
    const calls: string[] = []
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      calls.push(cmd)
      if (cmd.includes('display-message')) {
        cb(null, '1\n', '')
      } else {
        cb(null, '', '')
      }
    })

    await cancelCopyModeInContainer('aim-test', 'test-session')

    expect(calls.length).toBe(4)
    expect(calls[0]).toContain('display-message')
    expect(calls[1]).toContain('send-keys')
    expect(calls[1]).toContain(' Escape')
    expect(calls[2]).toContain('display-message')
    expect(calls[3]).toContain('send-keys')
    expect(calls[3]).toContain(' q')
  })

  it('does NOT touch the pane when initial pane_in_mode=0', async () => {
    const calls: string[] = []
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      calls.push(cmd)
      cb(null, '0\n', '')
    })

    await cancelCopyModeInContainer('aim-test', 'test-session')

    expect(calls.length).toBe(1)
    expect(calls[0]).toContain('display-message')
  })

  it('is non-fatal on probe failure (container down, session missing, daemon unreachable)', async () => {
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      cb(new Error('No such container: aim-test'), '', '')
    })

    // Should not throw — caller's send-keys will surface the real error.
    await expect(cancelCopyModeInContainer('aim-test', 'test-session')).resolves.toBeUndefined()
  })

  it('escapes container and session names via single-quote shell-quoting', async () => {
    const calls: string[] = []
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      calls.push(cmd)
      cb(null, '0\n', '')
    })

    await cancelCopyModeInContainer("aim-evil'; rm -rf /; echo '", 'normal-session')

    // Single quote in the container name must be escaped to '\\'' so the
    // command can't break out of the quoted shell argument.
    expect(calls[0]).toContain(`'aim-evil'\\''; rm -rf /; echo '\\'''`)
    // Probe still issued — the helper trusts shellQuote, doesn't reject.
    expect(calls[0]).toContain('display-message')
  })
})

// ============================================================================
// removeContainer (kanban 1282efc4 / issue #84 — hard-delete cloud-agent
// teardown). Tested separately from the deleteAgentById cloud branch which
// owns the inspect→stop→rm sequencing — this suite covers the helper itself.
// ============================================================================

describe('removeContainer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('issues `docker rm` with the shellQuoted container name', async () => {
    const calls: string[] = []
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      calls.push(cmd)
      cb(null, '', '')
    })

    await removeContainer('aim-cloud-agent')

    expect(calls.length).toBe(1)
    expect(calls[0]).toContain('docker rm')
    expect(calls[0]).toContain("'aim-cloud-agent'")
  })

  it('escapes container names with shell metacharacters via single-quote quoting', async () => {
    const calls: string[] = []
    mockExec.mockImplementation((cmd: string, cb: Function) => {
      calls.push(cmd)
      cb(null, '', '')
    })

    await removeContainer("aim-evil'; rm -rf /; echo '")

    // Single quote in the container name must be escaped so the command
    // can't break out of the quoted shell argument.
    expect(calls[0]).toContain(`'aim-evil'\\''; rm -rf /; echo '\\'''`)
    expect(calls[0]).toContain('docker rm')
  })

  it('propagates daemon errors so the caller can decide whether to swallow them', async () => {
    // The delete-path caller wraps removeContainer in `.catch(warn)` to make
    // it non-fatal. The helper itself must surface errors — swallowing here
    // would hide "container in use" / "no such container" / daemon-down from
    // any future caller that actually needs to react.
    mockExec.mockImplementation((_cmd: string, cb: Function) => {
      cb(new Error('Error response from daemon: No such container: aim-missing'), '', '')
    })

    await expect(removeContainer('aim-missing')).rejects.toThrow(/no such container/i)
  })
})

describe('CONTAINER_CWD constants', () => {
  it('CONTAINER_CWD_ENCODED matches the slashes-to-hyphens encoding of CONTAINER_CWD', async () => {
    // Invariant: Claude Code encodes its cwd as the projects subdir name by
    // replacing slashes with hyphens. CONTAINER_CWD_ENCODED is the
    // pre-computed sibling so the cloud-branch JSONL lookup doesn't
    // re-derive on every read. If anyone edits CONTAINER_CWD without
    // re-encoding, this test fails — catches drift before it ships.
    const { CONTAINER_CWD, CONTAINER_CWD_ENCODED } = await vi.importActual<
      typeof import('@/lib/container-utils')
    >('@/lib/container-utils')
    expect(CONTAINER_CWD_ENCODED).toBe(CONTAINER_CWD.replace(/\//g, '-'))
  })
})
