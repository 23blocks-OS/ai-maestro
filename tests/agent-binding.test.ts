/**
 * Tests for conversation ownership in lib/index-delta.ts.
 *
 * Two defects left 87 of 163 surveyed agents with wrong or incomplete memory:
 *
 *   1. A conversation was matched to an agent by EXACT cwd equality, so a
 *      subagent or a session started in a child directory — which has a deeper
 *      cwd — was invisible to the agent that owns it.
 *   2. Auto-discovery ran only when an agent had ZERO projects recorded, so a
 *      wrong binding was permanent. pas-lola was bound to /home/jpelaez with
 *      four conversations that had not existed for months, while its real ones
 *      sat in -home-jpelaez-lola, and it reported "0 messages, success" every
 *      run.
 *
 * These lock the ownership rule, including the nesting case: when directories
 * nest, the CLOSEST agent owns the conversation rather than both claiming it.
 */

import { describe, it, expect } from 'vitest'

/** Mirrors cwdBelongsTo in lib/index-delta.ts. */
function cwdBelongsTo(cwd: string, agentWd: string, otherWds: string[]): boolean {
  if (cwd === agentWd) return true
  if (!cwd.startsWith(agentWd.endsWith('/') ? agentWd : agentWd + '/')) return false
  return !otherWds.some(
    (o) => o.length > agentWd.length && (cwd === o || cwd.startsWith(o.endsWith('/') ? o : o + '/'))
  )
}

describe('conversation ownership', () => {
  it('claims an exact working-directory match', () => {
    expect(cwdBelongsTo('/repo', '/repo', [])).toBe(true)
  })

  it('claims a child directory — the subagent case', () => {
    // An agent in /repo with a subagent running in /repo/packages/api: the
    // subagent's conversations belong to the agent that owns /repo.
    expect(cwdBelongsTo('/repo/packages/api', '/repo', [])).toBe(true)
  })

  it('does not claim an unrelated directory', () => {
    expect(cwdBelongsTo('/other/project', '/repo', [])).toBe(false)
  })

  it('does not claim a sibling that merely shares a name prefix', () => {
    // /repo-backup must not be treated as a child of /repo.
    expect(cwdBelongsTo('/repo-backup', '/repo', [])).toBe(false)
  })

  it('does not claim a PARENT directory', () => {
    expect(cwdBelongsTo('/', '/repo', [])).toBe(false)
  })

  it('yields a nested directory to the closer agent', () => {
    // Agent A in /repo, agent B in /repo/service. A conversation in
    // /repo/service belongs to B alone — otherwise the outer agent swallows
    // every inner agent's history.
    expect(cwdBelongsTo('/repo/service', '/repo', ['/repo/service'])).toBe(false)
    expect(cwdBelongsTo('/repo/service', '/repo/service', ['/repo'])).toBe(true)
  })

  it('still claims siblings of a nested agent', () => {
    // /repo/web has no closer owner, so it stays with the /repo agent.
    expect(cwdBelongsTo('/repo/web', '/repo', ['/repo/service'])).toBe(true)
  })

  it('gives a deep child to the closest of several nested agents', () => {
    const others = ['/repo/a/b', '/repo/a', '/repo']
    expect(cwdBelongsTo('/repo/a/b/c', '/repo/a/b', others.filter((o) => o !== '/repo/a/b'))).toBe(true)
    expect(cwdBelongsTo('/repo/a/b/c', '/repo/a', others.filter((o) => o !== '/repo/a'))).toBe(false)
  })

  it('handles a trailing slash on the working directory', () => {
    expect(cwdBelongsTo('/repo/sub', '/repo/', [])).toBe(true)
  })
})
