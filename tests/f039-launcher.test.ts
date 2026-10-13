/**
 * F039: a way back in. The `ai-maestro` command, the launcher the installer makes, and the web app manifest.
 * Nothing here touches the real pm2, browser, ~/Applications or LaunchAgents: every program is a fake on a
 * private PATH, every destination a temp directory.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync, spawn, spawnSync } from 'child_process'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import manifest from '@/app/manifest'

const root = path.resolve(__dirname, '..')
const CMD = path.join(root, 'scripts', 'ai-maestro.sh')
const INSTALL = path.join(root, 'scripts', 'install-launcher.sh')

const tmps: string[] = []
const servers: http.Server[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.close()
  for (const t of tmps.splice(0)) fs.rmSync(t, { recursive: true, force: true })
})

function tmpdir(): string {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'f039-'))
  tmps.push(t)
  return t
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = http.createServer()
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port
      s.close(() => resolve(port))
    })
  })
}

function serve(port: number): Promise<void> {
  return new Promise((resolve) => {
    const s = http.createServer((_req, res) => { res.end('[]') })
    servers.push(s)
    s.listen(port, '127.0.0.1', () => resolve())
  })
}

/** A repo-shaped directory and a private bin of fakes that record how they were called. */
function sandbox(opts: { built?: boolean; pm2Knows?: boolean } = {}) {
  const dir = tmpdir()
  const repo = path.join(dir, 'repo')
  const bin = path.join(dir, 'bin')
  const log = path.join(dir, 'calls.log')
  fs.mkdirSync(repo)
  fs.mkdirSync(bin)
  if (opts.built !== false) fs.mkdirSync(path.join(repo, '.next'))
  fs.writeFileSync(path.join(repo, 'ecosystem.config.js'), 'module.exports = {}\n')
  // The command sees ONLY the fakes and the few tools it needs: a CI runner has a real Chrome in /usr/bin.
  for (const tool of ['curl', 'sleep', 'uname', 'dirname', 'sed', 'cat']) {
    const real = execFileSync('bash', ['-c', `command -v ${tool}`], { encoding: 'utf8' }).trim()
    fs.symlinkSync(real, path.join(bin, tool))
  }
  const fake = (name: string, body: string) => {
    fs.writeFileSync(path.join(bin, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 })
  }
  // describe succeeds only when the test says pm2 already knows the process.
  fake('pm2', `echo "pm2 $*" >> "${log}"\n[ "$1" = describe ] && exit ${opts.pm2Knows ? 0 : 1}\nexit 0`)
  fake('open', `echo "open $*" >> "${log}"`)
  fake('xdg-open', `echo "xdg-open $*" >> "${log}"`)
  fake('google-chrome', `echo "google-chrome $*" >> "${log}"`)
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [])
  // Async: the "server" lives in this process, so a blocking spawn would starve it.
  const run = (args: string[], port: number, extra: Record<string, string> = {}) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
      const child = spawn('/bin/bash', [CMD, ...args], {
        env: { PATH: bin, HOME: dir, AIM_REPO: repo, AIM_PORT: String(port), AIM_WAIT: '10', AIM_OS: 'Linux', ...extra },
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => { stdout += d })
      child.stderr.on('data', (d) => { stderr += d })
      child.on('close', (status) => resolve({ status, stdout, stderr }))
    })
  return { dir, repo, bin, calls, run }
}

describe('scripts are valid bash', () => {
  for (const f of ['scripts/ai-maestro.sh', 'scripts/install-launcher.sh', 'install.sh', 'update-aimaestro.sh']) {
    it(f, () => {
      expect(() => execFileSync('bash', ['-n', path.join(root, f)])).not.toThrow()
    })
  }
})

describe('ai-maestro status', () => {
  it('says it is running and exits 0 when the server answers', async () => {
    const port = await freePort()
    await serve(port)
    const sb = sandbox()
    const r = await sb.run(['status'], port)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain(`http://localhost:${port}`)
  })

  it('says it is not running and exits 3 when nothing answers', async () => {
    const port = await freePort()
    const r = await sandbox().run(['status'], port)
    expect(r.status).toBe(3)
    expect(r.stdout).toMatch(/not running/)
  })
})

describe('ai-maestro start', () => {
  it('does nothing when it is already running', async () => {
    const port = await freePort()
    await serve(port)
    const sb = sandbox()
    const r = await sb.run(['start'], port)
    expect(r.status).toBe(0)
    expect(sb.calls()).toEqual([])
  })

  it('starts it from the ecosystem file when pm2 does not know it, and waits until it answers', async () => {
    const port = await freePort()
    const sb = sandbox()
    const child = spawn('/bin/bash', [CMD, 'start'], {
      env: { PATH: sb.bin, HOME: sb.dir, AIM_REPO: sb.repo, AIM_PORT: String(port), AIM_WAIT: '20', AIM_OS: 'Linux' },
    })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    const exited = new Promise<number | null>((resolve) => child.on('close', resolve))
    await new Promise((r) => setTimeout(r, 1500)) // still waiting: the "server" is not up yet
    expect(child.exitCode).toBeNull()
    await serve(port)
    expect(await exited).toBe(0)
    expect(out).toContain('is running')
    expect(sb.calls()).toContain('pm2 describe ai-maestro')
    expect(sb.calls()).toContain('pm2 start ecosystem.config.js --only ai-maestro')
  })

  it('restarts it when pm2 already knows the process (it was stopped)', async () => {
    const port = await freePort()
    const sb = sandbox({ pm2Knows: true })
    // The fake pm2 never brings anything up, so it times out; what matters is the call it made.
    const r = await sb.run(['start'], port, { AIM_WAIT: '1' })
    expect(r.status).toBe(1)
    expect(sb.calls()).toContain('pm2 restart ai-maestro')
    expect(sb.calls().some((c) => c.startsWith('pm2 start'))).toBe(false)
  })

  it('gives up with a pointer to the logs when the server never answers', async () => {
    const port = await freePort()
    const r = await sandbox().run(['start'], port, { AIM_WAIT: '2' })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/did not answer/)
    expect(r.stderr).toContain('pm2 logs ai-maestro')
  })

  it('says to run the updater when AI Maestro was never built', async () => {
    const port = await freePort()
    const sb = sandbox({ built: false })
    const r = await sb.run(['start'], port)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/not built yet/)
    expect(r.stderr).toContain('update-aimaestro.sh')
    expect(sb.calls()).toEqual([])
  })

  it('finds pm2 under nvm when the PATH it was started with does not have it (a Dock app, a login item)', async () => {
    const port = await freePort()
    const sb = sandbox()
    fs.rmSync(path.join(sb.bin, 'pm2'))
    const nvmBin = path.join(sb.dir, '.nvm', 'versions', 'node', 'v20.0.0', 'bin')
    fs.mkdirSync(nvmBin, { recursive: true })
    fs.writeFileSync(path.join(nvmBin, 'pm2'), `#!/bin/bash\necho "nvm-pm2 $*" >> "${path.join(sb.dir, 'calls.log')}"\n[ "$1" = describe ] && exit 1\nexit 0\n`, { mode: 0o755 })
    const r = await sb.run(['start'], port, { AIM_WAIT: '1' })
    expect(r.status).toBe(1)
    expect(sb.calls()).toContain('nvm-pm2 start ecosystem.config.js --only ai-maestro')
  })

  it('says how to get pm2 when it is missing', async () => {
    const port = await freePort()
    const sb = sandbox()
    fs.rmSync(path.join(sb.bin, 'pm2'))
    const r = await sb.run(['start'], port)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/pm2 is not installed/)
  })
})

describe('ai-maestro open', () => {
  it('opens a window of its own when Chrome (or Edge, Brave, Chromium) is there', async () => {
    const port = await freePort()
    await serve(port)
    const sb = sandbox()
    expect((await sb.run(['open'], port)).status).toBe(0)
    await new Promise((r) => setTimeout(r, 300)) // the browser is started in the background
    expect(sb.calls()).toEqual([`google-chrome --app=http://localhost:${port}`])
  })

  it('opens the default browser when no such browser is installed', async () => {
    const port = await freePort()
    await serve(port)
    const sb = sandbox()
    fs.rmSync(path.join(sb.bin, 'google-chrome'))
    expect((await sb.run(['open'], port)).status).toBe(0)
    expect(sb.calls()).toEqual([`xdg-open http://localhost:${port}`])
  })

  it('opens the default browser when AIM_OPEN_MODE=browser, even with Chrome installed', async () => {
    const port = await freePort()
    await serve(port)
    const sb = sandbox()
    expect((await sb.run(['open'], port, { AIM_OPEN_MODE: 'browser' })).status).toBe(0)
    expect(sb.calls()).toEqual([`xdg-open http://localhost:${port}`])
  })

  it('on a Mac with no Chrome, asks macOS to open the address', async () => {
    const port = await freePort()
    await serve(port)
    const sb = sandbox()
    // HOME is the sandbox, so ~/Applications has no browser; /Applications may, on a real Mac.
    const r = await sb.run(['open'], port, { AIM_OS: 'Darwin' })
    expect(r.status).toBe(0)
    expect(sb.calls()).toHaveLength(1)
    expect(sb.calls()[0]).toMatch(new RegExp(`^open (-na .+ --args --app=)?http://localhost:${port}$|^open -na .+ --args --app=http://localhost:${port}$`))
  })

  it('starts the server first when it is down', async () => {
    const port = await freePort()
    const sb = sandbox()
    const r = await sb.run(['open'], port, { AIM_WAIT: '1' })
    expect(r.status).toBe(1)
    expect(sb.calls()).toContain('pm2 start ecosystem.config.js --only ai-maestro')
    expect(sb.calls().some((c) => c.includes('google-chrome') || c.includes('xdg-open'))).toBe(false)
  })
})

describe('ai-maestro stop', () => {
  it('stops it through pm2 and says the agents are untouched', async () => {
    const port = await freePort()
    const sb = sandbox({ pm2Knows: true })
    const r = await sb.run(['stop'], port)
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/tmux sessions are still running/)
    expect(sb.calls()).toContain('pm2 stop ai-maestro')
  })

  it('has nothing to stop when pm2 does not manage it', async () => {
    const port = await freePort()
    const sb = sandbox()
    const r = await sb.run(['stop'], port)
    expect(r.status).toBe(0)
    expect(sb.calls().some((c) => c.startsWith('pm2 stop'))).toBe(false)
  })

  it('never runs tmux or kills anything (it only talks to pm2)', () => {
    const src = fs.readFileSync(CMD, 'utf8')
    expect(src).not.toMatch(/(^|[;&|(`]\s*)tmux\b/m)
    expect(src).not.toMatch(/\b(pkill|killall|kill)\b/)
  })
})

describe('ai-maestro with an unknown command', () => {
  it('names the choices and exits 1', async () => {
    const port = await freePort()
    const r = await sandbox().run(['frobnicate'], port)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/open, start, stop, status/)
  })
})

describe('install-launcher.sh', () => {
  function installer(extraEnv: Record<string, string> = {}) {
    const dir = tmpdir()
    const env: Record<string, string> = {
      PATH: process.env.PATH || '/usr/bin:/bin',
      HOME: dir,
      AIM_BIN_DIR: path.join(dir, 'bin'),
      AIM_APPS_DIR: path.join(dir, 'Applications'),
      AIM_LAUNCH_AGENTS_DIR: path.join(dir, 'LaunchAgents'),
      AIM_DESKTOP_DIR: path.join(dir, 'applications'),
      AIM_AUTOSTART_DIR: path.join(dir, 'autostart'),
      AIM_ICON_DIR: path.join(dir, 'icons'),
      AIM_NO_LAUNCHCTL: '1',
      ...extraEnv,
    }
    const run = (...args: string[]) => spawnSync('bash', [INSTALL, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] })
    return { dir, run, p: (...s: string[]) => path.join(dir, ...s) }
  }

  it('installs the command with this checkout and a PATH baked in', () => {
    const i = installer({ AIM_OS: 'Linux' })
    const r = i.run()
    expect(r.status).toBe(0)
    const wrapper = fs.readFileSync(i.p('bin', 'ai-maestro'), 'utf8')
    expect(wrapper).toContain(`AIM_REPO="${root}"`)
    expect(wrapper).toContain(`exec bash "${root}/scripts/ai-maestro.sh"`)
    expect(wrapper).toMatch(/export PATH=".*:\$PATH:\/usr\/local\/bin:\/opt\/homebrew\/bin"/)
    expect(fs.statSync(i.p('bin', 'ai-maestro')).mode & 0o111).toBeTruthy()
  })

  it('the installed command runs (status of nothing answering exits 3)', async () => {
    const i = installer({ AIM_OS: 'Linux' })
    i.run()
    const port = await freePort()
    const r = spawnSync(i.p('bin', 'ai-maestro'), ['status'], { encoding: 'utf8', env: { ...process.env, AIM_PORT: String(port) } })
    expect(r.status).toBe(3)
  })

  it('is idempotent', () => {
    const i = installer({ AIM_OS: 'Linux', AIM_FORCE_LAUNCHER: '1' })
    expect(i.run().status).toBe(0)
    const first = fs.readFileSync(i.p('applications', 'ai-maestro.desktop'), 'utf8')
    expect(i.run().status).toBe(0)
    expect(fs.readFileSync(i.p('applications', 'ai-maestro.desktop'), 'utf8')).toBe(first)
  })

  it('Linux: a menu entry with the icon, and no start at login unless asked', () => {
    const i = installer({ AIM_OS: 'Linux', AIM_FORCE_LAUNCHER: '1' })
    expect(i.run().status).toBe(0)
    const entry = fs.readFileSync(i.p('applications', 'ai-maestro.desktop'), 'utf8')
    expect(entry).toContain('Name=AI Maestro')
    expect(entry).toContain(`Exec="${i.p('bin', 'ai-maestro')}" open`)
    expect(entry).toContain(`Icon=${i.p('icons', 'ai-maestro.png')}`)
    expect(fs.existsSync(i.p('icons', 'ai-maestro.png'))).toBe(true)
    expect(fs.existsSync(i.p('autostart', 'ai-maestro.desktop'))).toBe(false)
  })

  it('Linux: --login-item adds an autostart entry that only starts the server', () => {
    const i = installer({ AIM_OS: 'Linux', AIM_FORCE_LAUNCHER: '1' })
    expect(i.run('--login-item').status).toBe(0)
    const auto = fs.readFileSync(i.p('autostart', 'ai-maestro.desktop'), 'utf8')
    expect(auto).toContain(`Exec="${i.p('bin', 'ai-maestro')}" start`)
  })

  it('an update (no terminal, no flag) keeps an existing login item and never adds one', () => {
    const i = installer({ AIM_OS: 'Linux', AIM_FORCE_LAUNCHER: '1' })
    i.run() // no flag, no terminal: no login item
    expect(fs.existsSync(i.p('autostart', 'ai-maestro.desktop'))).toBe(false)
    i.run('--login-item')
    i.run() // an update
    expect(fs.existsSync(i.p('autostart', 'ai-maestro.desktop'))).toBe(true)
  })

  it('--no-login-item removes an existing one', () => {
    const i = installer({ AIM_OS: 'Linux', AIM_FORCE_LAUNCHER: '1' })
    i.run('--login-item')
    i.run('--no-login-item')
    expect(fs.existsSync(i.p('autostart', 'ai-maestro.desktop'))).toBe(false)
    expect(fs.existsSync(i.p('applications', 'ai-maestro.desktop'))).toBe(true)
  })

  it('a server with no desktop gets only the command', () => {
    const i = installer({ AIM_OS: 'Linux', XDG_CURRENT_DESKTOP: '' })
    const r = i.run()
    expect(r.status).toBe(0)
    expect(fs.existsSync(i.p('bin', 'ai-maestro'))).toBe(true)
    // Only a machine that has no desktop session at all: skip the assertion where this runner has one.
    if (!fs.existsSync('/usr/share/xsessions') && !fs.existsSync('/usr/share/wayland-sessions')) {
      expect(fs.existsSync(i.p('applications', 'ai-maestro.desktop'))).toBe(false)
      expect(r.stdout).toMatch(/no desktop found/)
    }
  })

  it('--no-launcher installs only the command', () => {
    const i = installer({ AIM_OS: 'Linux', AIM_FORCE_LAUNCHER: '1' })
    expect(i.run('--no-launcher').status).toBe(0)
    expect(fs.existsSync(i.p('bin', 'ai-maestro'))).toBe(true)
    expect(fs.existsSync(i.p('applications', 'ai-maestro.desktop'))).toBe(false)
  })

  it('--remove takes everything away', () => {
    const i = installer({ AIM_OS: 'Linux', AIM_FORCE_LAUNCHER: '1' })
    i.run('--login-item')
    expect(i.run('--remove').status).toBe(0)
    for (const f of [['bin', 'ai-maestro'], ['applications', 'ai-maestro.desktop'], ['autostart', 'ai-maestro.desktop'], ['icons', 'ai-maestro.png']]) {
      expect(fs.existsSync(i.p(...f)), f.join('/')).toBe(false)
    }
  })

  it('refuses an option it does not know', () => {
    const r = installer({ AIM_OS: 'Linux' }).run('--frobnicate')
    expect(r.status).toBe(2)
  })

  it.skipIf(process.platform !== 'darwin')('macOS: builds the app with our icon, signed, calling the command', () => {
    const i = installer({ AIM_OS: 'Darwin' })
    const r = i.run('--login-item')
    expect(r.status).toBe(0)
    const app = i.p('Applications', 'AI Maestro.app')
    const plist = (key: string) => spawnSync('plutil', ['-extract', key, 'raw', '-o', '-', path.join(app, 'Contents', 'Info.plist')], { encoding: 'utf8' })
    expect(plist('CFBundleIdentifier').stdout.trim()).toBe('com.23blocks.ai-maestro')
    expect(plist('CFBundleName').stdout.trim()).toBe('AI Maestro')
    // The default script icon lives in an asset catalog that would win over ours.
    expect(plist('CFBundleIconName').status).not.toBe(0)
    expect(fs.existsSync(path.join(app, 'Contents', 'Resources', 'Assets.car'))).toBe(false)
    expect(fs.readFileSync(path.join(app, 'Contents', 'Resources', 'applet.icns')).equals(fs.readFileSync(path.join(root, 'scripts', 'launcher', 'AI-Maestro.icns')))).toBe(true)
    expect(spawnSync('codesign', ['-v', app]).status).toBe(0)
    const source = execFileSync('osadecompile', [app], { encoding: 'utf8' })
    expect(source).toContain(`${i.p('bin', 'ai-maestro')}`)
    expect(source).toMatch(/display alert "AI Maestro could not start"/)
  })

  it.skipIf(process.platform !== 'darwin')('macOS: --login-item writes a valid LaunchAgent that only starts the server; --remove deletes it', () => {
    const i = installer({ AIM_OS: 'Darwin' })
    i.run('--login-item')
    const plist = i.p('LaunchAgents', 'com.23blocks.ai-maestro.plist')
    expect(spawnSync('plutil', ['-lint', plist]).status).toBe(0)
    const text = fs.readFileSync(plist, 'utf8')
    expect(text).toContain(`<string>${i.p('bin', 'ai-maestro')}</string><string>start</string>`)
    expect(text).toContain('<key>RunAtLoad</key><true/>')
    expect(text).not.toMatch(/KeepAlive/)
    i.run('--remove')
    expect(fs.existsSync(plist)).toBe(false)
    expect(fs.existsSync(i.p('Applications', 'AI Maestro.app'))).toBe(false)
  })

  it('the updater refreshes the launcher (and AIM_NO_LAUNCHER=1 skips it); the installer has a way to skip it', () => {
    const updater = fs.readFileSync(path.join(root, 'update-aimaestro.sh'), 'utf8')
    expect(updater).toMatch(/AIM_NO_LAUNCHER[\s\S]{0,200}install-launcher\.sh <\/dev\/null \|\| print_warning/)
    const inst = fs.readFileSync(path.join(root, 'install.sh'), 'utf8')
    expect(inst).toContain('--skip-launcher')
    expect(inst).toMatch(/SKIP_LAUNCHER" != true \] && \[ -f "scripts\/install-launcher\.sh"/)
  })
})

function pngSize(file: string): [number, number] {
  const b = fs.readFileSync(file)
  expect(b.subarray(1, 4).toString()).toBe('PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

describe('the web app manifest', () => {
  const m = manifest()

  it('installs as a standalone app that opens the dashboard', () => {
    expect(m.name).toBe('AI Maestro')
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    expect(m.scope).toBe('/')
  })

  it('has a 192, a 512 and a maskable 512 icon, and every file exists at that size', () => {
    const icons = m.icons || []
    const find = (size: string, purpose: string) => icons.find((x) => x.sizes === size && x.purpose === purpose)
    expect(find('192x192', 'any')).toBeTruthy()
    expect(find('512x512', 'any')).toBeTruthy()
    expect(find('512x512', 'maskable')).toBeTruthy()
    for (const icon of icons) {
      const [w, h] = (icon.sizes as string).split('x').map(Number)
      expect(pngSize(path.join(root, 'public', icon.src)), icon.src).toEqual([w, h])
    }
  })

  it('has an Apple touch icon, and the layout points at it', () => {
    expect(pngSize(path.join(root, 'public', 'icons', 'apple-touch-icon.png'))).toEqual([180, 180])
    const layout = fs.readFileSync(path.join(root, 'app', 'layout.tsx'), 'utf8')
    expect(layout).toContain("apple: '/icons/apple-touch-icon.png'")
    expect(layout).toMatch(/appleWebApp: \{ capable: true/)
  })

  it('ships the macOS icon the launcher uses', () => {
    const icns = fs.readFileSync(path.join(root, 'scripts', 'launcher', 'AI-Maestro.icns'))
    expect(icns.subarray(0, 4).toString()).toBe('icns')
    expect(icns.length).toBeGreaterThan(10_000)
  })
})
