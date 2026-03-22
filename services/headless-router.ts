/**
 * Headless Router
 *
 * Standalone HTTP router for MAESTRO_MODE=headless.
 * Maps all ~100 URL patterns to service function calls without Next.js.
 * Uses a linear regex scan — sub-millisecond for 100 patterns.
 *
 * No external routing library needed. All service imports are from services/.
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { parse } from 'url'

// ---------------------------------------------------------------------------
// Service imports (all 24 service files)
// ---------------------------------------------------------------------------

import {
  listAgents,
  searchAgentsByQuery,
  createNewAgent,
  getAgentById,
  updateAgentById,
  deleteAgentById,
  registerAgent,
  lookupAgentByName,
  getUnifiedAgents,
  getAgentSessionStatus,
  linkAgentSession,
  sendAgentSessionCommand,
  unlinkOrDeleteAgentSession,
  wakeAgent,
  hibernateAgent,
  initializeStartup,
  getStartupInfo,
  proxyHealthCheck,
} from '@/services/agents-core-service'

import {
  getDirectory,
  lookupAgentByDirectoryName,
  syncDirectory,
  diagnoseHosts,
  normalizeHosts,
} from '@/services/agents-directory-service'

import {
  getConversationMessages as getChatMessages,
  sendChatMessage,
} from '@/services/agents-chat-service'

import {
  getMemory,
  initializeMemory,
  getConsolidationStatus,
  triggerConsolidation,
  manageConsolidation,
  queryLongTermMemories,
  deleteLongTermMemory,
  updateLongTermMemory,
  searchConversations,
  ingestConversations,
  runDeltaIndex,
  getTracking,
  initializeTracking,
  getMetrics,
  updateMetrics,
} from '@/services/agents-memory-service'

import {
  getDatabaseInfo,
  initializeDatabase,
  queryDbGraph,
  indexDbSchema,
  clearDbGraph,
  queryGraph,
  queryCodeGraph,
  indexCodeGraph,
  deleteCodeGraph,
} from '@/services/agents-graph-service'

import {
  listMessages as listAgentMessages,
  sendMessage as sendAgentMessage,
  getMessage as getAgentMessage,
  updateMessage as updateAgentMessage,
  deleteMessageById as deleteAgentMessage,
  forwardMessage as forwardAgentMessage,
  listAMPAddresses,
  addAMPAddressToAgent,
  getAMPAddress,
  updateAMPAddressOnAgent,
  removeAMPAddressFromAgent,
  listEmailAddresses,
  addEmailAddressToAgent,
  getEmailAddressDetail,
  updateEmailAddressOnAgent,
  removeEmailAddressFromAgent,
  queryEmailIndex,
} from '@/services/agents-messaging-service'

import {
  exportAgentZip,
  createTranscriptExportJob,
  importAgent,
  transferAgent,
} from '@/services/agents-transfer-service'

import {
  queryDocs,
  indexDocs,
  clearDocs,
} from '@/services/agents-docs-service'

import {
  getSkillsConfig,
  updateSkills,
  addSkill,
  removeSkill,
  getSkillSettings,
  saveSkillSettings,
} from '@/services/agents-skills-service'

import {
  getSubconsciousStatus as getAgentSubconsciousStatus,
  triggerSubconsciousAction,
} from '@/services/agents-subconscious-service'

import {
  listRepos,
  updateRepos,
  removeRepo,
} from '@/services/agents-repos-service'

import {
  getPlaybackState,
  controlPlayback,
} from '@/services/agents-playback-service'

import { createDockerAgent } from '@/services/agents-docker-service'

import {
  listSessions,
  listLocalSessions,
  createSession,
  deleteSession,
  renameSession,
  sendCommand,
  checkIdleStatus,
  listRestorableSessions,
  restoreSessions,
  deletePersistedSession,
  getActivity,
  broadcastActivityUpdate,
} from '@/services/sessions-service'

import {
  listHosts,
  addNewHost,
  updateExistingHost,
  deleteExistingHost,
  getHostIdentity,
  checkRemoteHealth,
  triggerMeshSync,
  getMeshStatus,
  registerPeer,
  exchangePeers,
} from '@/services/hosts-service'

import {
  getHealthStatus,
  getProviderInfo,
  registerAgent as registerAMPAgent,
  routeMessage,
  listPendingMessages,
  acknowledgePendingMessage,
  batchAcknowledgeMessages,
  sendReadReceipt,
  listAMPAgents,
  getAgentSelf,
  updateAgentSelf,
  deleteAgentSelf,
  resolveAgentAddress,
  revokeKey,
  rotateKey,
  rotateKeypair,
  deliverFederated,
} from '@/services/amp-service'

import {
  getMessages,
  sendMessage as sendGlobalMessage,
  updateMessage as updateGlobalMessage,
  removeMessage,
  forwardMessage as forwardGlobalMessage,
  getMeetingMessages,
  listMeetings,
  createNewMeeting,
  getMeetingById,
  updateExistingMeeting,
  deleteExistingMeeting,
} from '@/services/messages-service'

import {
  listAllTeams,
  createNewTeam,
  getTeamById,
  updateTeamById,
  deleteTeamById,
  listTeamTasks,
  createTeamTask,
  updateTeamTask,
  deleteTeamTask,
  listTeamDocuments,
  createTeamDocument,
  getTeamDocument,
  updateTeamDocument,
  deleteTeamDocument,
  notifyTeamAgents,
} from '@/services/teams-service'

import {
  listAllWebhooks,
  createNewWebhook,
  getWebhookById,
  deleteWebhookById,
  testWebhookById,
} from '@/services/webhooks-service'

import {
  listAllDomains,
  createNewDomain,
  getDomainById,
  updateDomainById,
  deleteDomainById,
} from '@/services/domains-service'

import {
  listMarketplaceSkills,
  getMarketplaceSkillById,
} from '@/services/marketplace-service'

import {
  createAssistantAgent,
  deleteAssistantAgent,
  getAssistantStatus,
} from '@/services/help-service'

import {
  buildPlugin,
  getBuildStatus,
  scanRepo,
  pushToGitHub,
} from '@/services/plugin-builder-service'

import {
  getSystemConfig,
  getOrganization,
  setOrganizationName,
  getSubconsciousStatus,
  getPtyDebugInfo,
  getDockerInfo,
  parseConversationFile,
  getConversationMessages,
  getExportJobStatus,
  deleteExportJob,
} from '@/services/config-service'

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

// Sentinel error class so the top-level handler can distinguish a malformed
// request body (client fault → 400) from an internal server fault (→ 500).
class JsonParseError extends Error {
  readonly status = 400
  constructor() {
    super('Invalid JSON body')
    this.name = 'JsonParseError'
  }
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8')
      if (!body) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch (e) {
        // Malformed request body is a client error — reject with a typed error
        // so the top-level catch block can return 400 instead of 500.
        reject(new JsonParseError())
      }
    })
    req.on('error', reject)
  })
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, statusCode: number, data: any, headers?: Record<string, string>) {
  let body: string
  try {
    body = JSON.stringify(data)
  } catch (e) {
    // Circular references or other non-serializable values — send a safe fallback.
    console.error('[Headless] Failed to serialize response data:', e)
    body = JSON.stringify({ error: 'Failed to serialize response data' })
    statusCode = 500
  }
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  })
  res.end(body)
}

function sendBinary(res: ServerResponse, statusCode: number, buffer: Buffer | Uint8Array, headers: Record<string, string>) {
  res.writeHead(statusCode, headers)
  res.end(buffer)
}

function sendServiceResult(res: ServerResponse, result: any) {
  // Presence of result.error is the sole indicator of an error response;
  // result.data may also be present (e.g. partial results) but must not
  // suppress error reporting.
  if (result.error) {
    sendJson(res, result.status || 500, { error: result.error }, result.headers)
  } else {
    sendJson(res, result.status || 200, result.data, result.headers)
  }
}

function getHeader(req: IncomingMessage, name: string): string | null {
  const val = req.headers[name.toLowerCase()]
  return typeof val === 'string' ? val : null
}

function getQuery(url: string): Record<string, string> {
  const parsed = parse(url, true)
  const q: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed.query)) {
    if (typeof v === 'string') q[k] = v
  }
  return q
}

/**
 * Minimal multipart form-data parser.
 * Handles the single use case: one file field + one text field for /api/agents/import.
 *
 * Operates entirely on raw Buffers so that binary file content is never corrupted
 * by a string encoding round-trip (the old latin1 approach mangled multi-byte data).
 * Only the MIME headers and plain-text fields are decoded as UTF-8.
 */
function parseMultipart(body: Buffer, contentType: string): { file: Buffer | null; options: string | null } {
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/)
  if (!boundaryMatch) return { file: null, options: null }

  const boundaryBuf = Buffer.from('--' + boundaryMatch[1])
  const crlfBuf = Buffer.from('\r\n')
  const doubleCrlfBuf = Buffer.from('\r\n\r\n')

  let file: Buffer | null = null
  let options: string | null = null

  let searchStart = 0
  while (searchStart < body.length) {
    // Find the next boundary delimiter in the raw buffer
    const boundaryIdx = body.indexOf(boundaryBuf, searchStart)
    if (boundaryIdx === -1) break

    // The two bytes after the boundary are either '--' (epilogue) or CRLF (part start)
    const afterBoundary = boundaryIdx + boundaryBuf.length
    if (afterBoundary + 1 < body.length &&
        body[afterBoundary] === 0x2d && body[afterBoundary + 1] === 0x2d) {
      break // Closing boundary '--<boundary>--'
    }

    // Skip the CRLF that follows the boundary line
    const partStart = afterBoundary + crlfBuf.length
    if (partStart >= body.length) break

    // Find end of MIME headers (double CRLF)
    const headerEnd = body.indexOf(doubleCrlfBuf, partStart)
    if (headerEnd === -1) break

    // Decode only the headers as UTF-8 (headers are always ASCII-safe)
    const headers = body.subarray(partStart, headerEnd).toString('utf8')

    // Content begins right after the double CRLF
    const contentStart = headerEnd + doubleCrlfBuf.length

    // Content ends at the CRLF immediately before the next boundary
    const nextBoundaryIdx = body.indexOf(boundaryBuf, contentStart)
    const contentEnd = nextBoundaryIdx === -1
      ? body.length
      : nextBoundaryIdx - crlfBuf.length // strip the CRLF preceding the boundary

    const contentBuf = body.subarray(contentStart, contentEnd)

    if (headers.includes('name="file"')) {
      // Preserve raw bytes — no encoding conversion
      file = contentBuf
    } else if (headers.includes('name="options"')) {
      // Text field: decode as UTF-8
      options = contentBuf.toString('utf8')
    }

    searchStart = nextBoundaryIdx === -1 ? body.length : nextBoundaryIdx
  }

  return { file, options }
}

// ---------------------------------------------------------------------------
// Route type definitions
// ---------------------------------------------------------------------------

type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  query: Record<string, string>
) => Promise<void>

interface Route {
  method: string
  pattern: RegExp
  paramNames: string[]
  handler: RouteHandler
}

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

const routes: Route[] = [
  // =========================================================================
  // Config & System
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/config$/, paramNames: [], handler: async (_req, res) => {
    // await is intentional: guards against future async refactors of getSystemConfig
    sendServiceResult(res, await getSystemConfig())
  }},
  { method: 'GET', pattern: /^\/api\/organization$/, paramNames: [], handler: async (_req, res) => {
    // await is intentional: guards against future async refactors of getOrganization
    sendServiceResult(res, await getOrganization())
  }},
  { method: 'POST', pattern: /^\/api\/organization$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, setOrganizationName(body))
  }},
  { method: 'GET', pattern: /^\/api\/subconscious$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getSubconsciousStatus())
  }},
  { method: 'GET', pattern: /^\/api\/debug\/pty$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await getPtyDebugInfo())
  }},
  { method: 'GET', pattern: /^\/api\/docker\/info$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await getDockerInfo())
  }},
  { method: 'POST', pattern: /^\/api\/conversations\/parse$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, parseConversationFile(body.filePath))
  }},
  { method: 'GET', pattern: /^\/api\/conversations\/([^/]+)\/messages$/, paramNames: ['file'], handler: async (_req, res, params, query) => {
    const result = await getConversationMessages(decodeURIComponent(params.file), query.agentId || '')
    sendServiceResult(res, result)
  }},
  { method: 'GET', pattern: /^\/api\/export\/jobs\/([^/]+)$/, paramNames: ['jobId'], handler: async (_req, res, params) => {
    sendServiceResult(res, getExportJobStatus(params.jobId))
  }},
  { method: 'DELETE', pattern: /^\/api\/export\/jobs\/([^/]+)$/, paramNames: ['jobId'], handler: async (_req, res, params) => {
    sendServiceResult(res, deleteExportJob(params.jobId))
  }},

  // =========================================================================
  // Sessions
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/sessions$/, paramNames: [], handler: async (_req, res, _params, query) => {
    // No local try/catch: errors propagate to the global handler in createHeadlessRouter().handle
    if (query.local === 'true') {
      const result = await listLocalSessions()
      sendServiceResult(res, { data: { sessions: result.sessions, fromCache: false }, status: 200 })
    } else {
      const result = await listSessions()
      sendServiceResult(res, { data: { sessions: result.sessions, fromCache: result.fromCache }, status: 200 })
    }
  }},
  { method: 'POST', pattern: /^\/api\/sessions\/create$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await createSession(body))
  }},
  { method: 'DELETE', pattern: /^\/api\/sessions\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await deleteSession(params.id))
  }},
  { method: 'GET', pattern: /^\/api\/sessions\/([^/]+)\/command$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const result = await checkIdleStatus(params.id)
    sendJson(res, 200, result)
  }},
  { method: 'POST', pattern: /^\/api\/sessions\/([^/]+)\/command$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await sendCommand(params.id, body))
  }},
  { method: 'PATCH', pattern: /^\/api\/sessions\/([^/]+)\/rename$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await renameSession(params.id, body.name))
  }},
  { method: 'GET', pattern: /^\/api\/sessions\/restore$/, paramNames: [], handler: async (_req, res) => {
    const result = await listRestorableSessions()
    sendJson(res, 200, result)
  }},
  { method: 'POST', pattern: /^\/api\/sessions\/restore$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await restoreSessions(body))
  }},
  { method: 'DELETE', pattern: /^\/api\/sessions\/restore$/, paramNames: [], handler: async (_req, res, _params, query) => {
    sendServiceResult(res, deletePersistedSession(query.sessionId || ''))
  }},
  { method: 'GET', pattern: /^\/api\/sessions\/activity$/, paramNames: [], handler: async (_req, res) => {
    // No local try/catch: errors propagate to the global handler in createHeadlessRouter().handle
    const activity = await getActivity()
    sendServiceResult(res, { data: { activity }, status: 200 })
  }},
  { method: 'POST', pattern: /^\/api\/sessions\/activity\/update$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    const result = broadcastActivityUpdate(body.sessionName, body.status, body.hookStatus, body.notificationType)
    sendServiceResult(res, result)
  }},

  // =========================================================================
  // Agents — core CRUD (static paths before parameterized)
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/agents\/unified$/, paramNames: [], handler: async (_req, res, _params, query) => {
    const parsedTimeout = query.timeout ? parseInt(query.timeout) : undefined
    sendServiceResult(res, await getUnifiedAgents({
      query: query.q || null,
      includeOffline: query.includeOffline !== 'false',
      timeout: (parsedTimeout !== undefined && !isNaN(parsedTimeout)) ? parsedTimeout : undefined,
    }))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/startup$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getStartupInfo())
  }},
  { method: 'POST', pattern: /^\/api\/agents\/startup$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await initializeStartup())
  }},
  { method: 'POST', pattern: /^\/api\/agents\/health$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await proxyHealthCheck(body.url))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/register$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, registerAgent(body))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/by-name\/([^/]+)$/, paramNames: ['name'], handler: async (_req, res, params) => {
    sendServiceResult(res, lookupAgentByName(params.name))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/email-index$/, paramNames: [], handler: async (_req, res, _params, query) => {
    sendServiceResult(res, await queryEmailIndex({
      addressQuery: query.address || undefined,
      agentIdQuery: query.agentId || undefined,
      federated: query.federated === 'true',
      isFederatedSubQuery: query.isFederatedSubQuery === 'true',
    }))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/docker\/create$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await createDockerAgent(body))
  }},
  // Agent import (multipart form-data)
  { method: 'POST', pattern: /^\/api\/agents\/import$/, paramNames: [], handler: async (req, res) => {
    try {
      const contentType = getHeader(req, 'content-type') || ''
      const rawBody = await readRawBody(req)
      const { file, options: optionsStr } = parseMultipart(rawBody, contentType)

      if (!file) {
        sendJson(res, 400, { error: 'No file provided' })
        return
      }

      let options = {}
      if (optionsStr) {
        try {
          options = JSON.parse(optionsStr)
        } catch (jsonError) {
          sendJson(res, 400, { error: `Invalid JSON for options: ${jsonError instanceof Error ? jsonError.message : 'Malformed JSON'}` })
          return
        }
      }
      const result = await importAgent(file, options)
      sendServiceResult(res, result)
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error during agent import' })
    }
  }},
  // Agent directory
  { method: 'GET', pattern: /^\/api\/agents\/directory$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getDirectory())
  }},
  { method: 'GET', pattern: /^\/api\/agents\/directory\/lookup\/([^/]+)$/, paramNames: ['name'], handler: async (_req, res, params) => {
    sendServiceResult(res, lookupAgentByDirectoryName(params.name))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/directory\/sync$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await syncDirectory())
  }},
  // Normalize hosts
  { method: 'GET', pattern: /^\/api\/agents\/normalize-hosts$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, diagnoseHosts())
  }},
  { method: 'POST', pattern: /^\/api\/agents\/normalize-hosts$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, normalizeHosts())
  }},
  // Agent list / create (must be AFTER static agent sub-paths)
  { method: 'GET', pattern: /^\/api\/agents$/, paramNames: [], handler: async (_req, res, _params, query) => {
    if (query.q) {
      sendServiceResult(res, searchAgentsByQuery(query.q))
    } else {
      sendServiceResult(res, await listAgents())
    }
  }},
  { method: 'POST', pattern: /^\/api\/agents$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, createNewAgent(body))
  }},

  // =========================================================================
  // Agents — parameterized [id] sub-routes (static sub-paths first)
  // =========================================================================

  // Session
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/session$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getAgentSessionStatus(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/session$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, linkAgentSession(params.id, body))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/session$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await sendAgentSessionCommand(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/session$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await unlinkOrDeleteAgentSession(params.id, {
      kill: query.kill === 'true',
      deleteAgent: query.deleteAgent === 'true',
    }))
  }},

  // Wake / Hibernate
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/wake$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await wakeAgent(params.id, body))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/hibernate$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await hibernateAgent(params.id, body))
  }},

  // Chat
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/chat$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    const parsedLimit = query.limit ? parseInt(query.limit) : undefined
    sendServiceResult(res, await getChatMessages(params.id, {
      since: query.since || undefined,
      limit: (parsedLimit !== undefined && !isNaN(parsedLimit)) ? parsedLimit : undefined,
    }))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/chat$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await sendChatMessage(params.id, body.message))
  }},

  // Memory
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/memory\/consolidate$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getConsolidationStatus(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/memory\/consolidate$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await triggerConsolidation(params.id, body))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/memory\/consolidate$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await manageConsolidation(params.id, body))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/memory\/long-term$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    const parsedLimit = query.limit ? parseInt(query.limit) : undefined
    const parsedMinConfidence = query.minConfidence ? parseFloat(query.minConfidence) : undefined
    const parsedMaxTokens = query.maxTokens ? parseInt(query.maxTokens) : undefined
    sendServiceResult(res, await queryLongTermMemories(params.id, {
      query: query.query || query.q,
      category: (query.category as any) || undefined,
      limit: (parsedLimit !== undefined && !isNaN(parsedLimit)) ? parsedLimit : undefined,
      includeRelated: query.includeRelated === 'true',
      minConfidence: (parsedMinConfidence !== undefined && !isNaN(parsedMinConfidence)) ? parsedMinConfidence : undefined,
      tier: (query.tier as any) || undefined,
      view: query.view,
      memoryId: query.id,
      maxTokens: (parsedMaxTokens !== undefined && !isNaN(parsedMaxTokens)) ? parsedMaxTokens : undefined,
    }))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/memory\/long-term$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await updateLongTermMemory(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/memory\/long-term$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    // query.id is required — an empty string would silently delete the wrong memory or cause
    // undefined behavior in the service; reject early with a clear client error.
    if (!query.id) {
      sendJson(res, 400, { error: 'Memory ID is required for deletion' })
      return
    }
    sendServiceResult(res, await deleteLongTermMemory(params.id, query.id))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/memory$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getMemory(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/memory$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await initializeMemory(params.id, body))
  }},

  // Search / Index
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/search$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    const parsedLimit = query.limit ? parseInt(query.limit) : undefined
    const parsedMinScore = query.minScore ? parseFloat(query.minScore) : undefined
    const parsedStartTs = query.startTs ? parseInt(query.startTs) : undefined
    const parsedEndTs = query.endTs ? parseInt(query.endTs) : undefined
    const parsedBm25Weight = query.bm25Weight ? parseFloat(query.bm25Weight) : undefined
    const parsedSemanticWeight = query.semanticWeight ? parseFloat(query.semanticWeight) : undefined
    sendServiceResult(res, await searchConversations(params.id, {
      query: query.q || query.query || '',
      mode: query.mode,
      limit: (parsedLimit !== undefined && !isNaN(parsedLimit)) ? parsedLimit : undefined,
      minScore: (parsedMinScore !== undefined && !isNaN(parsedMinScore)) ? parsedMinScore : undefined,
      roleFilter: (query.roleFilter as any) || undefined,
      conversationFile: query.conversationFile,
      startTs: (parsedStartTs !== undefined && !isNaN(parsedStartTs)) ? parsedStartTs : undefined,
      endTs: (parsedEndTs !== undefined && !isNaN(parsedEndTs)) ? parsedEndTs : undefined,
      useRrf: query.useRrf === 'true' ? true : query.useRrf === 'false' ? false : undefined,
      bm25Weight: (parsedBm25Weight !== undefined && !isNaN(parsedBm25Weight)) ? parsedBm25Weight : undefined,
      semanticWeight: (parsedSemanticWeight !== undefined && !isNaN(parsedSemanticWeight)) ? parsedSemanticWeight : undefined,
    }))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/search$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await ingestConversations(params.id, body))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/index-delta$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await runDeltaIndex(params.id, body))
  }},

  // Tracking / Metrics
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/tracking$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getTracking(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/tracking$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await initializeTracking(params.id, body))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/metrics$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, getMetrics(params.id))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/metrics$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateMetrics(params.id, body))
  }},

  // Graph - code
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/graph\/code$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    const parsedDepth = query.depth ? parseInt(query.depth) : undefined
    sendServiceResult(res, await queryCodeGraph(params.id, {
      action: query.action || '',
      name: query.name || null,
      from: query.from || null,
      to: query.to || null,
      project: query.project || null,
      nodeId: query.nodeId || null,
      depth: (parsedDepth !== undefined && !isNaN(parsedDepth)) ? parsedDepth : undefined,
    }))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/graph\/code$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await indexCodeGraph(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/graph\/code$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    // query.projectPath is required — an empty string would cause the service to target
    // the wrong or no project, potentially corrupting data; reject early.
    if (!query.projectPath) {
      sendJson(res, 400, { error: 'Project path is required for code graph deletion' })
      return
    }
    sendServiceResult(res, await deleteCodeGraph(params.id, query.projectPath))
  }},

  // Graph - db
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/graph\/db$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await queryDbGraph(params.id, {
      action: query.action || '',
      name: query.name || null,
      column: query.column || null,
      database: query.database || null,
    }))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/graph\/db$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await indexDbSchema(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/graph\/db$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    // query.database is required — an empty string would cause clearDbGraph to target
    // an unintended database; reject early with a clear client error.
    if (!query.database) {
      sendJson(res, 400, { error: 'Database name is required for graph deletion' })
      return
    }
    sendServiceResult(res, await clearDbGraph(params.id, query.database))
  }},

  // Graph - query
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/graph\/query$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await queryGraph(params.id, query as any))
  }},

  // Database
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/database$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getDatabaseInfo(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/database$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await initializeDatabase(params.id))
  }},

  // Docs
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/docs$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await queryDocs(params.id, query as any))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/docs$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await indexDocs(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/docs$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await clearDocs(params.id, query.project))
  }},

  // Skills
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/skills\/settings$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getSkillSettings(params.id))
  }},
  { method: 'PUT', pattern: /^\/api\/agents\/([^/]+)\/skills\/settings$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await saveSkillSettings(params.id, body))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/skills$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, getSkillsConfig(params.id))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/skills$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await updateSkills(params.id, body))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/skills$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, addSkill(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/skills$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, removeSkill(params.id, query.skill || ''))
  }},

  // Subconscious
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/subconscious$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getAgentSubconsciousStatus(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/subconscious$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await triggerSubconsciousAction(params.id, body))
  }},

  // Repos
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/repos$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, listRepos(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/repos$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateRepos(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/repos$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, removeRepo(params.id, query.url || ''))
  }},

  // Playback
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/playback$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, getPlaybackState(params.id, query.sessionId))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/playback$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, controlPlayback(params.id, body))
  }},

  // Export / Transfer
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/export$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const result = await exportAgentZip(params.id)
    if (result.error || !result.data) {
      sendServiceResult(res, result)
      return
    }
    const { buffer, filename, agentId, agentName } = result.data
    sendBinary(res, 200, new Uint8Array(buffer), {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
      'X-Agent-Id': agentId,
      'X-Agent-Name': agentName,
      'X-Export-Version': '1.0.0',
    })
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/export$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, createTranscriptExportJob(params.id, body))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/transfer$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await transferAgent(params.id, body))
  }},

  // AMP addresses
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/amp\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (_req, res, params) => {
    sendServiceResult(res, getAMPAddress(params.id, decodeURIComponent(params.address)))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/amp\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateAMPAddressOnAgent(params.id, decodeURIComponent(params.address), body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/amp\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (_req, res, params) => {
    sendServiceResult(res, removeAMPAddressFromAgent(params.id, decodeURIComponent(params.address)))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/amp\/addresses$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, listAMPAddresses(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/amp\/addresses$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, addAMPAddressToAgent(params.id, body))
  }},

  // Email addresses
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (_req, res, params) => {
    sendServiceResult(res, getEmailAddressDetail(params.id, decodeURIComponent(params.address)))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateEmailAddressOnAgent(params.id, decodeURIComponent(params.address), body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (_req, res, params) => {
    sendServiceResult(res, removeEmailAddressFromAgent(params.id, decodeURIComponent(params.address)))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, listEmailAddresses(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, addEmailAddressToAgent(params.id, body))
  }},

  // Agent messages
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/messages\/([^/]+)$/, paramNames: ['id', 'messageId'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await getAgentMessage(params.id, params.messageId, (query.box as any) || 'inbox'))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/messages\/([^/]+)$/, paramNames: ['id', 'messageId'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await updateAgentMessage(params.id, params.messageId, body))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/messages\/([^/]+)$/, paramNames: ['id', 'messageId'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await forwardAgentMessage(params.id, params.messageId, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/messages\/([^/]+)$/, paramNames: ['id', 'messageId'], handler: async (_req, res, params) => {
    sendServiceResult(res, await deleteAgentMessage(params.id, params.messageId))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/messages$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await listAgentMessages(params.id, query as any))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/messages$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await sendAgentMessage(params.id, body))
  }},

  // Metadata (uses agents-core-service getAgentById/updateAgentById)
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const result = getAgentById(params.id)
    if (result.error) {
      sendServiceResult(res, result)
    } else {
      sendServiceResult(res, { data: { metadata: result.data?.agent?.metadata || {} }, status: 200 })
    }
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (req, res, params) => {
    const metadata = await readJsonBody(req)
    const result = updateAgentById(params.id, { metadata })
    if (result.error) {
      sendServiceResult(res, result)
    } else {
      sendServiceResult(res, { data: { metadata: result.data?.agent?.metadata }, status: 200 })
    }
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const result = updateAgentById(params.id, { metadata: {} })
    if (result.error) {
      sendServiceResult(res, result)
    } else {
      sendServiceResult(res, { data: { success: true }, status: 200 })
    }
  }},

  // Agent CRUD (must be LAST among /api/agents/[id]/* routes)
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, getAgentById(params.id))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateAgentById(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, deleteAgentById(params.id, query.hard === 'true'))
  }},

  // =========================================================================
  // Hosts
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/hosts\/identity$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getHostIdentity())
  }},
  { method: 'GET', pattern: /^\/api\/hosts\/health$/, paramNames: [], handler: async (_req, res, _params, query) => {
    sendServiceResult(res, await checkRemoteHealth(query.url || ''))
  }},
  { method: 'GET', pattern: /^\/api\/hosts\/sync$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await getMeshStatus())
  }},
  { method: 'POST', pattern: /^\/api\/hosts\/sync$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await triggerMeshSync())
  }},
  { method: 'POST', pattern: /^\/api\/hosts\/register-peer$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await registerPeer(body))
  }},
  { method: 'POST', pattern: /^\/api\/hosts\/exchange-peers$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await exchangePeers(body))
  }},
  { method: 'GET', pattern: /^\/api\/hosts$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await listHosts())
  }},
  { method: 'POST', pattern: /^\/api\/hosts$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await addNewHost(body))
  }},
  { method: 'PUT', pattern: /^\/api\/hosts\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await updateExistingHost(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/hosts\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await deleteExistingHost(params.id))
  }},

  // =========================================================================
  // AMP v1
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/v1\/health$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getHealthStatus())
  }},
  { method: 'GET', pattern: /^\/api\/v1\/info$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getProviderInfo())
  }},
  { method: 'POST', pattern: /^\/api\/v1\/register$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    const authHeader = getHeader(req, 'Authorization')
    sendServiceResult(res, await registerAMPAgent(body, authHeader))
  }},
  { method: 'POST', pattern: /^\/api\/v1\/route$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    const result = await routeMessage(
      body,
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Forwarded-From'),
      getHeader(req, 'X-AMP-Envelope-Id'),
      getHeader(req, 'X-AMP-Signature'),
      getHeader(req, 'Content-Length'),
    )
    sendServiceResult(res, result)
  }},
  { method: 'GET', pattern: /^\/api\/v1\/agents\/me$/, paramNames: [], handler: async (req, res) => {
    sendServiceResult(res, getAgentSelf(getHeader(req, 'Authorization')))
  }},
  { method: 'PATCH', pattern: /^\/api\/v1\/agents\/me$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await updateAgentSelf(getHeader(req, 'Authorization'), body))
  }},
  { method: 'DELETE', pattern: /^\/api\/v1\/agents\/me$/, paramNames: [], handler: async (req, res) => {
    sendServiceResult(res, await deleteAgentSelf(getHeader(req, 'Authorization')))
  }},
  { method: 'GET', pattern: /^\/api\/v1\/agents\/resolve\/([^/]+)$/, paramNames: ['address'], handler: async (req, res, params) => {
    sendServiceResult(res, resolveAgentAddress(getHeader(req, 'Authorization'), decodeURIComponent(params.address)))
  }},
  { method: 'GET', pattern: /^\/api\/v1\/agents$/, paramNames: [], handler: async (req, res, _params, query) => {
    const authHeader = getHeader(req, 'Authorization')
    sendServiceResult(res, listAMPAgents(authHeader, query.search || null))
  }},
  { method: 'POST', pattern: /^\/api\/v1\/messages\/([^/]+)\/read$/, paramNames: ['id'], handler: async (req, res, params) => {
    const authHeader = getHeader(req, 'Authorization')
    let originalSender: string | undefined
    try {
      const body = await readJsonBody(req)
      originalSender = body.original_sender
    } catch { /* No body is fine */ }
    sendServiceResult(res, await sendReadReceipt(authHeader, params.id, originalSender))
  }},
  { method: 'GET', pattern: /^\/api\/v1\/messages\/pending$/, paramNames: [], handler: async (req, res, _params, query) => {
    const authHeader = getHeader(req, 'Authorization')
    const parsedLimit = query.limit ? parseInt(query.limit) : undefined
    sendServiceResult(res, listPendingMessages(authHeader, (parsedLimit !== undefined && !isNaN(parsedLimit)) ? parsedLimit : undefined))
  }},
  { method: 'DELETE', pattern: /^\/api\/v1\/messages\/pending$/, paramNames: [], handler: async (req, res, _params, query) => {
    const authHeader = getHeader(req, 'Authorization')
    sendServiceResult(res, acknowledgePendingMessage(authHeader, query.id || null))
  }},
  { method: 'POST', pattern: /^\/api\/v1\/messages\/pending$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    const authHeader = getHeader(req, 'Authorization')
    sendServiceResult(res, batchAcknowledgeMessages(authHeader, body.ids))
  }},
  { method: 'DELETE', pattern: /^\/api\/v1\/auth\/revoke-key$/, paramNames: [], handler: async (req, res) => {
    sendServiceResult(res, revokeKey(getHeader(req, 'Authorization')))
  }},
  { method: 'POST', pattern: /^\/api\/v1\/auth\/rotate-key$/, paramNames: [], handler: async (req, res) => {
    sendServiceResult(res, rotateKey(getHeader(req, 'Authorization')))
  }},
  { method: 'POST', pattern: /^\/api\/v1\/auth\/rotate-keys$/, paramNames: [], handler: async (req, res) => {
    sendServiceResult(res, await rotateKeypair(getHeader(req, 'Authorization')))
  }},
  { method: 'POST', pattern: /^\/api\/v1\/federation\/deliver$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    const result = await deliverFederated(
      getHeader(req, 'X-AMP-Provider'),
      body,
    )
    sendServiceResult(res, result)
  }},

  // =========================================================================
  // Messages (global)
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/messages\/meeting$/, paramNames: [], handler: async (_req, res, _params, query) => {
    sendServiceResult(res, await getMeetingMessages(query as any))
  }},
  { method: 'POST', pattern: /^\/api\/messages\/forward$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await forwardGlobalMessage(body))
  }},
  { method: 'GET', pattern: /^\/api\/messages$/, paramNames: [], handler: async (_req, res, _params, query) => {
    sendServiceResult(res, await getMessages(query as any))
  }},
  { method: 'POST', pattern: /^\/api\/messages$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await sendGlobalMessage(body))
  }},
  { method: 'PATCH', pattern: /^\/api\/messages$/, paramNames: [], handler: async (_req, res, _params, query) => {
    sendServiceResult(res, await updateGlobalMessage(query.agent || null, query.id || null, query.action || null))
  }},
  { method: 'DELETE', pattern: /^\/api\/messages$/, paramNames: [], handler: async (_req, res, _params, query) => {
    sendServiceResult(res, await removeMessage(query.agent || null, query.id || null))
  }},

  // =========================================================================
  // Meetings
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/meetings\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, getMeetingById(params.id))
  }},
  { method: 'PATCH', pattern: /^\/api\/meetings\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateExistingMeeting(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/meetings\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, deleteExistingMeeting(params.id))
  }},
  { method: 'GET', pattern: /^\/api\/meetings$/, paramNames: [], handler: async (_req, res, _params, query) => {
    sendServiceResult(res, listMeetings(query.status))
  }},
  { method: 'POST', pattern: /^\/api\/meetings$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, createNewMeeting(body))
  }},

  // =========================================================================
  // Teams
  // =========================================================================
  { method: 'POST', pattern: /^\/api\/teams\/notify$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await notifyTeamAgents(body))
  }},
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)\/tasks\/([^/]+)$/, paramNames: ['id', 'taskId'], handler: async (_req, res, _params) => {
    // GET single task not implemented in route — taskId routes only have PUT/DELETE
    sendJson(res, 405, { error: 'Method not allowed' })
  }},
  { method: 'PUT', pattern: /^\/api\/teams\/([^/]+)\/tasks\/([^/]+)$/, paramNames: ['id', 'taskId'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateTeamTask(params.id, params.taskId, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/teams\/([^/]+)\/tasks\/([^/]+)$/, paramNames: ['id', 'taskId'], handler: async (_req, res, params) => {
    sendServiceResult(res, deleteTeamTask(params.id, params.taskId))
  }},
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)\/tasks$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, listTeamTasks(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/teams\/([^/]+)\/tasks$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, createTeamTask(params.id, body))
  }},
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)\/documents\/([^/]+)$/, paramNames: ['id', 'docId'], handler: async (_req, res, params) => {
    sendServiceResult(res, getTeamDocument(params.id, params.docId))
  }},
  { method: 'PUT', pattern: /^\/api\/teams\/([^/]+)\/documents\/([^/]+)$/, paramNames: ['id', 'docId'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateTeamDocument(params.id, params.docId, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/teams\/([^/]+)\/documents\/([^/]+)$/, paramNames: ['id', 'docId'], handler: async (_req, res, params) => {
    sendServiceResult(res, deleteTeamDocument(params.id, params.docId))
  }},
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)\/documents$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, listTeamDocuments(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/teams\/([^/]+)\/documents$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, createTeamDocument(params.id, body))
  }},
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, getTeamById(params.id))
  }},
  { method: 'PUT', pattern: /^\/api\/teams\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateTeamById(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/teams\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, deleteTeamById(params.id))
  }},
  { method: 'GET', pattern: /^\/api\/teams$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, listAllTeams())
  }},
  { method: 'POST', pattern: /^\/api\/teams$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, createNewTeam(body))
  }},

  // =========================================================================
  // Webhooks
  // =========================================================================
  { method: 'POST', pattern: /^\/api\/webhooks\/([^/]+)\/test$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await testWebhookById(params.id))
  }},
  { method: 'GET', pattern: /^\/api\/webhooks\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, getWebhookById(params.id))
  }},
  { method: 'DELETE', pattern: /^\/api\/webhooks\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, deleteWebhookById(params.id))
  }},
  { method: 'GET', pattern: /^\/api\/webhooks$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, listAllWebhooks())
  }},
  { method: 'POST', pattern: /^\/api\/webhooks$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, createNewWebhook(body))
  }},

  // =========================================================================
  // Domains
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/domains\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, getDomainById(params.id))
  }},
  { method: 'PATCH', pattern: /^\/api\/domains\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateDomainById(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/domains\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, deleteDomainById(params.id))
  }},
  { method: 'GET', pattern: /^\/api\/domains$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, listAllDomains())
  }},
  { method: 'POST', pattern: /^\/api\/domains$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, createNewDomain(body))
  }},

  // =========================================================================
  // Marketplace
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/marketplace\/skills\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getMarketplaceSkillById(params.id))
  }},
  { method: 'GET', pattern: /^\/api\/marketplace\/skills$/, paramNames: [], handler: async (_req, res, _params, query) => {
    sendServiceResult(res, await listMarketplaceSkills(query as any))
  }},

  // =========================================================================
  // Help
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/help\/agent$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await getAssistantStatus())
  }},
  { method: 'POST', pattern: /^\/api\/help\/agent$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await createAssistantAgent())
  }},
  { method: 'DELETE', pattern: /^\/api\/help\/agent$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await deleteAssistantAgent())
  }},

  // =========================================================================
  // Plugin Builder
  // =========================================================================
  { method: 'POST', pattern: /^\/api\/plugin-builder\/build$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await buildPlugin(body))
  }},
  { method: 'GET', pattern: /^\/api\/plugin-builder\/builds\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getBuildStatus(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/plugin-builder\/scan-repo$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await scanRepo(body.url, body.ref))
  }},
  { method: 'POST', pattern: /^\/api\/plugin-builder\/push$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await pushToGitHub(body))
  }},
]

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

function matchRoute(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue

    const match = pathname.match(route.pattern)
    if (!match) continue

    const params: Record<string, string> = {}
    route.paramNames.forEach((name, i) => {
      params[name] = match[i + 1]
    })

    return { handler: route.handler, params }
  }
  return null
}

export function createHeadlessRouter() {
  return {
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const parsedUrl = parse(req.url || '', true)
      const pathname = parsedUrl.pathname || '/'
      const method = req.method || 'GET'
      const query = getQuery(req.url || '')

      const matched = matchRoute(method, pathname)
      if (!matched) {
        return false // Not handled — caller should return 404
      }

      try {
        await matched.handler(req, res, matched.params, query)
      } catch (error) {
        // JsonParseError is a client fault (malformed request body) — return 400,
        // not 500, so callers receive an accurate signal without server-side noise.
        const statusCode = error instanceof JsonParseError ? 400 : 500
        const message = error instanceof JsonParseError ? (error as JsonParseError).message : 'Internal server error'
        if (statusCode === 500) {
          console.error(`[Headless] Error handling ${method} ${pathname}:`, error)
        }
        if (!res.headersSent) {
          sendJson(res, statusCode, { error: message })
        } else if (!res.writableEnded) {
          // Headers already sent (partial response started before the error); just
          // close the connection — we cannot send a new status code at this point.
          res.end()
        }
      }

      return true // Handled
    },
  }
}
