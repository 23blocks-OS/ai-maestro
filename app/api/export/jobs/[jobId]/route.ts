import { NextResponse } from 'next/server'
import { getExportJobStatus, deleteExportJob } from '@/services/config-service'

// Force dynamic -- reads runtime job state
export const dynamic = 'force-dynamic'

/**
 * GET /api/export/jobs/[jobId]
 * Get status of a specific export job.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params

    const result = getExportJobStatus(jobId)

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('[ExportJobs] GET error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/export/jobs/[jobId]
 * Cancel or delete an export job.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params

    const result = deleteExportJob(jobId)

    if (result.error) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('[ExportJobs] DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
