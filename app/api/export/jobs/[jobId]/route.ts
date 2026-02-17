import { NextResponse } from 'next/server'
import { getExportJobStatus, deleteExportJob } from '@/services/config-service'

/**
 * GET /api/export/jobs/[jobId]
 * Get status of a specific export job.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  const result = getExportJobStatus(jobId)

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }

  return NextResponse.json(result.data, { status: result.status })
}

/**
 * DELETE /api/export/jobs/[jobId]
 * Cancel or delete an export job.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  const result = deleteExportJob(jobId)

  if (result.error) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.status }
    )
  }

  return NextResponse.json(result.data, { status: result.status })
}
