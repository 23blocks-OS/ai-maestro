/**
 * Domains Service
 *
 * Pure business logic extracted from app/api/domains/** routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/domains         -> listAllDomains
 *   POST   /api/domains         -> createNewDomain
 *   GET    /api/domains/[id]    -> getDomainById
 *   PATCH  /api/domains/[id]    -> updateDomainById
 *   DELETE /api/domains/[id]    -> deleteDomainById
 */

import { listDomains, createDomain, getDomain, updateDomain, deleteDomain } from '@/lib/domain-service'
import type { CreateDomainRequest } from '@/types/agent'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number  // HTTP-like status code for the route to use
}

export interface UpdateDomainParams {
  description?: string
  isDefault?: boolean
}

// ===========================================================================
// PUBLIC API -- called by API routes
// ===========================================================================

/**
 * List all email domains.
 */
export function listAllDomains(): ServiceResult<{ domains: any[] }> {
  try {
    const domains = listDomains()
    return { data: { domains }, status: 200 }
  } catch (error) {
    console.error('Failed to list domains:', error)
    return { error: 'Failed to list domains', status: 500 }
  }
}

/**
 * Create a new email domain.
 */
export function createNewDomain(body: CreateDomainRequest): ServiceResult<{ domain: any }> {
  // Validate required fields
  if (!body.domain) {
    return { error: 'Domain is required', status: 400 }
  }

  try {
    const domain = createDomain(body)
    return { data: { domain }, status: 201 }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create domain'

    if (message.includes('already exists')) {
      return { error: message, status: 409 }
    }

    if (message.includes('Invalid domain')) {
      return { error: message, status: 400 }
    }

    console.error('Failed to create domain:', error)
    return { error: message, status: 500 }
  }
}

/**
 * Get a single domain by ID.
 */
export function getDomainById(id: string): ServiceResult<{ domain: any }> {
  try {
    const domain = getDomain(id)

    if (!domain) {
      return { error: 'Domain not found', status: 404 }
    }

    return { data: { domain }, status: 200 }
  } catch (error) {
    console.error('Failed to get domain:', error)
    return { error: 'Failed to get domain', status: 500 }
  }
}

/**
 * Update a domain (description or isDefault).
 */
export function updateDomainById(id: string, params: UpdateDomainParams): ServiceResult<{ domain: any }> {
  try {
    const domain = updateDomain(id, {
      description: params.description,
      isDefault: params.isDefault,
    })

    if (!domain) {
      return { error: 'Domain not found', status: 404 }
    }

    return { data: { domain }, status: 200 }
  } catch (error) {
    console.error('Failed to update domain:', error)
    return { error: 'Failed to update domain', status: 500 }
  }
}

/**
 * Delete a domain by ID.
 */
export function deleteDomainById(id: string): ServiceResult<{ success: boolean }> {
  try {
    const success = deleteDomain(id)

    if (!success) {
      return { error: 'Domain not found', status: 404 }
    }

    return { data: { success: true }, status: 200 }
  } catch (error) {
    console.error('Failed to delete domain:', error)
    return { error: 'Failed to delete domain', status: 500 }
  }
}
