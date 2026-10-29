-- AMP-RTC call storage (opt-in; apply via deployment migration process).
-- No public routes are enabled by this migration.
CREATE TABLE IF NOT EXISTS rtc_calls (
  call_id UUID PRIMARY KEY,
  caller_id TEXT NOT NULL,
  callee_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('inviting','ringing','accepted','connected','rejected','canceled','ended','failed','timed_out')),
  revision BIGINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_device_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (revision >= 0),
  CHECK (accepted_device_id IS NULL OR state IN ('accepted','connected','ended','failed'))
);
CREATE TABLE IF NOT EXISTS rtc_call_events (
  event_id UUID PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES rtc_calls(call_id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rtc_calls_expiry_idx ON rtc_calls (expires_at) WHERE state IN ('inviting','ringing');
CREATE INDEX IF NOT EXISTS rtc_call_events_call_idx ON rtc_call_events(call_id);
