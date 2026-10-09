import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// 0.60.0: one commit in history pointed the plugin submodule at an unpushed plugin
// commit, and a recursing `git fetch` aborted the update on two hosts. The updater
// must not recurse into submodules while fetching or pulling; the later
// `git submodule update` fetches the one commit the final pointer names.
const script = fs.readFileSync(path.join(__dirname, '..', 'update-aimaestro.sh'), 'utf8')

describe('update-aimaestro.sh', () => {
  it('fetches without recursing into submodules', () => {
    expect(script).toMatch(/git fetch --no-recurse-submodules origin main/)
    expect(script).not.toMatch(/^\s*git fetch origin main/m)
  })
  it('pulls without recursing into submodules', () => {
    expect(script).toMatch(/git pull --no-recurse-submodules origin main/)
  })
  it('still updates the submodule to the recorded pointer', () => {
    expect(script).toMatch(/git submodule update --init --recursive --force/)
  })
})

// 0.60.5: a new step in update-aimaestro.sh was skipped on the two hosts that updated
// themselves, because bash keeps running the copy it already loaded. The updater now
// continues once with the new copy after a pull that changed it.
describe('update-aimaestro.sh restarts itself after it changes', () => {
  const pull = script.indexOf('git pull --no-recurse-submodules origin main')
  const reexec = script.indexOf('exec bash "$SELF_PATH"')
  it('keeps its arguments and its own path before parsing options', () => {
    expect(script.indexOf('ORIG_ARGS=("$@")')).toBeGreaterThan(-1)
    expect(script.indexOf('ORIG_ARGS=("$@")')).toBeLessThan(script.indexOf('NON_INTERACTIVE=false'))
    expect(script).toMatch(/SELF_PATH="\$\(cd "\$\(dirname "\$0"\)" && pwd\)\//)
  })
  it('re-executes only after the pull, only when the script changed, and only once', () => {
    expect(reexec).toBeGreaterThan(pull)
    const block = script.slice(pull, reexec + 80)
    expect(block).toContain('git diff --quiet "$BEFORE_SHA" HEAD -- update-aimaestro.sh')
    expect(block).toContain('[ -z "${AIM_UPDATER_REEXEC:-}" ]') // loop guard
    expect(block).toContain('AIM_UPDATER_REEXEC=1 exec bash')
    expect(block).toContain('"${ORIG_ARGS[@]}"')
  })
  it('does not ask about reinstalling after the restart (the tree is already current)', () => {
    expect(script).toMatch(/NON_INTERACTIVE" = true \] \|\| \[ -n "\$\{AIM_UPDATER_REEXEC:-\}" \]/)
  })
  it('restarts before the steps it protects (log rotation, pm2 restart)', () => {
    expect(reexec).toBeLessThan(script.indexOf('setup-log-rotation.sh'))
    expect(reexec).toBeLessThan(script.indexOf('Restarting AI Maestro via PM2'))
  })
})
