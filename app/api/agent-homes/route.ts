import {
  listAgentHomes,
  requestHomeChange
} from '@/services/agent-homes-service'
import { toResponse } from '@/app/api/_helpers'
export const dynamic = 'force-dynamic'
export async function GET() {
  return toResponse(listAgentHomes())
}
export async function POST(request: Request) {
  return toResponse(requestHomeChange(await request.json()))
}
