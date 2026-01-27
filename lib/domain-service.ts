import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { EmailDomain, CreateDomainRequest } from '@/types/agent'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const DOMAINS_FILE = path.join(AIMAESTRO_DIR, 'domains.json')

// ============================================================================
// Storage
// ============================================================================

/**
 * Ensure aimaestro directory exists
 */
function ensureDir() {
  if (!fs.existsSync(AIMAESTRO_DIR)) {
    fs.mkdirSync(AIMAESTRO_DIR, { recursive: true })
  }
}

/**
 * Load all email domains
 */
export function loadDomains(): EmailDomain[] {
  try {
    ensureDir()

    if (!fs.existsSync(DOMAINS_FILE)) {
      return []
    }

    const data = fs.readFileSync(DOMAINS_FILE, 'utf-8')
    const domains = JSON.parse(data)

    return Array.isArray(domains) ? domains : []
  } catch (error) {
    console.error('[Domains] Failed to load domains:', error)
    return []
  }
}

/**
 * Save email domains
 */
export function saveDomains(domains: EmailDomain[]): boolean {
  try {
    ensureDir()

    const data = JSON.stringify(domains, null, 2)
    fs.writeFileSync(DOMAINS_FILE, data, 'utf-8')

    return true
  } catch (error) {
    console.error('[Domains] Failed to save domains:', error)
    return false
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Get domain by ID
 */
export function getDomain(id: string): EmailDomain | undefined {
  const domains = loadDomains()
  return domains.find(d => d.id === id)
}

/**
 * Get domain by domain name (case-insensitive)
 */
export function getDomainByName(domainName: string): EmailDomain | undefined {
  const domains = loadDomains()
  const normalized = domainName.toLowerCase().trim()
  return domains.find(d => d.domain.toLowerCase() === normalized)
}

/**
 * List all domains
 */
export function listDomains(): EmailDomain[] {
  return loadDomains()
}

/**
 * Create a new email domain
 */
export function createDomain(request: CreateDomainRequest): EmailDomain {
  const domains = loadDomains()

  // Normalize domain name
  const normalizedDomain = request.domain.toLowerCase().trim()

  // Validate domain format (basic check)
  if (!isValidDomain(normalizedDomain)) {
    throw new Error(`Invalid domain format: ${request.domain}`)
  }

  // Check for duplicate
  const existing = domains.find(d => d.domain.toLowerCase() === normalizedDomain)
  if (existing) {
    throw new Error(`Domain already exists: ${normalizedDomain}`)
  }

  // If this is set as default, unset any existing default
  if (request.isDefault) {
    domains.forEach(d => d.isDefault = false)
  }

  // If this is the first domain, make it default
  const isFirstDomain = domains.length === 0

  const domain: EmailDomain = {
    id: uuidv4(),
    domain: normalizedDomain,
    description: request.description?.trim(),
    createdAt: new Date().toISOString(),
    isDefault: request.isDefault || isFirstDomain,
  }

  domains.push(domain)
  saveDomains(domains)

  return domain
}

/**
 * Delete a domain by ID
 */
export function deleteDomain(id: string): boolean {
  const domains = loadDomains()
  const index = domains.findIndex(d => d.id === id)

  if (index === -1) {
    return false
  }

  const wasDefault = domains[index].isDefault
  domains.splice(index, 1)

  // If we deleted the default, make the first remaining domain the default
  if (wasDefault && domains.length > 0) {
    domains[0].isDefault = true
  }

  saveDomains(domains)
  return true
}

/**
 * Update a domain
 */
export function updateDomain(id: string, updates: Partial<Pick<EmailDomain, 'description' | 'isDefault'>>): EmailDomain | undefined {
  const domains = loadDomains()
  const domain = domains.find(d => d.id === id)

  if (!domain) {
    return undefined
  }

  // If setting as default, unset other defaults
  if (updates.isDefault) {
    domains.forEach(d => d.isDefault = false)
  }

  if (updates.description !== undefined) {
    domain.description = updates.description?.trim() || undefined
  }

  if (updates.isDefault !== undefined) {
    domain.isDefault = updates.isDefault
  }

  saveDomains(domains)
  return domain
}

/**
 * Set a domain as the default
 */
export function setDefaultDomain(id: string): EmailDomain | undefined {
  return updateDomain(id, { isDefault: true })
}

/**
 * Get the default domain
 */
export function getDefaultDomain(): EmailDomain | undefined {
  const domains = loadDomains()
  return domains.find(d => d.isDefault) || domains[0]
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Basic domain format validation
 * Allows: example.com, sub.example.com, etc.
 */
function isValidDomain(domain: string): boolean {
  // Basic regex for domain validation
  // Allows alphanumeric, hyphens, and dots
  // Must have at least one dot and a valid TLD
  const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

  if (!domainRegex.test(domain)) {
    return false
  }

  // Check length constraints
  if (domain.length > 253) {
    return false
  }

  // Check each label length
  const labels = domain.split('.')
  for (const label of labels) {
    if (label.length > 63) {
      return false
    }
  }

  return true
}

/**
 * Check if a domain name is available (not already registered)
 */
export function isDomainAvailable(domainName: string): boolean {
  const existing = getDomainByName(domainName)
  return !existing
}
