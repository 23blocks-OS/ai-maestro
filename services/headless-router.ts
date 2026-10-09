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
  recallMemories,
  getMemoryEntity,
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
  getMemorySettings,
  updateMemorySettings,
  removeMemoryApiKey,
  testMemoryClassifier,
} from '@/services/memory-settings-service'

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
  listCanvasFiles,
  getCanvasFile,
  submitInteraction,
  listInteractions,
} from '@/services/agents-canvas-service'

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

import { wakeAgentRequest, hibernateAgentRequest } from '@/services/agents-wake-service'
import { getOwnSchedule, setOwnSchedule } from '@/services/agent-own-schedule-service'
import { getPendingWakesReport } from '@/services/pending-wakes-service'
import { logClientEvent } from '@/services/debug-service'
import { receiveClaudeLogs, receiveClaudeMetrics } from '@/services/telemetry-service'
import { getWellKnownDocument } from '@/services/amp-discovery-service'
import { initUpload, receiveContent, confirmUpload, getAttachmentStatus, downloadContent, downloadHeaders } from '@/services/amp-attachments-service'
import { MAX_ATTACHMENT_SIZE } from '@/lib/amp-attachments'
import { isServiceError } from '@/services/service-errors'
import { createDockerAgent, recreateDockerAgent, getDockerStats } from '@/services/agents-docker-service'
import { createCloudAgent, destroyCloudAgent, getCloudAgentStatus } from '@/services/agents-cloud-service'

import {
  getAllSchedules,
  getAgentSchedules,
  getScheduleById,
  createAgentSchedule,
  updateAgentSchedule,
  deleteAgentSchedule,
  triggerSchedule,
  getScheduleExecutions,
  getAllExecutions,
} from '@/services/agents-schedule-service'

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
  httpGet,
  broadcastActivityUpdate,
  heartbeat,
} from '@/services/sessions-service'
import { ringDoorbellService } from '@/services/doorbell-service'
import { getSnapshots, ingestStatusSnapshot, MAX_REPORT_CHARS } from '@/services/status-snapshots-service'

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
  reactivateHost,
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
  getAgentCard,
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

import { runDiagnostics } from '@/services/diagnostics-service'

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** A request the client got wrong (bad JSON, bad path escape): answered 400, never 500. */
class BadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadRequestError'
  }
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8')
      if (!body) return resolve({})
      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch (e) {
        return reject(new BadRequestError('Invalid JSON body'))
      }
      // Handlers read fields off the body: null and bare scalars are not a body
      if (parsed === null || typeof parsed !== 'object') {
        return reject(new BadRequestError('Body must be a JSON object'))
      }
      resolve(parsed)
    })
    req.on('error', reject)
  })
}

/** Read at most `max` bytes of a body as text; `tooLarge` is true when the sender kept going past it */
async function readBoundedText(req: IncomingMessage, max: number): Promise<{ text: string; tooLarge: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > max) { tooLarge = true; return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve({ text: tooLarge ? '' : Buffer.concat(chunks).toString('utf-8'), tooLarge }))
    req.on('error', reject)
  })
}

/** Read a binary body, giving up (tooLarge) once it passes `max` bytes instead of buffering it all */
async function readBoundedBuffer(req: IncomingMessage, max: number): Promise<{ bytes: Buffer; tooLarge: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > max) { tooLarge = true; return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve({ bytes: tooLarge ? Buffer.alloc(0) : Buffer.concat(chunks), tooLarge }))
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
  const body = JSON.stringify(data)
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
  if (result.data !== undefined) {
    sendJson(res, result.status || 200, result.data, result.headers)
  } else {
    const fallbackStatus = (result.status && result.status >= 400) ? result.status : 500
    sendJson(res, fallbackStatus, { error: 'internal_error', message: 'Unknown error' }, result.headers)
  }
}

function getHeader(req: IncomingMessage, name: string): string | null {
  const val = req.headers[name.toLowerCase()]
  return typeof val === 'string' ? val : null
}

/** URLSearchParams.get() semantics (null when absent), as the Next routes read it */
function qp(query: Record<string, string>, key: string): string | null {
  return Object.prototype.hasOwnProperty.call(query, key) ? query[key] : null
}

function getQuery(url: string): Record<string, string> {
  const parsed = parse(url, true)
  const q: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed.query)) {
    // A repeated key keeps its first value, as URLSearchParams.get() does
    if (typeof v === 'string') q[k] = v
    else if (Array.isArray(v) && typeof v[0] === 'string') q[k] = v[0]
  }
  return q
}

/**
 * Minimal multipart form-data parser.
 * Handles the single use case: one file field + one text field for /api/agents/import.
 */
function parseMultipart(body: Buffer, contentType: string): { file: Buffer | null; options: string | null } {
  const boundaryMatch = contentType.match(/boundary=([^\s;]+)/)
  if (!boundaryMatch) return { file: null, options: null }

  const boundary = '--' + boundaryMatch[1]
  const bodyStr = body.toString('latin1')
  const parts = bodyStr.split(boundary).slice(1, -1) // Remove preamble and epilogue

  let file: Buffer | null = null
  let options: string | null = null

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd === -1) continue

    const headers = part.substring(0, headerEnd)
    const content = part.substring(headerEnd + 4).replace(/\r\n$/, '')

    if (headers.includes('name="file"')) {
      // Convert back to buffer from latin1 encoding
      file = Buffer.from(content, 'latin1')
    } else if (headers.includes('name="options"')) {
      options = content
    }
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
  // Operator report: messages on disk that no wake has proved the agent saw
  { method: 'GET', pattern: /^\/api\/messages\/pending-wakes$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await getPendingWakesReport())
  }},
  // The dashboard reports each page load so an unexplained reset can be diagnosed from the log
  { method: 'POST', pattern: /^\/api\/debug\/client-event$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req).catch(() => ({}))
    sendServiceResult(res, logClientEvent(body, getHeader(req, 'user-agent')))
  }},
  // OTLP/HTTP receivers: always 200 so the exporter never retry-storms
  { method: 'POST', pattern: /^\/api\/telemetry\/v1\/logs$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req).catch(() => ({}))
    sendServiceResult(res, receiveClaudeLogs(body))
  }},
  { method: 'POST', pattern: /^\/api\/telemetry\/v1\/metrics$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req).catch(() => ({}))
    sendServiceResult(res, receiveClaudeMetrics(body))
  }},
  { method: 'GET', pattern: /^\/api\/config$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getSystemConfig())
  }},
  { method: 'GET', pattern: /^\/api\/organization$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getOrganization())
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
  { method: 'GET', pattern: /^\/api\/diagnostics$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await runDiagnostics())
  }},
  { method: 'GET', pattern: /^\/api\/docker\/info$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await getDockerInfo())
  }},
  { method: 'GET', pattern: /^\/api\/docker\/stats$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await getDockerStats())
  }},
  { method: 'POST', pattern: /^\/api\/conversations\/parse$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, parseConversationFile(body.conversationFile))
  }},
  { method: 'GET', pattern: /^\/api\/conversations\/([^/]+)\/messages$/, paramNames: ['file'], handler: async (_req, res, params, query) => {
    const result = await getConversationMessages(params.file, query.agentId || '')
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
    try {
      if (query.local === 'true') {
        const result = await listLocalSessions()
        sendJson(res, 200, { sessions: result.sessions, fromCache: false })
      } else {
        const result = await listSessions()
        sendJson(res, 200, { sessions: result.sessions, fromCache: result.fromCache })
      }
    } catch (error) {
      sendJson(res, 500, { error: 'Failed to fetch sessions', sessions: [] })
    }
  }},
  { method: 'POST', pattern: /^\/api\/sessions\/create$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await createSession(body))
  }},
  { method: 'GET', pattern: /^\/api\/sessions\/([^/]+)\/command$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const data = await checkIdleStatus(params.id)
    sendJson(res, 200, { success: true, ...data })
  }},
  { method: 'POST', pattern: /^\/api\/sessions\/([^/]+)\/command$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await sendCommand(params.id, body.command, {
      requireIdle: body.requireIdle,
      addNewline: body.addNewline,
      verify: body.verify,
    }))
  }},
  { method: 'PATCH', pattern: /^\/api\/sessions\/([^/]+)\/rename$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await renameSession(params.id, body.newName))
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
  // Static DELETE paths (restore) must be registered BEFORE the parameterized one
  { method: 'DELETE', pattern: /^\/api\/sessions\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await deleteSession(params.id))
  }},
  { method: 'GET', pattern: /^\/api\/sessions\/activity$/, paramNames: [], handler: async (_req, res, _params, query) => {
    try {
      const activity = await getActivity()
      // Status snapshots ride beside the activity: a failure here must not cost the activity
      let snapshots = {}
      try { snapshots = getSnapshots({ localOnly: query.local === 'true', httpGet }) } catch { /* no snapshots */ }
      sendJson(res, 200, { activity, snapshots })
    } catch (error) {
      sendJson(res, 500, { error: 'Failed to fetch activity', activity: {} })
    }
  }},
  { method: 'POST', pattern: /^\/api\/sessions\/activity\/update$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    const result = broadcastActivityUpdate(body.sessionName, body.status, body.hookStatus, body.notificationType, body.agentId, body.hookState)
    sendServiceResult(res, result)
  }},

  // =========================================================================
  // Agents — core CRUD (static paths before parameterized)
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/agents\/unified$/, paramNames: [], handler: async (_req, res, _params, query) => {
    sendServiceResult(res, await getUnifiedAgents({
      query: query.q || null,
      includeOffline: query.includeOffline !== 'false',
      timeout: query.timeout ? parseInt(query.timeout) : undefined,
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
  // Cloud agent endpoints (EC2 / ECS Fargate)
  { method: 'POST', pattern: /^\/api\/agents\/cloud\/create$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await createCloudAgent(body))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/cloud\/([^/]+)\/destroy$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await destroyCloudAgent(params.id))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/cloud\/([^/]+)\/status$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getCloudAgentStatus(params.id))
  }},
  // Docker agent recreate (atomic re-provision)
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/recreate$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await recreateDockerAgent(params.id))
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

      const options = optionsStr ? JSON.parse(optionsStr) : {}
      const result = await importAgent(file, options)
      sendServiceResult(res, result)
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' })
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
    // No body or invalid JSON: defaults, as in the Next route
    const body = await readJsonBody(req).catch(() => ({}))
    sendServiceResult(res, await wakeAgentRequest(params.id, body))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/hibernate$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req).catch(() => ({}))
    sendServiceResult(res, await hibernateAgentRequest(params.id, body))
  }},

  // Chat
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/chat$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await getChatMessages(params.id, {
      since: query.since || undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
    }))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/chat$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await sendChatMessage(params.id, body.message))
  }},

  // Memory maintenance sweep (runs every agent's due index/consolidate tasks)
  { method: 'GET', pattern: /^\/api\/memory\/sweep$/, paramNames: [], handler: async (_req, res) => {
    const { listIndexableAgents } = await import('@/lib/memory/sweep')
    sendJson(res, 200, { eligible: listIndexableAgents().length })
  }},
  { method: 'POST', pattern: /^\/api\/memory\/sweep$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req).catch(() => ({}))
    const { sweepAgentMemory } = await import('@/lib/memory/sweep')
    try {
      const result = await sweepAgentMemory({ limit: body?.limit, minAgeMs: body?.minAgeMs, only: body?.only, scheduled: body?.scheduled === true })
      sendJson(res, 200, { success: true, ...result })
    } catch (error) {
      sendJson(res, 500, { success: false, error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }},

  // Living avatars (lib/avatar-loops.ts)
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/avatar-loops$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const { listAvatarLoops } = await import('@/lib/avatar-loops')
    sendJson(res, 200, { states: listAvatarLoops(params.id) }, { 'Cache-Control': 'max-age=60' })
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/avatar-loops\/([^/]+)$/, paramNames: ['id', 'state'], handler: async (req, res, params) => {
    const { avatarLoopPath, parseRange } = await import('@/lib/avatar-loops')
    const fsMod = await import('fs')
    const file = avatarLoopPath(params.id, params.state.replace(/\.mp4$/, ''))
    if (!file) { sendJson(res, 404, { error: 'not_found' }); return }
    const size = fsMod.statSync(file).size
    const range = parseRange(req.headers.range || null, size)
    const headers: Record<string, string> = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'max-age=3600' }
    if (range) {
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': String(range.end - range.start + 1) })
      fsMod.createReadStream(file, { start: range.start, end: range.end }).pipe(res)
    } else {
      res.writeHead(200, { ...headers, 'Content-Length': String(size) })
      fsMod.createReadStream(file).pipe(res)
    }
  }},

  // Folder picker (was Next-only, so the picker failed on headless hosts)
  { method: 'GET', pattern: /^\/api\/browse$/, paramNames: [], handler: async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    const { browseDirectory, browseRemote } = await import('@/services/browse-service')
    const host = url.searchParams.get('host')
    const requestedPath = url.searchParams.get('path')
    sendServiceResult(res, host ? await browseRemote(host, requestedPath) : browseDirectory(requestedPath))
  }},
  { method: 'POST', pattern: /^\/api\/browse$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req).catch(() => ({}))
    const { createFolder } = await import('@/services/browse-service')
    sendServiceResult(res, createFolder(body?.parent, body?.name))
  }},

  // Night backlog: keep consolidating agents with unprocessed history (2-8 AM)
  { method: 'POST', pattern: /^\/api\/memory\/backlog$/, paramNames: [], handler: async (_req, res) => {
    const { startMemoryBacklog } = await import('@/services/agents-memory-service')
    sendServiceResult(res, await startMemoryBacklog())
  }},

  // Memory classifier settings (host-level)
  { method: 'GET', pattern: /^\/api\/settings\/memory$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getMemorySettings())
  }},
  { method: 'PUT', pattern: /^\/api\/settings\/memory$/, paramNames: [], handler: async (req, res) => {
    sendServiceResult(res, updateMemorySettings(await readJsonBody(req)))
  }},
  { method: 'DELETE', pattern: /^\/api\/settings\/memory$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, removeMemoryApiKey())
  }},
  { method: 'POST', pattern: /^\/api\/settings\/memory\/test$/, paramNames: [], handler: async (req, res) => {
    sendServiceResult(res, await testMemoryClassifier(await readJsonBody(req)))
  }},

  // Memory
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/memory\/consolidate$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getConsolidationStatus(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/memory\/consolidate$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    // Options travel in the query string (the Next route ignores the body)
    sendServiceResult(res, await triggerConsolidation(params.id, {
      dryRun: qp(query, 'dryRun') === 'true',
      provider: qp(query, 'provider') || undefined,
      maxConversations: qp(query, 'maxConversations') ? parseInt(qp(query, 'maxConversations')!) : undefined,
    }))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/memory\/consolidate$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await manageConsolidation(params.id, {
      action: body.action,
      minReinforcements: body.minReinforcements,
      minAgeDays: body.minAgeDays,
      retentionDays: body.retentionDays,
      dryRun: body.dryRun,
    }))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/memory\/entity$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await getMemoryEntity(params.id, query.name))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/memory\/recall$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await recallMemories(params.id, {
      query: query.q,
      limit: query.limit ? Number(query.limit) : undefined,
      maxDistance: query.maxDistance ? Number(query.maxDistance) : undefined,
    }))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/memory\/long-term$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await queryLongTermMemories(params.id, {
      query: query.query || query.q,
      category: (query.category as any) || undefined,
      limit: query.limit ? parseInt(query.limit) : undefined,
      includeRelated: query.includeRelated === 'true',
      minConfidence: query.minConfidence ? parseFloat(query.minConfidence) : undefined,
      tier: (query.tier as any) || undefined,
      view: query.view,
      memoryId: query.id,
      maxTokens: query.maxTokens ? parseInt(query.maxTokens) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
      includeFaded: query.includeFaded === 'true',
      focus: query.focus,
    }))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/memory\/long-term$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await updateLongTermMemory(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/memory\/long-term$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await deleteLongTermMemory(params.id, query.id || ''))
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
    sendServiceResult(res, await searchConversations(params.id, {
      query: query.q || query.query || '',
      mode: query.mode,
      limit: query.limit ? parseInt(query.limit) : undefined,
      minScore: query.minScore ? parseFloat(query.minScore) : undefined,
      roleFilter: qp(query, 'role') as 'user' | 'assistant' | 'system' | null,
      conversationFile: query.conversation_file || undefined,
      startTs: query.startTs ? parseInt(query.startTs) : undefined,
      endTs: query.endTs ? parseInt(query.endTs) : undefined,
      useRrf: query.useRrf !== 'false',
      bm25Weight: query.bm25Weight ? parseFloat(query.bm25Weight) : undefined,
      semanticWeight: query.semanticWeight ? parseFloat(query.semanticWeight) : undefined,
    }))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/search$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await ingestConversations(params.id, {
      conversationFiles: body.conversationFiles,
      batchSize: body.batchSize,
    }))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/index-delta$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    // Options travel in the query string (the Next route ignores the body)
    sendServiceResult(res, await runDeltaIndex(params.id, {
      dryRun: qp(query, 'dryRun') === 'true',
      batchSize: qp(query, 'batchSize') ? parseInt(qp(query, 'batchSize')!) : undefined,
    }))
  }},

  // Doorbell: a same-host sender rings after writing the inbox file (lib/doorbell.ts)
  { method: 'POST', pattern: /^\/api\/messages\/doorbell$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await ringDoorbellService(body))
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
  // The status line reports the live session values (see services/status-snapshots-service.ts)
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/status-snapshot$/, paramNames: ['id'], handler: async (req, res, params) => {
    const { text, tooLarge } = await readBoundedText(req, MAX_REPORT_CHARS)
    if (tooLarge) { sendJson(res, 413, { error: 'payload_too_large', message: `body exceeds ${MAX_REPORT_CHARS} characters` }); return }
    let body: unknown
    try { body = JSON.parse(text) } catch { sendJson(res, 400, { error: 'invalid_request', message: 'body must be JSON' }); return }
    sendServiceResult(res, ingestStatusSnapshot(params.id, body))
  }},

  // Graph - code
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/graph\/code$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await queryCodeGraph(params.id, {
      action: qp(query, 'action') || 'stats',
      name: qp(query, 'name'),
      from: qp(query, 'from'),
      to: qp(query, 'to'),
      project: qp(query, 'project'),
      nodeId: qp(query, 'nodeId'),
      depth: parseInt(qp(query, 'depth') || '1', 10),
    }))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/graph\/code$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await indexCodeGraph(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/graph\/code$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await deleteCodeGraph(params.id, query.project || ''))
  }},

  // Graph - db
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/graph\/db$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await queryDbGraph(params.id, {
      action: qp(query, 'action') || 'stats',
      name: qp(query, 'name'),
      column: qp(query, 'column'),
      database: qp(query, 'database'),
    }))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/graph\/db$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await indexDbSchema(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/graph\/db$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await clearDbGraph(params.id, query.database || ''))
  }},

  // Graph - query
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/graph\/query$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await queryGraph(params.id, {
      queryType: qp(query, 'q'),
      name: qp(query, 'name'),
      type: qp(query, 'type'),
      from: qp(query, 'from'),
      to: qp(query, 'to'),
    }))
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
    sendServiceResult(res, await queryDocs(params.id, {
      action: qp(query, 'action') || 'stats',
      q: qp(query, 'q'),
      keyword: qp(query, 'keyword'),
      type: qp(query, 'type'),
      docId: qp(query, 'docId'),
      limit: parseInt(qp(query, 'limit') || '10', 10),
      project: qp(query, 'project'),
    }))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/docs$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await indexDocs(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/docs$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await clearDocs(params.id, query.project || undefined))
  }},

  // Canvas interactions (must come before /canvas catch-all)
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/canvas\/interactions$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await submitInteraction(params.id, body))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/canvas\/interactions$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, listInteractions(params.id, parseInt(query.limit || '50', 10)))
  }},

  // Canvas
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/canvas$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    if (query.file) {
      const result = getCanvasFile(params.id, query.file)
      if (result.status !== 200 || !result.data || ('error' in result.data && 'message' in result.data)) {
        sendServiceResult(res, result)
        return
      }
      const { content, fileName } = result.data as { content: string; fileName: string; size: number }
      const buf = Buffer.from(content, 'utf-8')
      sendBinary(res, 200, buf, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': String(buf.length),
        'X-Canvas-File': fileName,
      })
    } else {
      sendServiceResult(res, listCanvasFiles(params.id))
    }
  }},

  // Skills
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/skills\/settings$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getSkillSettings(params.id))
  }},
  { method: 'PUT', pattern: /^\/api\/agents\/([^/]+)\/skills\/settings$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await saveSkillSettings(params.id, body.settings))
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
    if (!query.skill) { sendJson(res, 400, { error: 'Missing required query parameter: skill' }); return }
    sendServiceResult(res, removeSkill(params.id, query.skill, query.type || 'auto'))
  }},

  // The agent's OWN schedule (agent-owned state, lib/agent-schedule.ts)
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/schedule$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, getOwnSchedule(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/schedule$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req).catch(() => ({}))
    sendServiceResult(res, await setOwnSchedule(params.id, body))
  }},

  // Schedules (per-agent)
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/schedules\/([^/]+)$/, paramNames: ['id', 'scheduleId'], handler: async (_req, res, params, query) => {
    if (query.executions === 'true') {
      const limit = parseInt(query.limit || '20', 10)
      sendServiceResult(res, getScheduleExecutions(params.scheduleId, limit))
    } else {
      sendServiceResult(res, getScheduleById(params.scheduleId))
    }
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/schedules\/([^/]+)$/, paramNames: ['id', 'scheduleId'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateAgentSchedule(params.scheduleId, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/schedules\/([^/]+)$/, paramNames: ['id', 'scheduleId'], handler: async (_req, res, params) => {
    sendServiceResult(res, deleteAgentSchedule(params.scheduleId))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/schedules$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, getAgentSchedules(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/schedules$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, createAgentSchedule(params.id, body))
  }},

  // Schedules (global)
  { method: 'GET', pattern: /^\/api\/schedules$/, paramNames: [], handler: async (_req, res, _params, query) => {
    if (query.executions === 'true') {
      const limit = parseInt(query.limit || '50', 10)
      sendServiceResult(res, getAllExecutions(limit))
    } else {
      sendServiceResult(res, getAllSchedules())
    }
  }},
  { method: 'POST', pattern: /^\/api\/schedules\/([^/]+)\/trigger$/, paramNames: ['scheduleId'], handler: async (req, res, params) => {
    let triggeredBy: 'manual' | 'webhook' = 'manual'
    try {
      const body = await readJsonBody(req)
      if (body.triggeredBy === 'webhook') triggeredBy = 'webhook'
    } catch {}
    sendServiceResult(res, await triggerSchedule(params.scheduleId, triggeredBy))
  }},

  // Subconscious
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/subconscious$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getAgentSubconsciousStatus(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/subconscious$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await triggerSubconsciousAction(params.id, body.action))
  }},

  // Brain Inbox
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/brain-inbox$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const { readAndClearBrainInbox } = await import('@/lib/cerebellum/brain-inbox')
    const signals = readAndClearBrainInbox(params.id)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ signals }))
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
    if (!query.url) { sendJson(res, 400, { error: 'url parameter required' }); return }
    sendServiceResult(res, removeRepo(params.id, query.url))
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
    try {
      const result = await exportAgentZip(params.id)
      if (!result.data || 'error' in result.data) {
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
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to export agent' })
    }
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
    sendServiceResult(res, getAMPAddress(params.id, params.address))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/amp\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateAMPAddressOnAgent(params.id, params.address, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/amp\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (_req, res, params) => {
    sendServiceResult(res, removeAMPAddressFromAgent(params.id, params.address))
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
    sendServiceResult(res, getEmailAddressDetail(params.id, params.address))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, updateEmailAddressOnAgent(params.id, params.address, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (_req, res, params) => {
    sendServiceResult(res, removeEmailAddressFromAgent(params.id, params.address))
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
    if (!result.data || 'error' in result.data) {
      sendServiceResult(res, result)
    } else {
      sendJson(res, 200, { metadata: result.data.agent?.metadata || {} })
    }
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (req, res, params) => {
    const metadata = await readJsonBody(req)
    const result = updateAgentById(params.id, { metadata })
    if (!result.data || 'error' in result.data) {
      sendServiceResult(res, result)
    } else {
      sendJson(res, 200, { metadata: result.data.agent?.metadata })
    }
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const result = updateAgentById(params.id, { metadata: {} })
    if (!result.data || 'error' in result.data) {
      sendServiceResult(res, result)
    } else {
      sendJson(res, 200, { success: true })
    }
  }},

  // Agent heartbeat (standalone presence)
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/heartbeat$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req).catch(() => ({}))
    sendServiceResult(res, heartbeat(params.id, body.status, body.claudeSessionId))
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
    sendServiceResult(res, await deleteAgentById(params.id, query.hard === 'true'))
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
  { method: 'POST', pattern: /^\/api\/hosts$/, paramNames: [], handler: async (req, res, _params, query) => {
    const host = await readJsonBody(req)
    sendServiceResult(res, await addNewHost({ host, syncEnabled: query.sync !== 'false' }))
  }},
  { method: 'PUT', pattern: /^\/api\/hosts\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await updateExistingHost(params.id, body))
  }},
  { method: 'POST', pattern: /^\/api\/hosts\/([^/]+)\/reactivate$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await reactivateHost(params.id))
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
  { method: 'GET', pattern: /^\/api\/v1\/agents\/me\/card$/, paramNames: [], handler: async (req, res) => {
    sendServiceResult(res, getAgentCard(getHeader(req, 'Authorization')))
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
    sendServiceResult(res, resolveAgentAddress(getHeader(req, 'Authorization'), params.address))
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
  { method: 'GET', pattern: /^\/api\/v1\/messages$/, paramNames: [], handler: async (req, res, _params, query) => {
    const authHeader = getHeader(req, 'Authorization')
    sendServiceResult(res, listPendingMessages(authHeader, query.limit ? parseInt(query.limit) : undefined))
  }},
  { method: 'GET', pattern: /^\/api\/v1\/messages\/pending$/, paramNames: [], handler: async (req, res, _params, query) => {
    const authHeader = getHeader(req, 'Authorization')
    sendServiceResult(res, listPendingMessages(authHeader, query.limit ? parseInt(query.limit) : undefined))
  }},
  { method: 'DELETE', pattern: /^\/api\/v1\/messages\/pending$/, paramNames: [], handler: async (req, res, _params, query) => {
    const authHeader = getHeader(req, 'Authorization')
    sendServiceResult(res, acknowledgePendingMessage(authHeader, query.id || null))
  }},
  { method: 'DELETE', pattern: /^\/api\/v1\/messages\/pending\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const authHeader = getHeader(req, 'Authorization')
    sendServiceResult(res, acknowledgePendingMessage(authHeader, params.id))
  }},
  { method: 'POST', pattern: /^\/api\/v1\/messages\/pending\/ack$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    const authHeader = getHeader(req, 'Authorization')
    sendServiceResult(res, batchAcknowledgeMessages(authHeader, body.ids))
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
    const body = await readJsonBody(req).catch(() => null) // the service rejects a missing body
    sendServiceResult(res, await rotateKeypair(body, getHeader(req, 'Authorization')))
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
  // AMP attachments + discovery
  // =========================================================================
  { method: 'GET', pattern: /^\/\.well-known\/agent-messaging\.json$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getWellKnownDocument())
  }},
  { method: 'POST', pattern: /^\/api\/v1\/attachments\/upload$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req).catch(() => ({}))
    sendServiceResult(res, initUpload(body, getHeader(req, 'authorization')))
  }},
  { method: 'GET', pattern: /^\/api\/v1\/attachments\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    sendServiceResult(res, getAttachmentStatus(params.id, getHeader(req, 'authorization')))
  }},
  { method: 'POST', pattern: /^\/api\/v1\/attachments\/([^/]+)\/confirm$/, paramNames: ['id'], handler: async (req, res, params) => {
    sendServiceResult(res, confirmUpload(params.id, getHeader(req, 'authorization')))
  }},
  { method: 'PUT', pattern: /^\/api\/v1\/attachments\/([^/]+)\/content$/, paramNames: ['id'], handler: async (req, res, params, query) => {
    const { bytes, tooLarge } = await readBoundedBuffer(req, MAX_ATTACHMENT_SIZE)
    if (tooLarge) {
      sendJson(res, 413, { error: 'attachment_too_large', message: `Attachment exceeds the ${MAX_ATTACHMENT_SIZE} byte limit` })
      return
    }
    sendServiceResult(res, receiveContent(params.id, qp(query, 'token'), bytes))
  }},
  { method: 'GET', pattern: /^\/api\/v1\/attachments\/([^/]+)\/content$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    const result = downloadContent(params.id, qp(query, 'token'))
    // ServiceResult unions data with ServiceError, so narrow before using it.
    if (!result.data || isServiceError(result.data)) { sendServiceResult(res, result); return }
    sendBinary(res, 200, new Uint8Array(result.data.bytes), downloadHeaders(result.data))
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
  { method: 'GET', pattern: /^\/api\/meetings\/inject-queue$/, paramNames: [], handler: async (_req, res, _params, query) => {
    const { drainForSession } = await import('@/lib/meeting-inject-queue')
    const session = query.session
    if (!session) { sendJson(res, 400, { error: 'Missing session parameter' }); return }
    const messages = drainForSession(session)
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ messages, count: messages.length }))
  }},
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
    sendServiceResult(res, await listMarketplaceSkills({
      marketplace: query.marketplace || undefined,
      plugin: query.plugin || undefined,
      category: query.category || undefined,
      search: query.search || undefined,
      includeContent: query.includeContent === 'true',
    }))
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

/**
 * Every (method, path) the router serves, with dynamic segments written as
 * `[name]` (the Next.js spelling). Read-only view for tests/route-parity.test.ts.
 */
export function listRoutes(): Array<{ method: string; path: string; handler: string }> {
  return routes.map((r) => {
    let i = 0
    const path = r.pattern.source
      .replace(/^\^/, '').replace(/\$$/, '')
      .replace(/\\(.)/g, '$1')
      .replace(/\(\[\^\/\]\+\)/g, () => `[${r.paramNames[i++]}]`)
    return { method: r.method, path, handler: r.handler.toString() }
  })
}

/** Path params arrive percent-encoded; decode each once (Next.js hands services decoded params). */
function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new BadRequestError('Malformed percent-encoding in the URL path')
  }
}

function matchRoute(method: string, pathname: string): { handler: RouteHandler; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue

    const match = pathname.match(route.pattern)
    if (!match) continue

    const params: Record<string, string> = {}
    route.paramNames.forEach((name, i) => {
      params[name] = decodeParam(match[i + 1])
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

      let matched: ReturnType<typeof matchRoute>
      try {
        matched = matchRoute(method, pathname)
      } catch (error) {
        if (error instanceof BadRequestError) {
          sendJson(res, 400, { error: 'invalid_request', message: error.message })
          return true
        }
        throw error
      }
      if (!matched) {
        return false // Not handled — caller should return 404
      }

      try {
        await matched.handler(req, res, matched.params, query)
      } catch (error) {
        if (error instanceof BadRequestError) {
          if (!res.headersSent) sendJson(res, 400, { error: 'invalid_request', message: error.message })
          return true
        }
        console.error(`[Headless] Error handling ${method} ${pathname}:`, error)
        if (!res.headersSent) {
          sendJson(res, 500, { error: 'Internal server error' })
        }
      }

      return true // Handled
    },
  }
}
