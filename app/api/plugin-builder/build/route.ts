/**
 * Plugin Builder - Build API
 *
 * POST /api/plugin-builder/build - Start a plugin build
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { buildPlugin } from '@/services/plugin-builder-service'
import type { PluginBuildConfig, PluginSkillSelection } from '@/types/plugin-builder'

/**
 * Validates that a skill selection has the correct tagged-union shape.
 * Returns a string describing the error, or null if valid.
 */
function validateSkillSelection(skill: unknown, index: number): string | null {
  if (typeof skill !== 'object' || skill === null) {
    return `skills[${index}]: must be an object`
  }
  const s = skill as Record<string, unknown>
  if (typeof s.type !== 'string') {
    return `skills[${index}].type: must be a string`
  }
  if (s.type === 'core') {
    if (typeof s.name !== 'string' || s.name.trim() === '') {
      return `skills[${index}].name: required string for type 'core'`
    }
  } else if (s.type === 'marketplace') {
    if (typeof s.id !== 'string' || s.id.trim() === '') {
      return `skills[${index}].id: required string for type 'marketplace'`
    }
    if (typeof s.marketplace !== 'string' || s.marketplace.trim() === '') {
      return `skills[${index}].marketplace: required string for type 'marketplace'`
    }
    if (typeof s.plugin !== 'string' || s.plugin.trim() === '') {
      return `skills[${index}].plugin: required string for type 'marketplace'`
    }
  } else if (s.type === 'repo') {
    if (typeof s.url !== 'string' || s.url.trim() === '') {
      return `skills[${index}].url: required string for type 'repo'`
    }
    if (typeof s.ref !== 'string' || s.ref.trim() === '') {
      return `skills[${index}].ref: required string for type 'repo'`
    }
    if (typeof s.skillPath !== 'string' || s.skillPath.trim() === '') {
      return `skills[${index}].skillPath: required string for type 'repo'`
    }
    if (typeof s.name !== 'string' || s.name.trim() === '') {
      return `skills[${index}].name: required string for type 'repo'`
    }
  } else {
    return `skills[${index}].type: unknown skill type '${s.type}'`
  }
  return null
}

/**
 * Validates the request body against the PluginBuildConfig interface.
 * Returns a string describing the first validation error, or null if valid.
 */
function validateBuildConfig(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) {
    return 'Request body must be a JSON object'
  }
  const b = body as Record<string, unknown>

  if (typeof b.name !== 'string' || b.name.trim() === '') {
    return 'name: required non-empty string'
  }
  if (typeof b.version !== 'string' || b.version.trim() === '') {
    return 'version: required non-empty string'
  }
  if (!Array.isArray(b.skills)) {
    return 'skills: required array'
  }
  for (let i = 0; i < b.skills.length; i++) {
    const err = validateSkillSelection(b.skills[i], i)
    if (err !== null) return err
  }
  if (b.description !== undefined && typeof b.description !== 'string') {
    return 'description: must be a string when provided'
  }
  if (b.includeHooks !== undefined && typeof b.includeHooks !== 'boolean') {
    return 'includeHooks: must be a boolean when provided'
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate the request body against PluginBuildConfig before forwarding to the service
    const validationError = validateBuildConfig(body)
    if (validationError !== null) {
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      )
    }

    const result = await buildPlugin(body as PluginBuildConfig)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }
}
