/**
 * GET    /api/projects/:id — one project with its counts
 * PATCH  /api/projects/:id — change name, description, status (active|paused|done) or owner (PUT works too)
 * DELETE /api/projects/:id — remove the project and its cards
 */

import { NextRequest } from 'next/server'
import { getProjectById, updateProject, deleteProject } from '@/services/projects-service'
import { toResponse } from '@/app/api/_helpers'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  return toResponse(getProjectById(id))
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(updateProject(id, body))
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(updateProject(id, body))
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params
  return toResponse(deleteProject(id))
}
