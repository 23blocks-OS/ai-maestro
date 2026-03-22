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
 * Returns the strongly-typed PluginSkillSelection on success, or a string
 * describing the error on failure.
 */
function validateSkillSelection(skill: unknown, index: number): PluginSkillSelection | string {
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
    return { type: 'core', name: s.name }
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
    // name is a required field on the marketplace union member
    if (typeof s.name !== 'string' || s.name.trim() === '') {
      return `skills[${index}].name: required string for type 'marketplace'`
    }
    const validated: PluginSkillSelection = {
      type: 'marketplace',
      id: s.id,
      marketplace: s.marketplace,
      plugin: s.plugin,
      name: s.name,
      // description is optional — include it only when present and valid
      ...(typeof s.description === 'string' ? { description: s.description } : {}),
    }
    return validated
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
    return { type: 'repo', url: s.url, ref: s.ref, skillPath: s.skillPath, name: s.name }
  } else {
    return `skills[${index}].type: unknown skill type '${s.type}'`
  }
}

/**
 * Validates the request body against the PluginBuildConfig interface.
 * Returns a fully-typed PluginBuildConfig on success, or a string describing
 * the first validation error on failure.
 */
function validateBuildConfig(body: unknown): PluginBuildConfig | string {
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
  const validatedSkills: PluginSkillSelection[] = []
  for (let i = 0; i < b.skills.length; i++) {
    const result = validateSkillSelection(b.skills[i], i)
    // validateSkillSelection returns a string on error, a typed object on success
    if (typeof result === 'string') return result
    validatedSkills.push(result)
  }
  if (b.description !== undefined && typeof b.description !== 'string') {
    return 'description: must be a string when provided'
  }
  if (b.includeHooks !== undefined && typeof b.includeHooks !== 'boolean') {
    return 'includeHooks: must be a boolean when provided'
  }
  // Validate author when provided — must be an object with a non-empty string name field
  if (b.author !== undefined) {
    if (typeof b.author !== 'object' || b.author === null || typeof (b.author as Record<string, unknown>).name !== 'string' || ((b.author as Record<string, unknown>).name as string).trim() === '') {
      return 'author: must be an object with a non-empty string name field when provided'
    }
  }
  if (b.homepage !== undefined && typeof b.homepage !== 'string') {
    return 'homepage: must be a string when provided'
  }

  // Construct and return the fully-typed config — no unsafe cast needed at call site
  const config: PluginBuildConfig = {
    name: b.name,
    version: b.version,
    skills: validatedSkills,
    ...(typeof b.description === 'string' ? { description: b.description } : {}),
    ...(typeof b.includeHooks === 'boolean' ? { includeHooks: b.includeHooks } : {}),
    // author and homepage are optional fields that must be forwarded when present
    ...(b.author !== undefined ? { author: { name: ((b.author as Record<string, unknown>).name as string) } } : {}),
    ...(typeof b.homepage === 'string' ? { homepage: b.homepage } : {}),
  }
  return config
}

export async function POST(request: NextRequest) {
  // SF-004: Separate JSON parsing from service call so service errors
  // are not misattributed as "Invalid request body" (400)
  let body: unknown
  try {
    body = await request.json()
  } catch (error) {
    // JSON parse failures from request.json() are a client error (malformed body)
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    // All other unexpected errors are server-side failures
    console.error('Unexpected error in POST /api/plugin-builder/build:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }

  const validationResult = validateBuildConfig(body)
  if (typeof validationResult === 'string') {
    return NextResponse.json(
      { error: validationResult },
      { status: 400 }
    )
  }
  // validationResult is now a fully-typed PluginBuildConfig — no unsafe cast needed
  const config = validationResult

  try {
    const result = await buildPlugin(config)

    if (result.error) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    // Unexpected error from the service layer — log and surface a safe 500
    console.error('Error in POST /api/plugin-builder/build:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  const result = await buildPlugin(body)

  if (result.error) {
    // Guard against service returning an invalid or missing HTTP status code
    const statusCode =
      typeof result.status === 'number' && result.status >= 100 && result.status < 600
        ? result.status
        : 500
    return NextResponse.json(
      { error: result.error },
      { status: statusCode }
    )
  }
  // Guard against service returning an invalid or missing HTTP status code
  const statusCode =
    typeof result.status === 'number' && result.status >= 100 && result.status < 600
      ? result.status
      : 200
  return NextResponse.json(result.data, { status: statusCode })
}
