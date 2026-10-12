import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(__dirname, '..', 'scripts', 'install-safe-psql.sh')

describe('install-safe-psql.sh', () => {
  it('is valid bash', () => {
    expect(() => execFileSync('bash', ['-n', SCRIPT])).not.toThrow()
  })

  it('is called by the updater, and a failure only warns', () => {
    const updater = fs.readFileSync(path.join(__dirname, '..', 'update-aimaestro.sh'), 'utf8')
    expect(updater).toMatch(/install-safe-psql\.sh \|\| print_warning/)
  })

  it('does not touch anything and says why when the skill is missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-psql-'))
    try {
      // a copy of the script in a repo without the plugin folder
      const scripts = path.join(tmp, 'scripts')
      fs.mkdirSync(scripts)
      fs.copyFileSync(SCRIPT, path.join(scripts, 'install-safe-psql.sh'))
      const r = spawnSync('bash', [path.join(scripts, 'install-safe-psql.sh')], {
        encoding: 'utf8',
        env: { ...process.env, AIM_BIN_DIR: path.join(tmp, 'bin'), AIM_SAFE_PSQL_VENV: path.join(tmp, 'venv') },
      })
      expect(r.status).toBe(1)
      expect(r.stderr).toMatch(/skill not found/)
      expect(fs.existsSync(path.join(tmp, 'bin'))).toBe(false)
      expect(fs.existsSync(path.join(tmp, 'venv'))).toBe(false)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  // Needs Python and the network (pip); run with RUN_NETWORK_TESTS=1.
  it.skipIf(!process.env.RUN_NETWORK_TESTS)('installs a working launcher that refuses an attack', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-psql-'))
    try {
      const env = { ...process.env, AIM_BIN_DIR: path.join(tmp, 'bin'), AIM_SAFE_PSQL_VENV: path.join(tmp, 'venv') }
      execFileSync('bash', [SCRIPT], { env })
      const launcher = path.join(tmp, 'bin', 'safe-psql')
      const ok = spawnSync(launcher, ['--check-only', '--sql', 'SELECT 1'], { encoding: 'utf8' })
      expect(ok.status).toBe(0)
      expect(ok.stdout).toMatch(/LIMIT 1000/)
      const bad = spawnSync(launcher, ['--check-only', '--sql', 'COMMIT; DROP TABLE t'], { encoding: 'utf8' })
      expect(bad.status).toBe(2)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }, 180_000)
})
