import type { Pool, PoolClient } from 'pg'
import { transitionRTCCall, type RTCCall, type RTCEvent, type RTCTransition } from '@/lib/amp-rtc'

/**
 * Durable RTC lifecycle store. Every event runs in one database transaction.
 * This does NOT authenticate callers: only a trusted, verified AMP event
 * dispatcher may invoke applyEvent. No public API route is exposed.
 */
export class PostgresRTCCallStore {
  constructor(private readonly pool: Pool) {}

  async create(call: RTCCall): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO rtc_calls(call_id, caller_id, callee_id, state, expires_at)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [call.callId, call.caller, call.callee, call.state, call.expiresAt],
    )
    return result.rowCount === 1
  }

  async applyEvent(event: RTCEvent, nowMs = Date.now()): Promise<RTCTransition | { ok: false; reason: 'not_found' }> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const row = await client.query(
        'SELECT call_id, caller_id, callee_id, state, expires_at, accepted_device_id FROM rtc_calls WHERE call_id=$1 FOR UPDATE',
        [event.callId],
      )
      if (!row.rows.length) {
        await client.query('ROLLBACK')
        return { ok: false, reason: 'not_found' }
      }
      const r = row.rows[0]
      const seen = await client.query('SELECT event_id FROM rtc_call_events WHERE call_id=$1', [event.callId])
      const call: RTCCall = {
        callId: r.call_id, caller: r.caller_id, callee: r.callee_id, state: r.state,
        expiresAt: new Date(r.expires_at).toISOString(), acceptedBy: r.accepted_device_id || undefined,
        seenEventIds: seen.rows.map(x => x.event_id),
      }
      const next = transitionRTCCall(call, event, nowMs)
      if (!next.ok) {
        await client.query('ROLLBACK')
        return next
      }
      if (next.duplicate) {
        await client.query('COMMIT')
        return next
      }
      await client.query(
        `UPDATE rtc_calls SET state=$2, accepted_device_id=$3, revision=revision+1, updated_at=now() WHERE call_id=$1`,
        [call.callId, next.call.state, next.call.acceptedBy || null],
      )
      await client.query(
        'INSERT INTO rtc_call_events(event_id,call_id,actor_id,event_type) VALUES($1,$2,$3,$4)',
        [event.eventId, event.callId, event.actor, event.type],
      )
      await client.query('COMMIT')
      return next
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /** Expire stale invitations in a single atomic update. */
  async expire(now = new Date()): Promise<number> {
    const result = await this.pool.query(
      `UPDATE rtc_calls SET state='timed_out', revision=revision+1, updated_at=now()
       WHERE state IN ('inviting','ringing') AND expires_at <= $1`,
      [now],
    )
    return result.rowCount || 0
  }
}
