/**
 * Shared service result types used by all service modules.
 *
 * Services return ServiceResult<T> instead of throwing or using HTTP concepts
 * directly. API routes unwrap these into NextResponse objects.
 */

/**
 * Valid HTTP status codes enforced at compile time.
 * Prevents services from returning invalid status codes that would cause
 * NextResponse.json to throw or behave unexpectedly at runtime.
 */
export type HttpStatusCode =
  | 100 | 101 | 102 | 103
  | 200 | 201 | 202 | 203 | 204 | 205 | 206 | 207 | 208 | 226
  | 300 | 301 | 302 | 303 | 304 | 305 | 307 | 308
  | 400 | 401 | 402 | 403 | 404 | 405 | 406 | 407 | 408 | 409
  | 410 | 411 | 412 | 413 | 414 | 415 | 416 | 417 | 418
  | 421 | 422 | 423 | 424 | 425 | 426 | 428 | 429 | 431 | 451
  | 500 | 501 | 502 | 503 | 504 | 505 | 506 | 507 | 508 | 510 | 511

/**
 * Standard result envelope returned by all service functions.
 * Either `data` (success) or `error` (failure) will be present, never both.
 * `status` is always a valid HTTP status code so routes can forward it directly.
 */
export interface ServiceResult<T> {
  data?: T
  error?: string
  status: HttpStatusCode
}
