/**
 * Memory Settings Service
 *
 * Host-level classifier settings (Jev URL, model, API key, thresholds).
 * The API key is write-only: it is accepted on save and never returned.
 *
 *   GET    /api/settings/memory       -> getMemorySettings
 *   PUT    /api/settings/memory       -> updateMemorySettings
 *   DELETE /api/settings/memory       -> removeMemoryApiKey
 *   POST   /api/settings/memory/test  -> testMemoryClassifier
 */

import {
  loadClassifierSettings,
  saveClassifierSettings,
  clearClassifierKey,
  maskClassifierSettings,
  type ClassifierSettings,
} from '@/lib/memory/settings'
import { testClassifier } from '@/lib/memory/jev-provider'
import { type ServiceResult, operationFailed } from '@/services/service-errors'

export function getMemorySettings(): ServiceResult<any> {
  return { data: { classifier: maskClassifierSettings(loadClassifierSettings()) }, status: 200 }
}

export function updateMemorySettings(body: { classifier?: Partial<ClassifierSettings> }): ServiceResult<any> {
  try {
    const saved = saveClassifierSettings(body?.classifier || {})
    return { data: { success: true, classifier: maskClassifierSettings(saved) }, status: 200 }
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
