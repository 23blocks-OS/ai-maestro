/**
 * Regression: on mini-lola a second connection to an agent's DB made schema
 * creation fail with "database is locked (code 5)". The migration aborted at
 * that table, the caller swallowed the error, and consolidation then failed
 * with "Cannot find requested stored relation 'memory_link_checked'".
 */

import { describe, it, expect, vi } from 'vitest'
import { withLockRetry } from '@/lib/cozo-schema-memory'

describe('withLockRetry', () => {
  it('retries while the database is locked, then succeeds', async () => {
    vi.useFakeTimers()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('database is locked (code 5)'))
      .mockRejectedValueOnce(new Error('database is locked (code 5)'))
      .mockResolvedValueOnce('ok')
    const p = withLockRetry(fn)
    await vi.runAllTimersAsync()
    await expect(p).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('does not retry other errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('stored_relation_conflict'))
    await expect(withLockRetry(fn)).rejects.toThrow('stored_relation_conflict')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after the last attempt', async () => {
    vi.useFakeTimers()
    const fn = vi.fn().mockRejectedValue(new Error('database is locked (code 5)'))
    const p = withLockRetry(fn, 3)
    const assertion = expect(p).rejects.toThrow('database is locked')
    await vi.runAllTimersAsync()
    await assertion
    expect(fn).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })
})
