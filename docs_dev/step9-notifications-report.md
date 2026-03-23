# Step 9: Config Request Notification System

Generated: 2026-02-22

## Changes Made

### 9a/9c. cross-host-governance-service.ts - Notification dispatches added

Three locations now dispatch notifications via lazy import of `config-notification-service.ts`:

1. **Auto-approve path** (receiveCrossHostRequest, ~line 209): When a trusted manager's configure-agent request is auto-approved and executed.
2. **Manual approve path** (approveCrossHostRequest, ~line 281): When a configure-agent request reaches 'executed' status after manual dual-approval.
3. **Reject path** (rejectCrossHostRequest, ~line 329): When a configure-agent request is rejected.

All three use lazy `await import()` to avoid circular dependencies and wrap in try/catch with `console.warn` so notification failures never block the governance flow.

### 9b. config-notification-service.ts - New file created

`/Users/emanuelesabetta/ai-maestro/services/config-notification-service.ts`

Exports one public function: `notifyConfigRequestOutcome(request, outcome)`

Notification channels:
- **AMP message** (high priority) to the requesting agent's session name via internal `/api/messages` endpoint
- **tmux display-message** push notification to the requesting agent's session (best-effort, silently ignores failures)
- **Console audit log** for all outcomes regardless of delivery success

The service resolves agent names from the registry for human-readable subjects/bodies. Includes operation type, target agent name, request ID, and rejection reason (when applicable).
