/**
 * Shared ServiceResult interface.
 *
 * CC-P1-202/524/813: Extracted from 15+ duplicate definitions across service files.
 * All services should import from here instead of defining their own copy.
 *
 * The `headers` field is optional and only used by governance-service for
 * returning custom response headers. All other services can ignore it.
 */
export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
  headers?: Record<string, string>
}
