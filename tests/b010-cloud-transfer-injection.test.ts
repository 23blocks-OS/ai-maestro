/**
 * B010 items 2 and 3: values from a request body or an imported manifest reached
 * `exec`/`execSync` strings. They now go through execFile/execFileSync argv and
 * are validated first. child_process is mocked: nothing real runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { calls, shellCalls } = vi.hoisted(() => {
  // Modules read os.homedir() when they load: point HOME at a temp dir before any import.
  const tmp = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'b010-inj-load-'))
  process.env.HOME = tmp
  return { calls: [] as { file: string; args: string[] }[],
  shellCalls: [] as string[] }
})

vi.mock('child_process', () => {
  const execFile = (file: string, args: string[], _opts: any, cb?: any) => {
    if (typeof _opts === 'function') cb = _opts
    calls.push({ file, args })
    const stdout = file === 'aws' && args.includes('describe-repositories')
      ? JSON.stringify({ repositories: [{ repositoryUri: '1.dkr.ecr.us-east-1.amazonaws.com/r' }] })
      : ''
    const child: any = { stdin: { end: () => {} } }
    const fail = file === 'aws' && args[0] === 'sts'
    queueMicrotask(() => cb && (fail ? cb(new Error('no credentials')) : cb(null, { stdout, stderr: '' })))
    return child
  }
  const execFileSync = (file: string, args: string[]) => { calls.push({ file, args }); return '' }
  const exec = (cmd: string, _o: any, cb?: any) => { shellCalls.push(String(cmd)); (cb || _o)?.(new Error('exec must not be used'), { stdout: '', stderr: '' }) }
  const execSync = (cmd: string) => { shellCalls.push(String(cmd)); return '' }
  return { execFile, execFileSync, exec, execSync, default: { execFile, execFileSync, exec, execSync } }
})

import { createCloudAgent } from '@/services/agents-cloud-service'
import { createDockerAgent, validateDockerRunFields } from '@/services/agents-docker-service'
import { cloneRepository, isSafeGitBranch, isSafeGitRemoteUrl, isInsideDir } from '@/services/agents-transfer-service'

let outer: string
let home: string
beforeEach(() => {
  outer = fs.mkdtempSync(path.join(os.tmpdir(), 'b010-inj-'))
  home = path.join(outer, 'home')
  fs.mkdirSync(home)
  vi.stubEnv('HOME', home)
  expect(os.homedir()).toBe(home)
  calls.length = 0
  shellCalls.length = 0
})
afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(outer, { recursive: true, force: true })
})

const PAYLOADS = ['x; touch /tmp/pwn', '$(touch /tmp/pwn)', '`touch /tmp/pwn`', 'a\nb', 'a b', 'x|y', 'x&&y', '--endpoint-url=http://evil', "a'b", '']

describe('createCloudAgent validation', () => {
  it('rejects hostile awsProfile and awsRegion with 400 invalid_field and runs nothing', async () => {
    for (const bad of PAYLOADS.filter(p => p !== '')) {
      for (const field of ['awsProfile', 'awsRegion'] as const) {
        const r = await createCloudAgent({ name: 'agent1', provider: 'ecs', [field]: bad } as any)
        expect(r.status).toBe(400)
        expect((r.data as any).error).toBe('invalid_field')
        expect((r.data as any).field ?? (r as any).data?.details?.field ?? field).toBe(field)
      }
    }
    expect(calls).toEqual([])
    expect(shellCalls).toEqual([])
    expect(fs.readdirSync(home)).toEqual([])
  })

  it('rejects a hostile name for ecs (it becomes the ECR repository name)', async () => {
    for (const bad of ['x; touch /tmp/pwn', '$(id)', '`id`', 'a\nb', 'a b']) {
      const r = await createCloudAgent({ name: bad, provider: 'ecs' } as any)
      expect(r.status).toBe(400)
      expect((r.data as any).error).toBe('invalid_field')
    }
    expect(calls).toEqual([])
    expect(shellCalls).toEqual([])
  })

  it('uses argv for the aws and terraform probes, never a shell string', async () => {
    // Valid inputs get past validation and reach the credential probe (the mock fails it, so nothing is created).
    await createCloudAgent({ name: 'agent1', provider: 'ecs', ecrImageUrl: 'img', awsProfile: 'my.profile', awsRegion: 'eu-west-2' } as any).catch(() => {})
    const sts = calls.find(c => c.file === 'aws' && c.args[0] === 'sts')
    expect(sts).toBeTruthy()
    expect(sts!.args).toEqual(['sts', 'get-caller-identity', '--profile', 'my.profile'])
    expect(calls.some(c => c.file === 'terraform' && c.args[0] === 'version')).toBe(true)
    expect(shellCalls).toEqual([])
    for (const c of calls) expect(c.file).not.toMatch(/\s/)
  })
})

describe('git clone on import', () => {
  const repo = (over: any = {}) => ({ name: 'r', remoteUrl: 'https://github.com/a/b.git', defaultBranch: 'main', isPrimary: true, ...over })

  it('clones with argv and a -- separator', () => {
    const target = path.join(home, 'repos', 'r')
    const res = cloneRepository(repo() as any, target)
    expect(res.status).toBe('cloned')
    expect(calls).toEqual([{ file: 'git', args: ['clone', '--branch', 'main', '--', 'https://github.com/a/b.git', target] }])
    expect(shellCalls).toEqual([])
  })

  it('refuses hostile branches', () => {
    for (const b of ['main; touch /tmp/pwn', '$(id)', '`id`', '-u', '--upload-pack=x', 'a..b', 'a b', 'a\nb', 'x'.repeat(201)]) {
      const res = cloneRepository(repo({ defaultBranch: b }) as any, path.join(home, 'repos', 'r'))
      expect(res.status).toBe('failed')
    }
    expect(calls).toEqual([])
    expect(shellCalls).toEqual([])
  })

  it('refuses hostile or unsupported remote URLs', () => {
    for (const u of ['$(touch /tmp/pwn)', '`id`', '"; touch /tmp/pwn; "', 'https://x/a b', 'https://x/a\nb', '-oProxyCommand=id', '--upload-pack=id', 'ext::sh -c id', 'file:///etc', '/etc/passwd', 'ftp://x/y', 'git@host:']) {
      const res = cloneRepository(repo({ remoteUrl: u }) as any, path.join(home, 'repos', 'r'))
      expect(res.status).toBe('failed')
    }
    expect(calls).toEqual([])
    expect(shellCalls).toEqual([])
  })

  it('accepts https, http, ssh and scp-like urls', () => {
    for (const u of ['https://github.com/a/b.git', 'http://h/a.git', 'ssh://git@h/a.git', 'git@github.com:a/b.git']) expect(isSafeGitRemoteUrl(u)).toBe(true)
    for (const b of ['main', 'feature/x-1', 'release_1.2']) expect(isSafeGitBranch(b)).toBe(true)
  })

  it('refuses a relative or NUL target path', () => {
    expect(cloneRepository(repo() as any, '../escape').status).toBe('failed')
    expect(cloneRepository(repo() as any, path.join(home, 'a\u0000b')).status).toBe('failed')
    expect(calls).toEqual([])
  })

  it('isInsideDir keeps a name-derived target under its parent', () => {
    const parent = path.join(home, 'repos')
    expect(isInsideDir(parent, path.join(parent, 'ok'))).toBe(true)
    expect(isInsideDir(parent, path.join(parent, '..', '..', 'x'))).toBe(false)
    expect(isInsideDir(parent, parent)).toBe(false)
  })
})

describe('docker run for local container agents', () => {
  const hostile = ['x; touch /tmp/pwn', '$(touch /tmp/pwn)', '`id`', 'a"b', "a'b", 'a\nb', 'a\\b']
  it('rejects hostile name, workingDirectory, cpus, memory, model and githubToken with 400 invalid_field and runs nothing', async () => {
    for (const h of hostile) {
      for (const over of [{ name: h }, ...(/["'`$\n\\]/.test(h) ? [{ workingDirectory: '/tmp/' + h }] : []), { cpus: h }, { memory: h }, { model: h }, { githubToken: h }]) {
        const r = await createDockerAgent({ name: 'ok-agent', ...over } as any)
        expect(r.status).toBe(400)
        expect((r.data as any).error).toBe('invalid_field')
      }
    }
    expect(calls).toEqual([])
    expect(shellCalls).toEqual([])
  })
  it('accepts normal values', () => {
    expect(validateDockerRunFields({ name: 'agent-1', workingDirectory: '/Users/me/proj', cpus: 2, memory: '4g', model: 'claude-sonnet-4-5', githubToken: 'ghp_abc123' })).toBeNull()
  })
  it('a prompt with shell syntax never reaches a shell string (valid fields, docker probe fails first)', async () => {
    const r = await createDockerAgent({ name: 'ok-agent', prompt: '$(touch /tmp/pwn) `id` "q"' } as any)
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(shellCalls.every(c => !c.includes('pwn'))).toBe(true)
    expect(calls.every(c => !c.args.some(a => a.includes('pwn')) || c.file === 'docker')).toBe(true)
  })
})
