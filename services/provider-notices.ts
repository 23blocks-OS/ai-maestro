/**
 * Provider notices for policy holds (AMP 07 "Policy Holds" and "Provider Notices"; docs/SPEC-POLICY-RULES.md section 17).
 *
 * - `approval_request` to each reviewer when an entry is created. Its message id is that reviewer's approval request:
 *   a signed answer must reply to it (services/policy-service answerProviderMessage).
 * - `quarantine_outcome` to the sender when the entry is approved, rejected or expires, in reply to the held message.
 *
 * Each notice is an ordinary AMP message from `_provider@<tenant>.<provider>`, payload.type "system", signed with the
 * provider key (lib/provider-key), and sent through the normal route as this host's own traffic, so it reaches an
 * agent's inbox or a person's mailbox (13.5) on whichever host holds them.
 */
import { routeMessage } from '@/services/amp-service'
import { getSelfHostId } from '@/lib/hosts-config-server.mjs'
import { AMP_PROVIDER_NAME, type AMPRouteRequest } from '@/lib/types/amp'
import { providerNoticeAddress, signAsProvider } from '@/lib/provider-key'
import { recordApprovalRequest, type QuarantineEntry } from '@/lib/policy-approvals'
import type { ServiceResult } from '@/services/service-errors'

export type RouteFn = (body: AMPRouteRequest) => Promise<ServiceResult<unknown>>
const viaRoute: RouteFn = body => routeMessage(body, null, getSelfHostId(), null, body.signature || null, null)

interface Notice { to: string; subject: string; message: string; in_reply_to?: string; context: Record<string, unknown> }

/** A signed provider notice, ready for the route; null when this host has no provider key */
export function buildProviderNotice(n: Notice): AMPRouteRequest | null {
  const from = providerNoticeAddress()
  const payload = { type: 'system' as const, message: n.message, context: { provider: AMP_PROVIDER_NAME, ...n.context } }
  const signature = signAsProvider({ from, to: n.to, subject: n.subject, priority: 'normal', in_reply_to: n.in_reply_to || '', payload })
  if (!signature) return null
  return { from, to: n.to, subject: n.subject, priority: 'normal', ...(n.in_reply_to ? { in_reply_to: n.in_reply_to } : {}), payload, signature }
}

/** Sends a notice; returns the id the recipient's host gave it, or null (logged, never thrown) */
export async function sendProviderNotice(n: Notice, route: RouteFn = viaRoute): Promise<string | null> {
  const req = buildProviderNotice(n)
  if (!req) { console.warn(`[Policy] no provider key: cannot send the ${n.context.amp_notice} notice to ${n.to}`); return null }
  try {
    const r = await route(req)
    const id = (r.data as { id?: unknown } | undefined)?.id
    if (r.status >= 300 || typeof id !== 'string') {
      console.warn(`[Policy] the ${n.context.amp_notice} notice to ${n.to} was not delivered (${r.status}): ${(r.data as { message?: string } | undefined)?.message || ''}`)
      return null
    }
    return id
  } catch (e) {
    console.warn(`[Policy] the ${n.context.amp_notice} notice to ${n.to} failed: ${(e as Error).message}`)
    return null
  }
}

/** 07 "Approval request": one notice per reviewer, each recorded on the entry */
export async function sendApprovalRequests(entry: QuarantineEntry, route: RouteFn = viaRoute): Promise<void> {
  const h = entry.held
  const held = h?.from || h?.to || h?.subject ? { ...(h.from ? { from: h.from } : {}), ...(h.to ? { to: h.to } : {}), ...(h.subject !== undefined ? { subject: h.subject } : {}) } : undefined
  const what = `${entry.action} from ${h?.from || entry.from} to ${h?.to || entry.to}`
  for (const to of entry.reviewers) {
    const id = await sendProviderNotice({
      to,
      subject: `Approval needed: ${what}`,
      message: `A ${what} is held for your approval (rule ${entry.rules_triggered.join(', ')}: ${entry.reason_text}). `
        + `Answer by replying to this message with payload.context { "decision": "approve" or "reject", "quarantine_id": "${entry.quarantine_id}" }, `
        + `or use /v1/quarantine/${entry.quarantine_id}. It expires at ${entry.expires_at}.`,
      context: {
        amp_notice: 'approval_request', quarantine_id: entry.quarantine_id, reason_text: entry.reason_text,
        rules_triggered: entry.rules_triggered, ...(held ? { held } : {}), expires_at: entry.expires_at,
      },
    }, route)
    if (id) recordApprovalRequest(entry.quarantine_id, to, id)
  }
}

/** 07 "Outcome notice": to the sender, in reply to the held message; decided_by only for a verified signed decision */
export async function sendOutcomeNotice(entry: QuarantineEntry, text: string, route: RouteFn = viaRoute): Promise<void> {
  if (!entry.sender || entry.status === 'pending') return
  await sendProviderNotice({
    to: entry.sender,
    subject: `Quarantine ${entry.status}: your ${entry.action} to ${entry.held?.to || entry.to}`,
    message: text,
    ...(entry.held?.message_id ? { in_reply_to: entry.held.message_id } : {}),
    context: {
      amp_notice: 'quarantine_outcome', quarantine_id: entry.quarantine_id, status: entry.status, reason_text: entry.reason_text,
      ...(entry.decided?.via === 'signed-message' ? { decided_by: entry.decided.by } : {}),
    },
  }, route)
}
