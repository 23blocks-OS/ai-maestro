/**
 * Memory Settings Service
 *
 * Host-level memory settings:
 *   - classifier (Jev URL, model, API key, thresholds). The API key is
 *     write-only: it is accepted on save and never returned.
 *   - consolidation (pause, night window, history backfill, per-run limits),
 *     with a live status of this host's agents.
 *
 *   GET    /api/settings/memory       -> getMemorySettings
 *   PUT    /api/settings/memory       -> updateMemorySettings
 *   DELETE /api/settings/memory       -> removeMemoryApiKey
 *   POST   /api/settings/memory/test  -> testMemoryClassifier
 */

import {
  loadClassifierSettings,
  saveClassifierSettings,
  loadConsolidationSettings,
  saveConsolidationSettings,
  inConsolidationWindow,
  nextConsolidationWindow,
  type ConsolidationSettings,
  clearClassifierKey,
  maskClassifierSettings,
  type ClassifierSettings,
} from '@/lib/memory/settings'
import { testClassifier } from '@/lib/memory/jev-provider'
import { readMemorySkill } from '@/lib/memory/skill'
import { readBacklog, isBacklogRunning } from '@/lib/memory/backlog'
import { loadAgents } from '@/lib/agent-registry'
import { type ServiceResult, operationFailed } from '@/services/service-errors'

/**
 * What consolidation is doing on this host: read from each agent's switches
 * and its last-run marker (memory-backlog.json), so it costs no database.
 */
export function consolidationStatus(now: Date = new Date()) {
  const host = loadConsolidationSettings()
  const day = 24 * 60 * 60 * 1000
  let memoryOn = 0, building = 0, historyWaiting = 0, lastRunAt = 0
  const last24h = { agents: 0, conversations: 0, memories: 0 }
  for (const agent of loadAgents().filter(a => !a.deletedAt)) {
    const skill = readMemorySkill(agent.id)
    if (!skill.enabled) continue
    memoryOn++
    if (skill.consolidate) building++
    const b = readBacklog(agent.id)
    if (!b) continue
    if (skill.consolidate && b.moreRemaining) historyWaiting++
    if (b.at > lastRunAt) lastRunAt = b.at
    if (now.getTime() - b.at < day) {
      last24h.agents++
      last24h.conversations += b.conversationsProcessed || 0
      last24h.memories += b.memoriesCreated || 0
    }
  }
  const open = inConsolidationWindow(now, host)
  return {
    state: host.paused ? 'paused' : open ? 'in_window' : 'scheduled',
    pausedByEnvironment: process.env.MEMORY_CONSOLIDATION_PAUSED === 'true',
    inWindow: open,
    nextWindowAt: host.paused ? null : nextConsolidationWindow(now, host).toISOString(),
    backlogRunning: isBacklogRunning(),
    agents: { memoryOn, building, historyWaiting },
    lastRunAt: lastRunAt || null,
    last24h,
  }
}

export function getMemorySettings(): ServiceResult<any> {
  return {
    data: {
      classifier: maskClassifierSettings(loadClassifierSettings()),
      consolidation: loadConsolidationSettings(),
      status: consolidationStatus(),
    },
    status: 200,
  }
}

export function updateMemorySettings(body: { classifier?: Partial<ClassifierSettings>; consolidation?: Partial<ConsolidationSettings> }): ServiceResult<any> {
  try {
    const classifier = body?.classifier ? saveClassifierSettings(body.classifier) : loadClassifierSettings()
    const consolidation = body?.consolidation ? saveConsolidationSettings(body.consolidation) : loadConsolidationSettings()
    return {
      data: { success: true, classifier: maskClassifierSettings(classifier), consolidation, status: consolidationStatus() },
      status: 200,
    }
  } catch (error) {
    return operationFailed('save memory settings', (error as Error).message)
  }
}

export function removeMemoryApiKey(): ServiceResult<any> {
  try {
    return { data: { success: true, classifier: maskClassifierSettings(clearClassifierKey()) }, status: 200 }
  } catch (error) {
    return operationFailed('remove memory API key', (error as Error).message)
  }
}

/**
 * Test the stored settings, optionally overridden by unsaved form values
 * (so "Test" works before "Save"). A blank apiKey uses the stored key.
 */
export async function testMemoryClassifier(body: { classifier?: Partial<ClassifierSettings> }): Promise<ServiceResult<any>> {
  const stored = loadClassifierSettings()
  const override = body?.classifier || {}
  const candidate: ClassifierSettings = {
    ...stored,
    ...(override.url?.trim() ? { url: override.url.trim() } : {}),
    ...(override.model?.trim() ? { model: override.model.trim() } : {}),
    ...(override.apiKey?.trim() ? { apiKey: override.apiKey.trim() } : {}),
  }
  if (!candidate.apiKey) {
    return { data: { ok: false, message: 'No API key set' }, status: 200 }
  }
  return { data: await testClassifier(candidate), status: 200 }
}
