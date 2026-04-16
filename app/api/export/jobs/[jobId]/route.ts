import { getExportJobStatus, deleteExportJob } from '@/services/config-service'
import { toResponse } from '@/app/api/_helpers'

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
  return toResponse(result)
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
  return toResponse(result)
}
