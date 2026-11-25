/**
 * F041: building from a project on another drive than the home folder (D:\ in CI, E:\ on a desktop) made Next's
 * file tracer glob the whole home folder ("EPERM scandir C:\Users\<you>\Application Data", or out of memory):
 * its "outside the project" test is a relative path starting with "..", and across drives that path is absolute.
 * next.config.js adds "?:/**" (any absolute Windows path) to the tracer's ignores on Windows.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'module'
import path from 'path'

const require = createRequire(import.meta.url)
const configPath = path.join(process.cwd(), 'next.config.js')
const realPlatform = process.platform

function loadConfig(platform: string) {
  Object.defineProperty(process, 'platform', { value: platform })
  delete require.cache[require.resolve(configPath)]
  return require(configPath)
}

afterEach(() => { Object.defineProperty(process, 'platform', { value: realPlatform }) })

describe('next.config.js tracer ignores on native Windows', () => {
  it('ignores absolute paths in both tracing passes on win32', () => {
    const cfg = loadConfig('win32')
    const tracer = { traceIgnores: [] as string[] }
    const out = cfg.webpack({ plugins: [tracer, {}] }, { isServer: false })
    expect(out.plugins[0].traceIgnores).toEqual(['?:/**'])
    expect(cfg.outputFileTracingExcludes).toEqual({ '*': ['?:/**'] })
  })

  it('changes nothing on macOS and Linux', () => {
    for (const platform of ['darwin', 'linux']) {
      const cfg = loadConfig(platform)
      const tracer = { traceIgnores: [] as string[] }
      cfg.webpack({ plugins: [tracer] }, { isServer: false })
      expect(tracer.traceIgnores).toEqual([])
      expect(cfg.outputFileTracingExcludes).toBeUndefined()
    }
  })
})
