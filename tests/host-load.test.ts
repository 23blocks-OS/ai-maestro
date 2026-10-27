import { describe, it, expect } from 'vitest'
import { parseSwapUsage, parseVmStatAvailable, parseMeminfo, readHostLoad } from '@/lib/host-load'

describe('host load parsers', () => {
  it('reads macOS swap usage', () => {
    const r = parseSwapUsage('vm.swapusage: total = 3072.00M  used = 2303.25M  free = 768.75M  (encrypted)')
    expect(r).toEqual({ totalBytes: 3072 * 1048576, usedBytes: Math.round(2303.25 * 1048576) })
  })
  it('returns null for text it does not know', () => {
    expect(parseSwapUsage('nothing')).toBeNull()
  })
  it('counts free + inactive + speculative pages as available', () => {
    const vm = `Mach Virtual Memory Statistics: (page size of 4096 bytes)
Pages free:                               28660.
Pages active:                           6513665.
Pages inactive:                         6490152.
Pages speculative:                        22485.`
    expect(parseVmStatAvailable(vm)).toBe((28660 + 6490152 + 22485) * 4096)
  })
  it('reads Linux MemAvailable and swap', () => {
    const r = parseMeminfo('MemAvailable:   2048 kB\nSwapTotal:      1000 kB\nSwapFree:        400 kB\n')
    expect(r).toEqual({ availableBytes: 2048 * 1024, swapTotal: 1000 * 1024, swapUsed: 600 * 1024 })
  })
})

describe('readHostLoad', () => {
  it('returns real numbers for this machine', () => {
    const l = readHostLoad(3)
    expect(l.cores).toBeGreaterThan(0)
    expect(l.memory.totalBytes).toBeGreaterThan(l.memory.availableBytes > 0 ? 0 : -1)
    expect(l.memory.availableBytes).toBeGreaterThan(0)
    expect(l.memory.availableBytes).toBeLessThanOrEqual(l.memory.totalBytes)
    expect(l.agentsOnline).toBe(3)
    expect(new Date(l.measuredAt).getTime()).toBeGreaterThan(0)
  })
})
