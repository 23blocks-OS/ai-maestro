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
import { authenticateAgent } from '../lib/agent-auth'

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
  scanAgentLocalConfig,
} from '@/services/agent-local-config-service'

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

import { deployConfigToAgent } from '@/services/agents-config-deploy-service'

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
  getTeamTask,
  createTeamTask,
  updateTeamTask,
  deleteTeamTask,
  listTeamDocuments,
  createTeamDocument,
  getTeamDocument,
  updateTeamDocument,
  deleteTeamDocument,
  notifyTeamAgents,
  getTeamsBulkStats,
  getKanbanConfig,
  setKanbanConfig,
} from '@/services/teams-service'

import {
  getGovernanceConfig,
  setManagerRole,
  setGovernancePassword,
  getReachableAgents,
  listTransferRequests,
  createTransferReq,
  resolveTransferReq,
  listTrustedManagers,
  addTrust,
  removeTrust,
} from '@/services/governance-service'

import { handleGovernanceSyncMessage, buildLocalGovernanceSnapshot } from '@/lib/governance-sync'
import { getHosts, getSelfHostId } from '@/lib/hosts-config'
import { verifyHostAttestation } from '@/lib/host-keys'
// Imports for chief-of-staff endpoint (mirrors app/api/teams/[id]/chief-of-staff/route.ts)
import { verifyPassword, loadGovernance, getManagerId } from '@/lib/governance'
import { getTeam, updateTeam, TeamValidationException } from '@/lib/team-registry'
import { getAgent } from '@/lib/agent-registry'
// Atomic rate limiting for auth endpoints
import { checkAndRecordAttempt, resetRateLimit } from '@/lib/rate-limit'
import { isValidUuid } from '@/lib/validation'

import {
  submitCrossHostRequest,
  receiveCrossHostRequest,
  approveCrossHostRequest,
  rejectCrossHostRequest,
  receiveRemoteRejection,
  listCrossHostRequests,
} from '@/services/cross-host-governance-service'

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
  createCreationHelper,
  deleteCreationHelper,
  getCreationHelperStatus,
  sendMessage as sendCreationHelperMessage,
  captureResponse as captureCreationHelperResponse,
} from '@/services/creation-helper-service'

import {
  buildPlugin,
  getBuildStatus,
  scanRepo,
  pushToGitHub,
} from '@/services/plugin-builder-service'

import {
  generatePluginFromToml,
  installPluginLocally,
  uninstallPluginLocally,
  listRolePlugins,
  deleteRolePlugin,
  createPersona,
  syncDefaultRolePlugins,
} from '@/services/role-plugin-service'

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

import { updateSystemSettings, type SystemSettings } from '@/lib/system-settings'

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

async function readJsonBody(req: IncomingMessage): Promise<any> {
  // Enforce 1MB size limit to prevent memory exhaustion
  const MAX_BODY_SIZE = 1_048_576
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalSize = 0
    // Guard against multiple reject() calls (e.g. size limit hit then error event)
    let rejected = false
    req.on('data', (chunk: Buffer) => {
      if (rejected) return
      totalSize += chunk.length
      if (totalSize > MAX_BODY_SIZE) {
        rejected = true
        req.destroy()
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (rejected) return
      const body = Buffer.concat(chunks).toString('utf-8')
      // Return null for empty bodies instead of {} to distinguish no-body from empty-object
      if (!body) return resolve(null)
      try {
        resolve(JSON.parse(body))
      } catch (e) {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', (err) => {
      if (rejected) return
      rejected = true
      reject(err)
    })
  })
}

// 50 MB size limit for raw body reads (e.g. binary uploads)
const MAX_RAW_BODY_SIZE = 50 * 1024 * 1024

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalSize = 0
    // Guard against resolve after reject (matching readJsonBody pattern)
    let rejected = false
    req.on('data', (chunk: Buffer) => {
      if (rejected) return
      totalSize += chunk.length
      if (totalSize > MAX_RAW_BODY_SIZE) {
        rejected = true
        req.destroy()
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (rejected) return
      resolve(Buffer.concat(chunks))
    })
    req.on('error', (err) => {
      if (rejected) return
      rejected = true
      reject(err)
    })
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
  // Prioritize error -- if error is set, always send error response.
  // Do not spread result.data into error responses to avoid leaking internal state.
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
  { method: 'GET', pattern: /^\/api\/config$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getSystemConfig())
  }},
  { method: 'PATCH', pattern: /^\/api\/config$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req) ?? {}
    const patch: Partial<SystemSettings> = {}
    if (typeof body.conversationIndexerEnabled === 'boolean') {
      patch.conversationIndexerEnabled = body.conversationIndexerEnabled
    }
    if (Object.keys(patch).length === 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'No valid settings provided' }))
      return
    }
    const updated = updateSystemSettings(patch)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true, settings: updated }))
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
  // Static sub-path routes MUST come before the parameterized catch-all
  // to prevent /api/sessions/restore and /api/sessions/activity from being
  // swallowed by /api/sessions/([^/]+) (first-match-wins routing)
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
    try {
      const activity = await getActivity()
      sendJson(res, 200, { activity })
    } catch (error) {
      sendJson(res, 500, { error: 'Failed to fetch activity', activity: {} })
    }
  }},
  { method: 'POST', pattern: /^\/api\/sessions\/activity\/update$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    const result = broadcastActivityUpdate(body.sessionName, body.status, body.hookStatus, body.notificationType)
    sendServiceResult(res, result)
  }},
  // Parameterized session routes AFTER all static sub-paths
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
    sendServiceResult(res, await registerAgent(body))
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
    sendServiceResult(res, await normalizeHosts())
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
    // Layer 5: optional governance enforcement when agent identity is provided
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    // auth.agentId is undefined when no auth header — governance not enforced (backward compat)
    sendServiceResult(res, await createNewAgent(body, auth.error ? null : auth.agentId))
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
    sendServiceResult(res, await linkAgentSession(params.id, body))
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

  // Local Config (Agent Profile Panel)
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/local-config$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, scanAgentLocalConfig(params.id))
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
      roleFilter: (query.roleFilter as any) || undefined,
      conversationFile: query.conversationFile,
      startTs: query.startTs ? parseInt(query.startTs) : undefined,
      endTs: query.endTs ? parseInt(query.endTs) : undefined,
      useRrf: query.useRrf === 'true' ? true : query.useRrf === 'false' ? false : undefined,
      bm25Weight: query.bm25Weight ? parseFloat(query.bm25Weight) : undefined,
      semanticWeight: query.semanticWeight ? parseFloat(query.semanticWeight) : undefined,
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
    sendServiceResult(res, await updateMetrics(params.id, body))
  }},

  // Graph - code
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/graph\/code$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await queryCodeGraph(params.id, query as any))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/graph\/code$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await indexCodeGraph(params.id, body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/graph\/code$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await deleteCodeGraph(params.id, query.projectPath || ''))
  }},

  // Graph - db
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/graph\/db$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    sendServiceResult(res, await queryDbGraph(params.id, query as any))
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
    // clearDocs expects optional string; provide empty string fallback for undefined
    sendServiceResult(res, await clearDocs(params.id, query.project || ''))
  }},

  // Skills
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/skills\/settings$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, await getSkillSettings(params.id))
  }},
  { method: 'PUT', pattern: /^\/api\/agents\/([^/]+)\/skills\/settings$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(getHeader(req, 'Authorization'), getHeader(req, 'X-Agent-Id'))
    sendServiceResult(res, await saveSkillSettings(params.id, body, auth.error ? null : auth.agentId))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/skills$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, getSkillsConfig(params.id))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/skills$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(getHeader(req, 'Authorization'), getHeader(req, 'X-Agent-Id'))
    sendServiceResult(res, await updateSkills(params.id, body, auth.error ? null : auth.agentId))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/skills$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(getHeader(req, 'Authorization'), getHeader(req, 'X-Agent-Id'))
    sendServiceResult(res, await addSkill(params.id, body, auth.error ? null : auth.agentId))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/skills$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    const auth = authenticateAgent(getHeader(_req, 'Authorization'), getHeader(_req, 'X-Agent-Id'))
    sendServiceResult(res, await removeSkill(params.id, query.skill || '', undefined, auth.error ? null : auth.agentId))
  }},

  // Config deployment (governance-gated)
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/config\/deploy$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    // Accept host-signature auth (cross-host) or governance password auth (local admin)
    const auth = authenticateAgent(getHeader(req, 'Authorization'), getHeader(req, 'X-Agent-Id'))
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    // Require authenticated identity -- authenticateAgent returns {} when both headers absent
    if (!auth.agentId) {
      sendJson(res, 401, { error: 'Authenticated agent identity required for config deployment' })
      return
    }
    // Strict undefined check -- falsy body.configuration (e.g. empty string) should not fall through to body
    sendServiceResult(res, await deployConfigToAgent(params.id, body.configuration !== undefined ? body.configuration : body, auth.agentId))
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
    try {
      const result = await exportAgentZip(params.id)
      if (result.error || !result.data) {
        sendJson(res, result.status, { error: result.error })
        return
      }
      const { buffer, filename, agentId, agentName } = result.data
      // Sanitize filename to prevent header injection via quotes/newlines/backslashes
      const safeFilename = filename.replace(/["\r\n\\]/g, '_')
      sendBinary(res, 200, new Uint8Array(buffer), {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
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
    sendServiceResult(res, getAMPAddress(params.id, decodeURIComponent(params.address)))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/amp\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await updateAMPAddressOnAgent(params.id, decodeURIComponent(params.address), body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/amp\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (_req, res, params) => {
    sendServiceResult(res, await removeAMPAddressFromAgent(params.id, decodeURIComponent(params.address)))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/amp\/addresses$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, listAMPAddresses(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/amp\/addresses$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await addAMPAddressToAgent(params.id, body))
  }},

  // Email addresses
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (_req, res, params) => {
    sendServiceResult(res, getEmailAddressDetail(params.id, decodeURIComponent(params.address)))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await updateEmailAddressOnAgent(params.id, decodeURIComponent(params.address), body))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses\/([^/]+)$/, paramNames: ['id', 'address'], handler: async (_req, res, params) => {
    sendServiceResult(res, await removeEmailAddressFromAgent(params.id, decodeURIComponent(params.address)))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, listEmailAddresses(params.id))
  }},
  { method: 'POST', pattern: /^\/api\/agents\/([^/]+)\/email\/addresses$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await addEmailAddressToAgent(params.id, body))
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
      sendJson(res, result.status, { error: result.error })
    } else {
      sendJson(res, 200, { metadata: result.data?.agent?.metadata || {} })
    }
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (req, res, params) => {
    const metadata = await readJsonBody(req)
    const result = await updateAgentById(params.id, { metadata })
    if (result.error) {
      sendJson(res, result.status, { error: result.error })
    } else {
      sendJson(res, 200, { metadata: result.data?.agent?.metadata })
    }
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)\/metadata$/, paramNames: ['id'], handler: async (_req, res, params) => {
    const result = await updateAgentById(params.id, { metadata: {} })
    if (result.error) {
      sendJson(res, result.status, { error: result.error })
    } else {
      sendJson(res, 200, { success: true })
    }
  }},

  // Agent CRUD (must be LAST among /api/agents/[id]/* routes)
  { method: 'GET', pattern: /^\/api\/agents\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params) => {
    sendServiceResult(res, getAgentById(params.id))
  }},
  { method: 'PATCH', pattern: /^\/api\/agents\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    // Layer 5: optional governance enforcement when agent identity is provided
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    sendServiceResult(res, await updateAgentById(params.id, body, auth.error ? null : auth.agentId))
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/([^/]+)$/, paramNames: ['id'], handler: async (_req, res, params, query) => {
    // Layer 5: optional governance enforcement when agent identity is provided
    const auth = authenticateAgent(
      getHeader(_req, 'Authorization'),
      getHeader(_req, 'X-Agent-Id')
    )
    sendServiceResult(res, await deleteAgentById(params.id, query.hard === 'true', auth.error ? null : auth.agentId))
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
      // Layer 2: pass attestation headers for mesh-forwarded role verification
      {
        senderRole: getHeader(req, 'X-AMP-Sender-Role'),
        senderAgentId: getHeader(req, 'X-AMP-Sender-Agent-Id'),
        senderRoleAttestation: getHeader(req, 'X-AMP-Sender-Role-Attestation'),
      },
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
    // Validate parseInt result to avoid passing NaN
    let limit: number | undefined = query.limit ? parseInt(query.limit, 10) : undefined
    if (limit !== undefined && isNaN(limit)) limit = 50
    sendServiceResult(res, listPendingMessages(authHeader, limit))
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
    sendServiceResult(res, await revokeKey(getHeader(req, 'Authorization')))
  }},
  { method: 'POST', pattern: /^\/api\/v1\/auth\/rotate-key$/, paramNames: [], handler: async (req, res) => {
    sendServiceResult(res, await rotateKey(getHeader(req, 'Authorization')))
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
    // Extract and validate specific query parameters instead of passing raw query as any
    const meetingParams = {
      meetingId: query.meetingId || null,
      participants: query.participants || null,
      since: query.since || null,
    }
    sendServiceResult(res, await getMeetingMessages(meetingParams))
  }},
  { method: 'POST', pattern: /^\/api\/messages\/forward$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await forwardGlobalMessage(body))
  }},
  { method: 'GET', pattern: /^\/api\/messages$/, paramNames: [], handler: async (_req, res, _params, query) => {
    // Extract and validate specific query parameters instead of passing raw query as any
    const msgParams = {
      agent: query.agent || null,
      id: query.id || null,
      action: query.action || null,
      box: query.box || null,
      limit: query.limit || null,
      status: query.status || null,
      priority: query.priority || null,
      from: query.from || null,
      to: query.to || null,
    }
    sendServiceResult(res, await getMessages(msgParams))
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
  // Governance
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/governance$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getGovernanceConfig())
  }},
  { method: 'POST', pattern: /^\/api\/governance\/manager$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await setManagerRole(body))
  }},
  { method: 'POST', pattern: /^\/api\/governance\/password$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await setGovernancePassword(body))
  }},
  { method: 'GET', pattern: /^\/api\/governance\/reachable$/, paramNames: [], handler: async (req, res, _params, query) => {
    sendServiceResult(res, getReachableAgents(query.agentId || null))
  }},
  { method: 'POST', pattern: /^\/api\/governance\/transfers\/([^/]+)\/resolve$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    // Require authenticated identity -- never fall back to body.resolvedBy
    if (!auth.agentId) {
      sendJson(res, 401, { error: 'Authenticated agent identity required to resolve transfers' })
      return
    }
    const resolvedBy = auth.agentId
    sendServiceResult(res, await resolveTransferReq(params.id, { ...body, resolvedBy }))
  }},
  { method: 'GET', pattern: /^\/api\/governance\/transfers$/, paramNames: [], handler: async (req, res, _params, query) => {
    sendServiceResult(res, listTransferRequests({
      teamId: query.teamId || null,
      agentId: query.agentId || null,
      status: query.status || null,
    }))
  }},
  { method: 'POST', pattern: /^\/api\/governance\/transfers$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    // Authenticate agent -- use auth.agentId as requestedBy, not body
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    if (!auth.agentId) {
      sendJson(res, 401, { error: 'Authenticated agent identity required to create transfers' })
      return
    }
    sendServiceResult(res, await createTransferReq({ ...body, requestedBy: auth.agentId }))
  }},

  // ── Governance Sync (Layer 1: cross-host state replication) ──────────────
  { method: 'POST', pattern: /^\/api\/v1\/governance\/sync$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req) as import('@/types/governance').GovernanceSyncMessage
    // Validate required fields
    if (!body || !body.fromHostId || !body.type) {
      sendJson(res, 400, { error: 'Missing required fields: fromHostId, type' })
      return
    }
    // Verify sender is a known peer host
    const hosts = getHosts()
    const knownHost = hosts.find(h => h.id === body.fromHostId)
    if (!knownHost) {
      sendJson(res, 403, { error: `Unknown host: ${body.fromHostId}` })
      return
    }
    // Verify host signature (SR-001)
    const hostSignature = getHeader(req, 'X-Host-Signature')
    const hostTimestamp = getHeader(req, 'X-Host-Timestamp')
    const hostId = getHeader(req, 'X-Host-Id')
    if (!hostSignature || !hostTimestamp || !hostId) {
      sendJson(res, 401, { error: 'Missing host authentication headers' })
      return
    }
    if (hostId !== body.fromHostId) {
      sendJson(res, 400, { error: 'Host ID header does not match body fromHostId' })
      return
    }
    if (!knownHost.publicKeyHex) {
      sendJson(res, 403, { error: 'Host has no registered public key' })
      return
    }
    const signedData = `gov-sync|${hostId}|${hostTimestamp}`
    if (!verifyHostAttestation(signedData, hostSignature, knownHost.publicKeyHex)) {
      sendJson(res, 403, { error: 'Invalid host signature' })
      return
    }
    // Timestamp freshness uses an asymmetric window: 5 min past (300s) to tolerate
    // network latency and processing delays, but only 60s future to guard against clock skew
    // without accepting pre-dated replay attacks. This pattern is repeated across all governance sync endpoints.
    const tsAge = Date.now() - new Date(hostTimestamp).getTime()
    if (isNaN(tsAge) || tsAge > 300_000 || tsAge < -60_000) {
      sendJson(res, 403, { error: 'Signature expired' })
      return
    }
    // Check return value -- handleGovernanceSyncMessage returns false on validation failure
    const syncOk = await handleGovernanceSyncMessage(body.fromHostId, body)
    if (!syncOk) {
      sendJson(res, 400, { error: 'Governance sync message rejected (validation failed)' })
      return
    }
    sendJson(res, 200, { ok: true })
  }},
  { method: 'GET', pattern: /^\/api\/v1\/governance\/sync$/, paramNames: [], handler: async (req, res) => {
    // Require host authentication for governance snapshot reads
    const hostId = getHeader(req, 'X-Host-Id')
    const hostSignature = getHeader(req, 'X-Host-Signature')
    const hostTimestamp = getHeader(req, 'X-Host-Timestamp')
    if (!hostId || !hostSignature || !hostTimestamp) {
      sendJson(res, 401, { error: 'Missing host authentication headers' })
      return
    }
    const hosts = getHosts()
    const knownHost = hosts.find(h => h.id === hostId)
    if (!knownHost) {
      sendJson(res, 403, { error: 'Unknown host' })
      return
    }
    if (!knownHost.publicKeyHex) {
      sendJson(res, 403, { error: 'Host has no registered public key' })
      return
    }
    const signedData = `gov-sync-read|${hostId}|${hostTimestamp}`
    if (!verifyHostAttestation(signedData, hostSignature, knownHost.publicKeyHex)) {
      sendJson(res, 403, { error: 'Invalid host signature' })
      return
    }
    // Check timestamp freshness (5 min window, allow 60s clock skew)
    const tsAge = Date.now() - new Date(hostTimestamp).getTime()
    if (isNaN(tsAge) || tsAge > 300_000 || tsAge < -60_000) {
      sendJson(res, 403, { error: 'Signature expired' })
      return
    }
    const snapshot = buildLocalGovernanceSnapshot()
    sendJson(res, 200, {
      ...snapshot,
      lastSyncAt: new Date().toISOString(),
      ttl: 300,
    })
  }},

  // ── Governance Requests (Layer 3: cross-host governance operations) ────────
  { method: 'POST', pattern: /^\/api\/v1\/governance\/requests$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    // Determine if this is a local submission (with password) or a remote receive (with fromHostId)
    if (body?.fromHostId) {
      // Dedicated try/catch for remote receive branch (matching Next.js route pattern)
      try {
        // Verify host signature for remote governance requests
        const hostSignature = getHeader(req, 'X-Host-Signature')
        const hostTimestamp = getHeader(req, 'X-Host-Timestamp')
        const hostId = getHeader(req, 'X-Host-Id')
        if (!hostSignature || !hostTimestamp || !hostId) {
          sendJson(res, 401, { error: 'Missing host authentication headers' })
          return
        }
        if (hostId !== body.fromHostId) {
          sendJson(res, 400, { error: 'Host ID header does not match body fromHostId' })
          return
        }
        const hosts = getHosts()
        const knownHost = hosts.find(h => h.id === hostId)
        if (!knownHost) {
          sendJson(res, 403, { error: 'Unknown host' })
          return
        }
        if (!knownHost.publicKeyHex) {
          sendJson(res, 403, { error: 'Host has no registered public key' })
          return
        }
        const signedData = `gov-request|${hostId}|${hostTimestamp}`
        if (!verifyHostAttestation(signedData, hostSignature, knownHost.publicKeyHex)) {
          sendJson(res, 403, { error: 'Invalid host signature' })
          return
        }
        const tsAge = Date.now() - new Date(hostTimestamp).getTime()
        if (isNaN(tsAge) || tsAge > 300_000 || tsAge < -60_000) {
          sendJson(res, 403, { error: 'Signature expired' })
          return
        }
        // Remote host is sending us a governance request
        sendServiceResult(res, await receiveCrossHostRequest(body.fromHostId, body.request))
      } catch (err) {
        console.error('[Governance Requests] POST remote-receive error:', err)
        sendJson(res, 500, { error: 'Internal server error processing remote governance request' })
      }
    } else {
      // Local agent submitting a cross-host request
      sendServiceResult(res, await submitCrossHostRequest(body))
    }
  }},
  { method: 'GET', pattern: /^\/api\/v1\/governance\/requests$/, paramNames: [], handler: async (_req, res, _params, query) => {
    // Pass type filter through to listCrossHostRequests (was silently ignored)
    sendServiceResult(res, listCrossHostRequests({
      status: (query.status as import('@/types/governance-request').GovernanceRequestStatus) || undefined,
      type: (query.type as import('@/types/governance-request').GovernanceRequestType) || undefined,
      hostId: query.hostId || undefined,
      agentId: query.agentId || undefined,
    }))
  }},
  { method: 'POST', pattern: /^\/api\/v1\/governance\/requests\/([^/]+)\/approve$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    if (!body?.approverAgentId || !body?.password) {
      sendJson(res, 400, { error: 'Missing required fields: approverAgentId, password' })
      return
    }
    sendServiceResult(res, await approveCrossHostRequest(params.id, body.approverAgentId, body.password))
  }},
  { method: 'POST', pattern: /^\/api\/v1\/governance\/requests\/([^/]+)\/reject$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    // Accept host-signature auth as alternative for remote rejection notifications
    const hostSignature = getHeader(req, 'X-Host-Signature')
    const hostTimestamp = getHeader(req, 'X-Host-Timestamp')
    const hostId = getHeader(req, 'X-Host-Id')
    if (hostSignature && hostTimestamp && hostId) {
      // Remote host rejection notification — verify host signature instead of password
      const hosts = getHosts()
      const knownHost = hosts.find(h => h.id === hostId)
      if (!knownHost) { sendJson(res, 403, { error: 'Unknown host' }); return }
      if (!knownHost.publicKeyHex) { sendJson(res, 403, { error: 'Host has no registered public key' }); return }
      const signedData = `gov-request|${hostId}|${hostTimestamp}`
      if (!verifyHostAttestation(signedData, hostSignature, knownHost.publicKeyHex)) {
        sendJson(res, 403, { error: 'Invalid host signature' }); return
      }
      const tsAge = Date.now() - new Date(hostTimestamp).getTime()
      if (isNaN(tsAge) || tsAge > 300_000 || tsAge < -60_000) {
        sendJson(res, 403, { error: 'Signature expired' }); return
      }
      if (!body?.rejectorAgentId) {
        sendJson(res, 400, { error: 'Missing required field: rejectorAgentId' }); return
      }
      sendServiceResult(res, await receiveRemoteRejection(params.id, hostId, body.rejectorAgentId, body.reason))
      return
    }
    // Local rejection — requires password
    if (!body?.rejectorAgentId || !body?.password) {
      sendJson(res, 400, { error: 'Missing required fields: rejectorAgentId, password' })
      return
    }
    sendServiceResult(res, await rejectCrossHostRequest(params.id, body.rejectorAgentId, body.password, body.reason))
  }},

  // ── Manager Trust (Layer 4: host-scoped manager authority) ──────────────
  { method: 'GET', pattern: /^\/api\/governance\/trust$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, listTrustedManagers())
  }},
  { method: 'POST', pattern: /^\/api\/governance\/trust$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await addTrust(body))
  }},
  { method: 'DELETE', pattern: /^\/api\/governance\/trust\/([^/]+)$/, paramNames: ['hostId'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await removeTrust(params.hostId, body?.password))
  }},

  // =========================================================================
  // Teams
  // =========================================================================
  // Bulk stats endpoint to eliminate N+1 fetch pattern on teams page
  { method: 'GET', pattern: /^\/api\/teams\/stats$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, getTeamsBulkStats())
  }},
  { method: 'POST', pattern: /^\/api\/teams\/notify$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await notifyTeamAgents(body))
  }},
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)\/tasks\/([^/]+)$/, paramNames: ['id', 'taskId'], handler: async (req, res, params) => {
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    sendServiceResult(res, await getTeamTask(params.id, params.taskId, auth.agentId))
  }},
  { method: 'PUT', pattern: /^\/api\/teams\/([^/]+)\/tasks\/([^/]+)$/, paramNames: ['id', 'taskId'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    // Validate priority and blockedBy (mirrors Next.js route validation)
    if (body.priority !== undefined && !Number.isFinite(Number(body.priority))) {
      sendJson(res, 400, { error: 'priority must be a finite number' })
      return
    }
    if (body.blockedBy !== undefined) {
      if (!Array.isArray(body.blockedBy) || !body.blockedBy.every((v: unknown) => typeof v === 'string')) {
        sendJson(res, 400, { error: 'blockedBy must be an array of strings' })
        return
      }
    }
    // Whitelist fields to prevent arbitrary data injection
    const safeParams: Record<string, unknown> = {
      ...(body.subject !== undefined && { subject: String(body.subject) }),
      ...(body.description !== undefined && { description: String(body.description) }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: Number(body.priority) }),
      ...(body.assigneeAgentId !== undefined && { assigneeAgentId: body.assigneeAgentId === null ? null : String(body.assigneeAgentId) }),
      ...(body.blockedBy !== undefined && { blockedBy: body.blockedBy }),
      ...(body.labels !== undefined && { labels: body.labels }),
      ...(body.taskType !== undefined && { taskType: String(body.taskType) }),
      ...(body.externalRef !== undefined && { externalRef: String(body.externalRef) }),
      ...(body.externalProjectRef !== undefined && { externalProjectRef: String(body.externalProjectRef) }),
      ...(body.previousStatus !== undefined && { previousStatus: String(body.previousStatus) }),
      ...(body.acceptanceCriteria !== undefined && { acceptanceCriteria: body.acceptanceCriteria }),
      ...(body.handoffDoc !== undefined && { handoffDoc: String(body.handoffDoc) }),
      ...(body.prUrl !== undefined && { prUrl: String(body.prUrl) }),
      ...(body.reviewResult !== undefined && { reviewResult: String(body.reviewResult) }),
      requestingAgentId: auth.agentId,
    }
    sendServiceResult(res, await updateTeamTask(params.id, params.taskId, safeParams as any))
  }},
  { method: 'DELETE', pattern: /^\/api\/teams\/([^/]+)\/tasks\/([^/]+)$/, paramNames: ['id', 'taskId'], handler: async (req, res, params) => {
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    const requestingAgentId = auth.agentId
    sendServiceResult(res, await deleteTeamTask(params.id, params.taskId, requestingAgentId))
  }},
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)\/tasks$/, paramNames: ['id'], handler: async (req, res, params) => {
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    const requestingAgentId = auth.agentId
    // Extract optional query filters from URL
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)
    const filters: { assignee?: string; status?: string; label?: string; taskType?: string } = {}
    if (url.searchParams.has('assignee')) filters.assignee = url.searchParams.get('assignee')!
    if (url.searchParams.has('status')) filters.status = url.searchParams.get('status')!
    if (url.searchParams.has('label')) filters.label = url.searchParams.get('label')!
    if (url.searchParams.has('taskType')) filters.taskType = url.searchParams.get('taskType')!
    const hasFilters = Object.keys(filters).length > 0
    sendServiceResult(res, await listTeamTasks(params.id, requestingAgentId, hasFilters ? filters : undefined))
  }},
  { method: 'POST', pattern: /^\/api\/teams\/([^/]+)\/tasks$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    // Validate priority and blockedBy (mirrors Next.js route validation)
    if (body.priority !== undefined && !Number.isFinite(Number(body.priority))) {
      sendJson(res, 400, { error: 'priority must be a finite number' })
      return
    }
    if (body.blockedBy !== undefined) {
      if (!Array.isArray(body.blockedBy) || !body.blockedBy.every((v: unknown) => typeof v === 'string')) {
        sendJson(res, 400, { error: 'blockedBy must be an array of strings' })
        return
      }
    }
    // Whitelist fields to prevent arbitrary data injection
    const safeParams: Record<string, unknown> = {
      subject: String(body.subject ?? ''),
      ...(body.description !== undefined && { description: String(body.description) }),
      ...(body.assigneeAgentId !== undefined && { assigneeAgentId: body.assigneeAgentId === null ? null : String(body.assigneeAgentId) }),
      ...(body.blockedBy !== undefined && { blockedBy: body.blockedBy }),
      ...(body.priority !== undefined && { priority: Number(body.priority) }),
      ...(body.status !== undefined && { status: String(body.status) }),
      ...(body.labels !== undefined && { labels: body.labels }),
      ...(body.taskType !== undefined && { taskType: String(body.taskType) }),
      ...(body.externalRef !== undefined && { externalRef: String(body.externalRef) }),
      ...(body.externalProjectRef !== undefined && { externalProjectRef: String(body.externalProjectRef) }),
      ...(body.acceptanceCriteria !== undefined && { acceptanceCriteria: body.acceptanceCriteria }),
      ...(body.handoffDoc !== undefined && { handoffDoc: String(body.handoffDoc) }),
      ...(body.prUrl !== undefined && { prUrl: String(body.prUrl) }),
      requestingAgentId: auth.agentId,
    }
    sendServiceResult(res, await createTeamTask(params.id, safeParams as any))
  }},
  // Kanban config routes
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)\/kanban-config$/, paramNames: ['id'], handler: async (req, res, params) => {
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    sendServiceResult(res, await getKanbanConfig(params.id, auth.agentId))
  }},
  { method: 'PUT', pattern: /^\/api\/teams\/([^/]+)\/kanban-config$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    if (!body.columns || !Array.isArray(body.columns)) {
      sendJson(res, 400, { error: 'columns array is required' })
      return
    }
    sendServiceResult(res, await setKanbanConfig(params.id, body.columns, auth.agentId))
  }},
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)\/documents\/([^/]+)$/, paramNames: ['id', 'docId'], handler: async (req, res, params) => {
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    const requestingAgentId = auth.agentId
    sendServiceResult(res, getTeamDocument(params.id, params.docId, requestingAgentId))
  }},
  { method: 'PUT', pattern: /^\/api\/teams\/([^/]+)\/documents\/([^/]+)$/, paramNames: ['id', 'docId'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    const requestingAgentId = auth.agentId
    sendServiceResult(res, await updateTeamDocument(params.id, params.docId, { ...body, requestingAgentId }))
  }},
  { method: 'DELETE', pattern: /^\/api\/teams\/([^/]+)\/documents\/([^/]+)$/, paramNames: ['id', 'docId'], handler: async (req, res, params) => {
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    const requestingAgentId = auth.agentId
    sendServiceResult(res, await deleteTeamDocument(params.id, params.docId, requestingAgentId))
  }},
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)\/documents$/, paramNames: ['id'], handler: async (req, res, params) => {
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    const requestingAgentId = auth.agentId
    sendServiceResult(res, listTeamDocuments(params.id, requestingAgentId))
  }},
  { method: 'POST', pattern: /^\/api\/teams\/([^/]+)\/documents$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    const requestingAgentId = auth.agentId
    sendServiceResult(res, await createTeamDocument(params.id, { ...body, requestingAgentId }))
  }},
  // Chief-of-Staff assignment/removal -- mirrors app/api/teams/[id]/chief-of-staff/route.ts
  { method: 'POST', pattern: /^\/api\/teams\/([^/]+)\/chief-of-staff$/, paramNames: ['id'], handler: async (req, res, params) => {
    const teamId = params.id
    if (!isValidUuid(teamId)) {
      sendJson(res, 400, { error: 'Invalid team ID format' })
      return
    }
    const body = await readJsonBody(req)
    const { agentId: cosAgentId, password } = body || {}

    if (!password || typeof password !== 'string') {
      sendJson(res, 400, { error: 'Governance password is required' })
      return
    }

    const config = loadGovernance()
    if (!config.passwordHash) {
      sendJson(res, 400, { error: 'Governance password not set' })
      return
    }

    // Rate limit per-team to prevent brute-force attacks on one team from blocking others.
    // Use atomic checkAndRecordAttempt to eliminate TOCTOU window between check and record.
    const rateLimitKey = `governance-cos-auth:${teamId}`
    const rateCheck = checkAndRecordAttempt(rateLimitKey)
    if (!rateCheck.allowed) {
      sendJson(res, 429, { error: `Too many failed password attempts. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s` })
      return
    }

    // Password auth -- only managers know the governance password
    if (!(await verifyPassword(password))) {
      sendJson(res, 401, { error: 'Invalid governance password' })
      return
    }
    resetRateLimit(rateLimitKey)

    const team = getTeam(teamId)
    if (!team) {
      sendJson(res, 404, { error: 'Team not found' })
      return
    }

    const managerId = getManagerId()

    try {
      if (cosAgentId === null) {
        // Capture old COS id before updateTeam clears it
        const oldCosId = team.chiefOfStaffId
        // Remove COS -- auto-downgrade team to open (R1.5)
        const updated = await updateTeam(teamId, { chiefOfStaffId: null, type: 'open' }, managerId)

        // Auto-reject pending configure-agent requests from the removed COS (11a safeguard)
        if (oldCosId) {
          try {
            const { loadGovernanceRequests: loadGovReqs, rejectGovernanceRequest: rejectGovReq } = await import('@/lib/governance-request-registry')
            const file = loadGovReqs()
            const pendingFromCOS = file.requests.filter((r: { type: string; status: string; requestedBy: string }) =>
              r.type === 'configure-agent' && r.status === 'pending' && r.requestedBy === oldCosId
            )
            for (const govReq of pendingFromCOS) {
              await rejectGovReq(govReq.id, managerId || 'system', `COS role revoked for team '${team.name}'`)
            }
            if (pendingFromCOS.length > 0) {
              console.log(`[governance] Auto-rejected ${pendingFromCOS.length} pending config request(s) from removed COS ${oldCosId}`)
            }
          } catch (err) {
            console.warn('[governance] Failed to auto-reject pending config requests:', err instanceof Error ? err.message : err)
          }
        }

        sendJson(res, 200, { success: true, team: updated })
        return
      }

      if (typeof cosAgentId !== 'string' || !cosAgentId.trim()) {
        sendJson(res, 400, { error: 'agentId must be a non-empty string or null' })
        return
      }

      // Validate UUID format before registry lookup (mirrors Next.js route)
      if (!isValidUuid(cosAgentId)) {
        sendJson(res, 400, { error: 'Invalid agent ID format' })
        return
      }

      const agent = getAgent(cosAgentId)
      if (!agent) {
        sendJson(res, 404, { error: `Agent '${cosAgentId}' not found` })
        return
      }

      // Assign COS -- auto-upgrade team to closed (R1.3); validateTeamMutation auto-adds COS to agentIds (R4.6)
      const updated = await updateTeam(teamId, { chiefOfStaffId: cosAgentId, type: 'closed' }, managerId)
      sendJson(res, 200, { success: true, team: updated, chiefOfStaffName: agent.name || agent.alias })
    } catch (error) {
      // TeamValidationException carries the correct HTTP status code from business rule validation
      if (error instanceof TeamValidationException) {
        sendJson(res, error.code, { error: error.message })
        return
      }
      console.error('Failed to set chief-of-staff:', error)
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to set chief-of-staff' })
    }
  }},
  { method: 'GET', pattern: /^\/api\/teams\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    const requestingAgentId = auth.agentId
    sendServiceResult(res, getTeamById(params.id, requestingAgentId))
  }},
  { method: 'PUT', pattern: /^\/api\/teams\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    const requestingAgentId = auth.agentId
    sendServiceResult(res, await updateTeamById(params.id, { ...body, requestingAgentId }))
  }},
  { method: 'DELETE', pattern: /^\/api\/teams\/([^/]+)$/, paramNames: ['id'], handler: async (req, res, params) => {
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    const requestingAgentId = auth.agentId
    sendServiceResult(res, await deleteTeamById(params.id, requestingAgentId))
  }},
  { method: 'GET', pattern: /^\/api\/teams$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, listAllTeams())
  }},
  { method: 'POST', pattern: /^\/api\/teams$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    const auth = authenticateAgent(
      getHeader(req, 'Authorization'),
      getHeader(req, 'X-Agent-Id')
    )
    if (auth.error) {
      sendJson(res, auth.status || 401, { error: auth.error })
      return
    }
    const requestingAgentId = auth.agentId
    sendServiceResult(res, await createNewTeam({ ...body, requestingAgentId }))
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
    // Construct typed SkillSearchParams from raw query instead of casting to any
    const searchParams: import('@/types/marketplace').SkillSearchParams = {
      marketplace: query.marketplace || undefined,
      plugin: query.plugin || undefined,
      category: query.category || undefined,
      search: query.search || undefined,
      includeContent: query.includeContent === 'true',
    }
    sendServiceResult(res, await listMarketplaceSkills(searchParams))
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
  // Creation Helper (Haephestos)
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/agents\/creation-helper\/session$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await getCreationHelperStatus())
  }},
  { method: 'POST', pattern: /^\/api\/agents\/creation-helper\/session$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await createCreationHelper())
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/creation-helper\/session$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await deleteCreationHelper())
  }},
  { method: 'POST', pattern: /^\/api\/agents\/creation-helper\/chat$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    sendServiceResult(res, await sendCreationHelperMessage(body?.message || ''))
  }},
  { method: 'GET', pattern: /^\/api\/agents\/creation-helper\/response$/, paramNames: [], handler: async (_req, res) => {
    sendServiceResult(res, await captureCreationHelperResponse())
  }},
  { method: 'POST', pattern: /^\/api\/agents\/creation-helper\/raw-materials$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    const { writeFile, mkdir } = await import('fs/promises')
    const { join } = await import('path')
    const { homedir } = await import('os')
    const stateDir = join(homedir(), 'agents', 'haephestos')
    const stateFile = join(stateDir, 'raw-materials-state.json')
    try {
      const state = {
        personaName: body?.personaName || '',
        avatarUrl: body?.avatarUrl || '',
        avatarIndex: body?.avatarIndex ?? -1,
        uploadedFiles: body?.uploadedFiles || [],
        updatedAt: new Date().toISOString(),
      }
      await mkdir(stateDir, { recursive: true })
      await writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8')
      sendJson(res, 200, { ok: true })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  }},
  { method: 'GET', pattern: /^\/api\/agents\/creation-helper\/raw-materials$/, paramNames: [], handler: async (_req, res) => {
    const { readFile } = await import('fs/promises')
    const { join } = await import('path')
    const { homedir } = await import('os')
    const stateFile = join(homedir(), 'agents', 'haephestos', 'raw-materials-state.json')
    try {
      const content = await readFile(stateFile, 'utf-8')
      sendJson(res, 200, JSON.parse(content))
    } catch {
      sendJson(res, 200, { personaName: '', avatarUrl: '', avatarIndex: -1, uploadedFiles: [], updatedAt: null })
    }
  }},

  // =========================================================================
  // Role Plugins
  // =========================================================================
  { method: 'GET', pattern: /^\/api\/agents\/role-plugins$/, paramNames: [], handler: async (_req, res) => {
    try {
      const plugins = await listRolePlugins()
      sendJson(res, 200, { plugins })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  }},
  { method: 'POST', pattern: /^\/api\/agents\/role-plugins$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    if (!body.tomlContent || typeof body.tomlContent !== 'string') return sendJson(res, 400, { error: 'tomlContent is required and must be a string' })
    try {
      const result = await generatePluginFromToml(body.tomlContent, body.agentDescription)
      sendJson(res, 200, { success: true, pluginName: result.pluginName, pluginDir: result.pluginDir, mainAgentName: result.mainAgentName })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/role-plugins$/, paramNames: [], handler: async (req, res) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const name = url.searchParams.get('name')
    if (!name) return sendJson(res, 400, { error: 'name query parameter is required' })
    try {
      await deleteRolePlugin(name)
      sendJson(res, 200, { success: true })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  }},
  { method: 'POST', pattern: /^\/api\/agents\/role-plugins\/install$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    if (!body.pluginName || !body.agentDir) return sendJson(res, 400, { error: 'pluginName and agentDir are required' })
    try {
      await installPluginLocally(body.pluginName, body.agentDir)
      sendJson(res, 200, { success: true })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  }},
  { method: 'DELETE', pattern: /^\/api\/agents\/role-plugins\/install$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    if (!body.pluginName || !body.agentDir) return sendJson(res, 400, { error: 'pluginName and agentDir are required' })
    try {
      await uninstallPluginLocally(body.pluginName, body.agentDir)
      sendJson(res, 200, { success: true })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  }},

  // Sync default role plugins from GitHub into local marketplace
  { method: 'POST', pattern: /^\/api\/agents\/role-plugins\/sync-defaults$/, paramNames: [], handler: async (req, res) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)
    const force = url.searchParams.get('force') === 'true'
    try {
      const result = await syncDefaultRolePlugins(force)
      sendJson(res, 200, { success: true, ...result })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  }},

  // Browse directory (Folder browser in profile panel)
  { method: 'GET', pattern: /^\/api\/agents\/browse-dir$/, paramNames: [], handler: async (req, res) => {
    const { readdir, stat: fsStat, readFile: fsReadFile } = await import('fs/promises')
    const { join, resolve: pathResolve, normalize: pathNormalize } = await import('path')
    const { homedir } = await import('os')
    const HOME = homedir()
    const ALLOWED = [join(HOME, 'agents'), join(HOME, '.claude')]
    const MAX_LINES = 500
    const MAX_SIZE = 512 * 1024
    const BINARY_EXT = new Set(['png','jpg','jpeg','gif','bmp','ico','webp','avif','tiff','tif','heic','heif','raw','cr2','nef','arw','dng','psd','ai','eps','xcf','sketch','fig','indd','mp4','mkv','avi','mov','wmv','flv','webm','m4v','mpg','mpeg','3gp','ogv','ts','vob','mp3','wav','flac','aac','ogg','wma','m4a','opus','aiff','mid','midi','zip','gz','tar','bz2','xz','7z','rar','zst','lz','lz4','lzma','cab','iso','dmg','pkg','deb','rpm','apk','msi','tgz','tbz2','txz','exe','dll','so','dylib','o','a','lib','obj','bin','elf','com','out','app','mach','wasm','pyc','pyo','class','jar','war','ear','db','sqlite','sqlite3','mdb','accdb','frm','ibd','dbf','woff','woff2','ttf','otf','eot','pfb','pfm','pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','rtf','epub','mobi','azw','azw3','pem','der','p12','pfx','key','crt','cer','jks','keystore','token','tfstate','tsbuildinfo','lcov','dat','pak','bundle','nib','storyboardc','swp','swo'])

    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)
    const dirPath = url.searchParams.get('path')
    const mode = url.searchParams.get('mode')
    if (!dirPath) return sendJson(res, 400, { error: 'Missing path parameter' })

    const norm = pathNormalize(pathResolve(dirPath))
    const allowed = ALLOWED.some(p => norm.startsWith(p)) || norm.includes('/.claude/') || norm.endsWith('/.claude')
    if (!allowed) return sendJson(res, 403, { error: 'Path not allowed' })

    try {
      const st = await fsStat(norm)
      if (mode === 'file' || st.isFile()) {
        if (!st.isFile()) return sendJson(res, 400, { error: 'Not a file' })
        const ext = norm.split('.').pop()?.toLowerCase() || ''
        if (BINARY_EXT.has(ext)) return sendJson(res, 200, { path: norm, content: `(Binary file: .${ext} — preview not supported)`, truncated: false })
        if (st.size > MAX_SIZE) return sendJson(res, 200, { path: norm, content: `(File too large: ${(st.size/1024).toFixed(1)}KB)`, truncated: true })
        const raw = await fsReadFile(norm, 'utf-8')
        if (raw.slice(0, 8192).includes('\0')) return sendJson(res, 200, { path: norm, content: '(Binary file detected — preview not supported)', truncated: false })
        const lines = raw.split('\n')
        const truncated = lines.length > MAX_LINES
        return sendJson(res, 200, { path: norm, content: truncated ? lines.slice(0, MAX_LINES).join('\n') + '\n…' : raw, truncated })
      }
      if (!st.isDirectory()) return sendJson(res, 400, { error: 'Not a directory' })
      const names = await readdir(norm)
      const entries: { name: string; type: string; size: number }[] = []
      for (const name of names.sort()) {
        if (name.startsWith('.') && name !== '.claude' && name !== '.claude-plugin') continue
        try {
          const ep = join(norm, name)
          const es = await fsStat(ep)
          entries.push({ name, type: es.isDirectory() ? 'dir' : 'file', size: es.isFile() ? es.size : 0 })
        } catch { /* skip */ }
      }
      return sendJson(res, 200, { path: norm, entries })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  }},

  // Create agent from TOML (single endpoint: generate + create folder + install)
  // Unified persona creation — used by both wizard and Haephestos
  { method: 'POST', pattern: /^\/api\/agents\/create-persona$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    if (!body.personaName || typeof body.personaName !== 'string') return sendJson(res, 400, { error: 'personaName is required' })
    if (!body.tomlContent && !body.pluginName) return sendJson(res, 400, { error: 'Either tomlContent or pluginName is required' })
    if (body.tomlContent && body.pluginName) return sendJson(res, 400, { error: 'Provide either tomlContent or pluginName, not both' })
    try {
      const result = await createPersona({
        personaName: body.personaName,
        tomlContent: body.tomlContent,
        pluginName: body.pluginName,
        marketplaceName: body.marketplaceName,
        agentDescription: body.agentDescription,
      })
      sendJson(res, 200, { success: true, ...result })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
  }},

  // Legacy endpoint — delegates to createPersona
  { method: 'POST', pattern: /^\/api\/agents\/create-from-toml$/, paramNames: [], handler: async (req, res) => {
    const body = await readJsonBody(req)
    if (!body.tomlContent || typeof body.tomlContent !== 'string') return sendJson(res, 400, { error: 'tomlContent is required' })
    if (!body.personaName || typeof body.personaName !== 'string') return sendJson(res, 400, { error: 'personaName is required' })
    try {
      const result = await createPersona({
        personaName: body.personaName,
        tomlContent: body.tomlContent,
        agentDescription: body.agentDescription,
      })
      sendJson(res, 200, { success: true, personaName: result.personaName, agentDir: result.agentDir, pluginName: result.pluginName, pluginDir: result.agentDir, mainAgentName: result.mainAgentName })
    } catch (e) { sendJson(res, 500, { error: String(e) }) }
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
      // Single URL parse with modern API (avoids double parse and deprecated url.parse)
      const urlObj = new URL(req.url || '/', 'http://localhost')
      const pathname = urlObj.pathname || '/'
      const method = req.method || 'GET'
      const query: Record<string, string> = {}
      urlObj.searchParams.forEach((v, k) => { query[k] = v })

      const matched = matchRoute(method, pathname)
      if (!matched) {
        return false // Not handled — caller should return 404
      }

      try {
        await matched.handler(req, res, matched.params, query)
      } catch (error: any) {
        console.error(`[Headless] Error handling ${method} ${pathname}:`, error)
        if (!res.headersSent) {
          // Only honor 413 from readJsonBody; all other errors default to 500
          const statusCode = error?.statusCode === 413 ? 413 : 500
          const message = statusCode === 413 ? 'Request body too large' : 'Internal server error'
          sendJson(res, statusCode, { error: message })
        }
      }

      return true // Handled
    },
  }
}
