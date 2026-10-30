/**
 * Host probes behind a cache (docker, terraform/aws, docker stats, tool readiness) must share one
 * in-flight run between concurrent callers instead of each spawning their own, and run with argv.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const spawned = vi.hoisted(() => [] as string[][])
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  const { promisify: p } = await import('util')
  const answer = (file: string, args: string[]) => {
    spawned.push([file, ...args])
    if (file === 'docker' && args[0] === 'version') return '27.0.1\n'
    if (args[0] === '-ilc') return 'AIMPATH=/nonexistent-for-test\n'
    return ''
  }
  const execFile: any = (file: string, args: string[], _opts: unknown, cb: (e: Error | null, so: string, se: string) => void) => {
    setTimeout(() => cb(null, answer(file, args), ''), 20)
    return { stdin: { end() {} } }
  }
  execFile[p.custom] = (file: string, args: string[]) =>
    new Promise(r => setTimeout(() => r({ stdout: answer(file, args), stderr: '' }), 20))
  // A shell string is recorded as such and never run.
  const exec: any = (cmd: string, _opts: unknown, cb: (e: Error | null, so: string, se: string) => void) => {
    spawned.push(['sh', cmd]); setTimeout(() => cb(null, '', ''), 20)
  }
  exec[p.custom] = (cmd: string) => { spawned.push(['sh', cmd]); return Promise.resolve({ stdout: '', stderr: '' }) }
  return { ...actual, execFile, exec, default: { ...actual, execFile, exec } }
})
vi.mock('@/lib/hosts-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hosts-config')>()
  return { ...actual, getHosts: () => [], isSelf: () => true, loadAllHostsRaw: () => [] }
})

const { listHosts } = await import('@/services/hosts-service')
const { getDockerInfo } = await import('@/services/config-service')
const { getDockerStats } = await import('@/services/agents-docker-service')
const { checkToolReadiness, resetReadinessCache } = await import('@/services/tool-readiness-service')

const count = (pred: (c: string[]) => boolean) => spawned.filter(pred).length

beforeEach(() => { spawned.length = 0 })

describe('single-flight host probes', () => {
  it('listHosts: one docker and one terraform probe for concurrent callers, with argv', async () => {
    const [a] = await Promise.all([listHosts(), listHosts(), listHosts()])
    expect(count(c => c[0] === 'docker')).toBe(1)
    expect(count(c => c[0] === 'terraform')).toBe(1)
    expect(spawned).toContainEqual(['docker', 'version', '--format', '{{.Server.Version}}'])
    expect((a.data as any).hosts).toEqual([])
  })

  it('getDockerInfo: one docker version for concurrent callers, cached briefly', async () => {
    const results = await Promise.all([getDockerInfo(), getDockerInfo(), getDockerInfo()])
    await getDockerInfo()
    expect(count(c => c[0] === 'docker')).toBe(1)
    for (const r of results) expect(r.data).toEqual({ available: true, version: '27.0.1' })
  })

  it('getDockerStats: one docker stats for concurrent callers', async () => {
    await Promise.all([getDockerStats(), getDockerStats(), getDockerStats()])
    expect(count(c => c[0] === 'docker' && c[1] === 'stats')).toBe(1)
  })

  it('checkToolReadiness: one login shell for concurrent callers', async () => {
    resetReadinessCache()
    await Promise.all([checkToolReadiness(), checkToolReadiness(), checkToolReadiness()])
    expect(count(c => c[1] === '-ilc')).toBe(1)
  })
})
