/**
 * Service Errors — Single source of truth
 *
 * Unified error types, factory functions, and validation helpers for all services.
 * Follows the AMP error format: { error: 'code', message: 'Human text', field?, details? }
 *
 * Usage in services:
 *   import { ServiceResult, missingField, notFound, requireString } from '@/services/service-errors'
 *
 * Usage in routes:
 *   import { toResponse } from '@/app/api/_helpers'
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * All service error codes — superset of AMP's 18 codes + generic codes.
 */
export type ServiceErrorCode =
  // AMP protocol codes (18)
  | 'invalid_request'
  | 'missing_field'
  | 'invalid_field'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'name_taken'
  | 'rate_limited'
  | 'internal_error'
  | 'invalid_signature'
  | 'agent_not_found'
  | 'tenant_access_denied'
  | 'organization_not_set'
  | 'external_provider'
  | 'payload_too_large'
  | 'missing_header'
  | 'duplicate_message'
  | 'key_already_registered'
  // Generic codes (12)
  | 'already_exists'
  | 'gone'
  | 'invalid_state'
  | 'circular_dependency'
  | 'self_reference'
  | 'operation_failed'
  | 'timeout'
  | 'method_not_allowed'
  | 'invalid_format'
  | 'access_denied'
  | 'precondition_failed'
  | 'not_initialized'

// ============================================================================
// Error & Result Types
// ============================================================================

/**
 * Structured error — the shape returned to API consumers.
 */
export interface ServiceError {
  error: ServiceErrorCode
  message: string
  field?: string
  details?: Record<string, unknown>
}

/**
 * Unified result type for all services.
 *
 * On success: { data: T, status: 2xx }
 * On error:   { data: ServiceError, status: 4xx/5xx }
 */
export interface ServiceResult<T> {
  data?: T | ServiceError
  status: number
  headers?: Record<string, string>
}

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Check if a ServiceResult's data is a ServiceError.
 */
export function isServiceError(data: unknown): data is ServiceError {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    'message' in data &&
    typeof (data as ServiceError).error === 'string' &&
    typeof (data as ServiceError).message === 'string'
  )
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a custom ServiceError result.
 */
export function serviceError(
  code: ServiceErrorCode,
  message: string,
  status: number,
  opts?: { field?: string; details?: Record<string, unknown> }
): ServiceResult<never> {
  const err: ServiceError = { error: code, message }
  if (opts?.field) err.field = opts.field
  if (opts?.details) err.details = opts.details
  return { data: err, status }
}

/** 400 — Required field is missing or empty. */
export function missingField(field: string): ServiceResult<never> {
  return serviceError('missing_field', `${field} is required`, 400, { field })
}

/** 400 — Field value is invalid. */
export function invalidField(field: string, reason: string): ServiceResult<never> {
  return serviceError('invalid_field', reason, 400, { field })
}

/** 400 — Invalid request (generic). */
export function invalidRequest(message: string): ServiceResult<never> {
  return serviceError('invalid_request', message, 400)
}

/** 404 — Entity not found. */
export function notFound(entity: string, id?: string): ServiceResult<never> {
  const msg = id ? `${entity} '${id}' not found` : `${entity} not found`
  return serviceError('not_found', msg, 404)
}

/** 409 — Entity already exists. */
export function alreadyExists(entity: string, name?: string): ServiceResult<never> {
  const msg = name ? `${entity} '${name}' already exists` : `${entity} already exists`
  return serviceError('already_exists', msg, 409)
}

/** 410 — Entity has been deleted. */
export function gone(entity: string): ServiceResult<never> {
  return serviceError('gone', `${entity} has been deleted`, 410)
}

/** 400 — Invalid state for the requested operation. */
export function invalidState(message: string): ServiceResult<never> {
  return serviceError('invalid_state', message, 400)
}

/** 400 — Not initialized. */
export function notInitialized(what: string): ServiceResult<never> {
  return serviceError('not_initialized', `${what} not initialized`, 400)
}

/** 400 — Circular dependency. */
export function circularDependency(message: string): ServiceResult<never> {
  return serviceError('circular_dependency', message, 400)
}

/** 400 — Self reference. */
export function selfReference(message: string): ServiceResult<never> {
  return serviceError('self_reference', message, 400)
}

/** 400 — Invalid format. */
export function invalidFormat(field: string, reason: string): ServiceResult<never> {
  return serviceError('invalid_format', reason, 400, { field })
}

/** 412 — Precondition failed. */
export function preconditionFailed(message: string): ServiceResult<never> {
  return serviceError('precondition_failed', message, 412)
}

/** 401 — Unauthorized. */
export function unauthorized(message = 'Authentication required'): ServiceResult<never> {
  return serviceError('unauthorized', message, 401)
}

/** 403 — Forbidden / access denied. */
export function accessDenied(message = 'Access denied'): ServiceResult<never> {
  return serviceError('access_denied', message, 403)
}

/** 403 — Forbidden (AMP-style). */
export function forbidden(message = 'Forbidden'): ServiceResult<never> {
  return serviceError('forbidden', message, 403)
}

/** 405 — Method not allowed. */
export function methodNotAllowed(method: string): ServiceResult<never> {
  return serviceError('method_not_allowed', `Method ${method} not allowed`, 405)
}

/** 409 — Name already taken. */
export function nameTaken(name: string, suggestions?: string[]): ServiceResult<never> {
  return serviceError('name_taken', `Name '${name}' is already taken`, 409, {
    details: suggestions ? { suggestions } : undefined,
  })
}

/** 413 — Payload too large. */
export function payloadTooLarge(message: string): ServiceResult<never> {
  return serviceError('payload_too_large', message, 413)
}

/** 429 — Rate limited. */
export function rateLimited(message = 'Too many requests'): ServiceResult<never> {
  return serviceError('rate_limited', message, 429)
}

/** 500 — Operation failed (catch-all for "Failed to X"). */
export function operationFailed(operation: string, cause?: string): ServiceResult<never> {
  const msg = cause ? `Failed to ${operation}: ${cause}` : `Failed to ${operation}`
  return serviceError('operation_failed', msg, 500)
}

/** 500 — Internal error. */
export function internalError(message = 'Internal server error'): ServiceResult<never> {
  return serviceError('internal_error', message, 500)
}

/** 504 — Timeout. */
export function timeout(message = 'Operation timed out'): ServiceResult<never> {
  return serviceError('timeout', message, 504)
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that a value is a non-empty string.
 * Returns a ServiceResult error if invalid, or null if valid.
 */
export function requireString(value: unknown, fieldName: string): ServiceResult<never> | null {
  if (!value || typeof value !== 'string' || value.trim() === '') {
    return missingField(fieldName)
  }
  return null
}

/**
 * Validate that a value is an array.
 * Returns a ServiceResult error if invalid, or null if valid.
 */
export function requireArray(value: unknown, fieldName: string): ServiceResult<never> | null {
  if (!Array.isArray(value)) {
    return invalidField(fieldName, `${fieldName} must be an array`)
  }
  return null
}

/**
 * Validate that a name matches the allowed format (letters, numbers, dashes, underscores).
 * Returns a ServiceResult error if invalid, or null if valid.
 */
export function requireNameFormat(value: string, fieldName: string): ServiceResult<never> | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    return invalidField(fieldName, `${fieldName} must only contain letters, numbers, dashes, and underscores`)
  }
  return null
}

// ============================================================================
// Success Helper
// ============================================================================

/**
 * Create a success result. Convenience for `{ data, status }`.
 */
export function ok<T>(data: T, status = 200, headers?: Record<string, string>): ServiceResult<T> {
  const result: ServiceResult<T> = { data, status }
  if (headers) result.headers = headers
  return result
}
