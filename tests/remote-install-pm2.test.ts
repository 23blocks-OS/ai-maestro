/**
 * The Linux install used to start a bare `yarn start` unless pm2 happened to be installed: after a
 * crash (or an OOM kill) or a reboot the dashboard stayed down (tmux sessions survive, so agents kept
 * running but nothing served the UI). The installer now installs pm2, starts the server under it,
 * and prints the one command that survives a reboot, without running sudo on its own.
 * (The kill -9 recovery under pm2, about 1 s, was measured in a Linux container: docs/LINUX-DEPLOYMENT.md.)
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'remote-install.sh'), 'utf8')
const fn = (name: string) => {
  const m = src.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'))
  if (!m) throw new Error(`${name}() not found`)
  return m[0]
}

describe('remote-install.sh and pm2', () => {
  it('detects a missing pm2 and counts it as something to install', () => {
    expect(src).toMatch(/NEED_PM2=false[\s\S]*?have_linux_cmd pm2/)
    expect(src).toMatch(/\[ "\$NEED_PM2" = true \] && need_count=/)
  })

  it('installs pm2 in the prerequisites, with sudo only where npm needs it and never a silent prompt in -y mode', () => {
    const act2 = fn('act2_install_prerequisites')
    const block = act2.slice(act2.indexOf('# pm2 (restarts'), act2.indexOf('# System packages'))
    expect(block).toMatch(/npm install -g pm2/)
    expect(block).toMatch(/NON_INTERACTIVE" = true \] && ! sudo -n true/)
    // a failed pm2 install must not abort the install
    expect(block).toMatch(/Could not install pm2/)
  })

  it('starts under pm2 with the ecosystem file, saves, and prints (not runs) the reboot command', () => {
    const act4 = fn('act4_start_and_register')
    expect(act4).toMatch(/pm2 start ecosystem\.config\.js --env production/)
    expect(act4).toMatch(/pm2 save/)
    expect(act4).toMatch(/pm2 startup 2>\/dev\/null \| grep -E '\^sudo '/)
    // never executes what pm2 startup printed
    expect(act4).not.toMatch(/eval "?\$startup_cmd|\$startup_cmd\s*$/m)
    expect(act4).not.toMatch(/\n\s*sudo env PATH/)
  })

  it('when pm2 is still missing it says so, and how to fix it', () => {
    const act4 = fn('act4_start_and_register')
    expect(act4).toMatch(/Started without a supervisor/)
    expect(act4).toMatch(/npm install -g pm2/)
  })

  it('all of it is valid shell', () => {
    execFileSync('bash', ['-n', path.join(__dirname, '..', 'scripts', 'remote-install.sh')])
  })
})
