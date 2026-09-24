/**
 * Living avatars: loops live in the agent's own directory
 * (~/.aimaestro/agents/<id>/avatar/<state>.mp4) and are served with Range
 * support, since Safari will not play a video without it.
 */

import { describe, it, expect, vi, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'

const HOME = fs.mkdtempSync(path.join(tmpdir(), 'avatar-loops-'))
vi.mock('os', async (orig) => {
  const real = await orig<typeof import('os')>()
  return { ...real, default: { ...real, homedir: () => HOME }, homedir: () => HOME }
})

import { listAvatarLoops, avatarLoopPath, parseRange } from '@/lib/avatar-loops'
import { avatarStateFrom } from '@/components/LiveAvatar'

afterAll(() => fs.rmSync(HOME, { recursive: true, force: true }))

describe('avatar loops on disk', () => {
  const dir = path.join(HOME, '.aimaestro', 'agents', 'a1', 'avatar')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'idle.mp4'), 'x')
  fs.writeFileSync(path.join(dir, 'working.mp4'), 'x')
  fs.writeFileSync(path.join(dir, 'waiting.mp4'), '') // empty: not a loop
  fs.writeFileSync(path.join(dir, 'dancing.mp4'), 'x') // not a state

  it('lists only real loops for known states', () => {
    expect(listAvatarLoops('a1')).toEqual(['idle', 'working'])
    expect(listAvatarLoops('nobody')).toEqual([])
  })

  it('never resolves outside the agent directory', () => {
    expect(avatarLoopPath('a1', 'idle')).toBe(path.join(dir, 'idle.mp4'))
    expect(avatarLoopPath('a1', 'dancing')).toBeNull()
    expect(avatarLoopPath('../../etc', 'idle')).toBeNull()
    expect(avatarLoopPath('a1', '../../passwd')).toBeNull()
  })
})

describe('parseRange', () => {
  it('reads the ranges browsers send for video', () => {
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange('bytes=0-1', 1000)).toEqual({ start: 0, end: 1 })
    expect(parseRange('bytes=500-2000', 1000)).toEqual({ start: 500, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
  })
  it('rejects what it cannot satisfy', () => {
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('bytes=1000-', 1000)).toBeNull()
    expect(parseRange('items=0-1', 1000)).toBeNull()
  })
})

describe('avatarStateFrom', () => {
  it('maps the sidebar activity to a face', () => {
    expect(avatarStateFrom({ online: false })).toBe('sleeping')
    expect(avatarStateFrom({ online: true, activity: 'active' })).toBe('working')
    expect(avatarStateFrom({ online: true, activity: 'waiting' })).toBe('waiting')
    expect(avatarStateFrom({ online: true, activity: 'idle' })).toBe('idle')
    expect(avatarStateFrom({ online: true })).toBe('idle')
  })
})
