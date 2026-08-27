/**
 * Stable ID Generator
 * Generates consistent SHA-1 based IDs for nodes and edges
 * Ensures incremental updates don't create duplicate entries
 */

import { createHash } from 'crypto';

/**
 * Generate a stable SHA-1 hash from input strings
 */
function sha1(...parts: string[]): string {
  const hash = createHash('sha1');
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest('hex');
}

/**
 * Generate stable IDs for message-related entities
 */
export const msgId = {
  /**
   * Message ID: msg-{timestamp}-{hash of seed}
   *
   * MUST be deterministic. `:put messages` upserts on msg_id, so a random
   * component turns every re-index into an INSERT instead of an update — the
   * message, its ~26 msg_terms rows and its 1.5 KB embedding are all
   * duplicated. Measured before this was fixed: 9.5x duplication on a
   * long-lived agent (451,206 rows for 47,414 real messages), and duplicates
   * were the dominant cost in multi-GB agent databases.
   *
   * Callers pass a stable seed identifying the message within its
   * conversation — see ingest.ts. Everything else in this module was already
   * content-hashed; messages were the sole exception.
   */
  message: (ts: number, seed: string): string => `msg-${ts}-${sha1(seed).slice(0, 12)}`,

  /** Thread ID: thread-{session}-{timestamp} */
  thread: (sessionId: string, ts: number): string => `thread-${sessionId}-${ts}`,
};

/**
 * Generate stable IDs for code graph entities
 */
export const codeId = {
  /** File ID: hash of path */
  file: (path: string): string => sha1(path),

  /** Function ID: hash of (file, name) */
  fn: (filePath: string, name: string): string => sha1(filePath, name),

  /** Component ID: hash of (file, name) */
  component: (filePath: string, name: string): string => sha1(filePath, name),

  /** Service ID: hash of (file, name) */
  service: (filePath: string, name: string): string => sha1(filePath, name),

  /** API ID: hash of (method, path) */
  api: (method: string, path: string): string => sha1(method.toUpperCase(), path),
};

/**
 * Generate stable IDs for database schema entities
 */
export const dbId = {
  /** Database ID */
  database: (name: string): string => `db:${name}`,

  /** Schema ID */
  schema: (dbName: string, schemaName: string): string => `schema:${dbName}.${schemaName}`,

  /** Table ID */
  table: (schemaId: string, tableName: string): string => `table:${schemaId}.${tableName}`,

  /** Column ID */
  column: (tableId: string, columnName: string): string => `col:${tableId}.${columnName}`,

  /** Index ID */
  index: (tableId: string, indexName: string): string => `idx:${tableId}.${indexName}`,

  /** Constraint ID */
  constraint: (tableId: string, constraintName: string): string => `const:${tableId}.${constraintName}`,

  /** View ID */
  view: (schemaId: string, viewName: string): string => `view:${schemaId}.${viewName}`,

  /** Enum ID */
  enum: (schemaId: string, enumName: string): string => `enum:${schemaId}.${enumName}`,

  /** Enum Value ID */
  enumValue: (enumId: string, value: string): string => `enumval:${enumId}.${value}`,

  /** Procedure ID */
  proc: (schemaId: string, procName: string): string => `proc:${schemaId}.${procName}`,

  /** Trigger ID */
  trigger: (tableId: string, triggerName: string): string => `trig:${tableId}.${triggerName}`,
};

/**
 * Generate stable IDs for edges
 */
export const edgeId = {
  /** Code edge: declares, imports, calls, uses_api, service_depends, component_calls */
  code: (type: string, from: string, to: string): string => sha1(type, from, to),

  /** DB edge: foreign key, index_on, check_depends_on, view_depends_on, etc. */
  db: (type: string, from: string, to: string): string => sha1(type, from, to),
};

/**
 * Parse hierarchical session name into parts
 * Example: "fluidmind/agents/backend-architect" → ["fluidmind", "agents", "backend-architect"]
 */
export function parseSessionName(name: string): string[] {
  return name.split('/').filter(Boolean);
}

/**
 * Generate a short, human-readable ID (first 8 chars of SHA-1)
 */
export function shortId(...parts: string[]): string {
  return sha1(...parts).substring(0, 8);
}

/**
 * Validate session name format (alphanumeric, hyphens, underscores, slashes)
 */
export function isValidSessionName(name: string): boolean {
  return /^[a-zA-Z0-9_\-/]+$/.test(name);
}

/**
 * Sanitize session name (replace invalid characters with hyphens)
 */
export function sanitizeSessionName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-/]/g, '-');
}
