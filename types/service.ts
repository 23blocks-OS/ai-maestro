/**
 * Shared ServiceResult interface.
 *
 * CC-P1-202/524/813: Extracted from 15+ duplicate definitions across service files.
 * All services should import from here instead of defining their own copy.
 *
 * The `headers` field is optional and only used by governance-service for
 * returning custom response headers. All other services can ignore it.
 *
 * SF-024: This interface allows simultaneous `data` and `error` fields.
 * Callers MUST use the `if (result.error)` guard pattern (not `result.data ??`)
 * to avoid silently discarding errors.
 *
 * Phase 2: Refactor to discriminated union (e.g., `ServiceSuccess<T> | ServiceError`)
 * to enforce mutual exclusivity of `data` and `error` at the type level.
 */
export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
  headers?: Record<string, string>
}

/**
 * Runtime guard that warns when a ServiceResult is in an invalid state.
 * Detects when both `data` and `error` are set (indicates a service bug).
 * Use in route handlers after service calls for defense-in-depth.
 *
 * Note: Intentionally logs a warning instead of throwing, because callers
 * using `if (result.error)` already handle the ambiguous state correctly.
 * The `assert` prefix is a misnomer -- consider renaming to `warnOnInvalidServiceResult`
 * in the next breaking change.
 */
export function assertValidServiceResult<T>(result: ServiceResult<T>, context?: string): void {
  if (result.data !== undefined && result.error !== undefined) {
    const ctx = context ? ` [${context}]` : ''
    console.error(`[ServiceResult]${ctx} BUG: result has both data and error set. error="${result.error}" status=${result.status}`)
    // In this ambiguous state, error takes precedence -- callers using `if (result.error)` are correct
  }
}
