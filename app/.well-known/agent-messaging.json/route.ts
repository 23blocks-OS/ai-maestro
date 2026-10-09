/**
 * AMP Well-Known Discovery Endpoint
 *
 * GET /.well-known/agent-messaging.json
 *
 * Returns provider discovery information for external agents (the standard AMP
 * discovery mechanism per protocol spec). The document is built by
 * services/amp-discovery-service.ts, shared with the headless router.
 */

import { getWellKnownDocument } from '@/services/amp-discovery-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET() {
  return toResponse(getWellKnownDocument())
}
