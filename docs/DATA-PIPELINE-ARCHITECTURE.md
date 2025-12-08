# Data Pipeline Architecture: Agent Metrics & Analytics

**Project:** AI Maestro
**Author:** Engineering Team
**Date:** 2025-11-03
**Status:** Design Approved

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Data Sources](#data-sources)
4. [Agent-Side Pipeline](#agent-side-pipeline)
5. [Dashboard Aggregation](#dashboard-aggregation)
6. [Database Schema](#database-schema)
7. [API Specification](#api-specification)
8. [Implementation Phases](#implementation-phases)
9. [Cost Analysis](#cost-analysis)
10. [Security Considerations](#security-considerations)

---

## Executive Summary

### The Challenge

Claude Code stores conversation data in JSONL files (one per session), but we need:
- Aggregated metrics across multiple sessions
- Per-agent analytics (messages, tokens, costs, tools)
- Real-time dashboard updates
- Support for local AND remote agents

### The Solution: Distributed SQLite Architecture

**Key Insight:** Each agent maintains its own SQLite database and exposes a `/metrics` API endpoint. The dashboard polls all agents and aggregates metrics.

**Why This Works:**
- ✅ **No central database** - Each agent is self-contained
- ✅ **$0 cost** - SQLite is free (vs $45+/month for PostgreSQL)
- ✅ **Agents work offline** - Local metrics persist even when disconnected
- ✅ **Horizontal scaling** - Add agents without infrastructure changes
- ✅ **Simple dashboard** - Just fetch + aggregate JSON (no parsing)

### Architecture Diagram

```
┌─────────────────────────────────────────┐
│  Local Agent (tmux)                     │
│  ┌──────────┐     ┌──────────────┐     │
│  │ JSONL    │────▶│ SQLite       │     │
│  │ Files    │     │ (agent1.db)  │     │
│  └──────────┘     └──────┬───────┘     │
│                           │             │
│                   GET /metrics          │
│                           │             │
└───────────────────────────┼─────────────┘
                            │
                            ▼
┌─────────────────────────────────────────┐
│  Dashboard (localhost:3000)             │
│  ┌───────────────────────────────────┐  │
│  │  Metrics Aggregator               │  │
│  │  • Polls agents every 30s         │  │
│  │  • Aggregates metrics             │  │
│  │  • Updates UI                     │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┼─────────────┐
│  Cloud Agent (AWS)                      │
│  ┌──────────┐     ┌──────────────┐     │
│  │ JSONL    │────▶│ SQLite       │     │
│  │ Files    │     │ (agent.db)   │     │
│  └──────────┘     └──────┬───────┘     │
│                           │             │
│                   GET /metrics          │
│                   (HTTPS + JWT)         │
└───────────────────────────────────────┘
```

---

## Architecture Overview

### Three-Layer Architecture

#### Layer 1: Data Collection (Agent-Side)
- Watch Claude Code JSONL files
- Parse messages, tools, tokens
- Store in local SQLite database
- Pre-compute aggregates

#### Layer 2: API Exposure (Agent-Side)
- Expose `/metrics` HTTP endpoint
- Return pre-computed metrics as JSON
- Support both local (localhost) and remote (HTTPS) access

#### Layer 3: Aggregation (Dashboard-Side)
- Poll all registered agents
- Aggregate metrics across agents
- Cache results
- Display in UI

### Key Design Principles

1. **Agent Autonomy** - Each agent is self-contained
2. **Push-Down Computation** - Agents do heavy lifting (parsing, aggregation)
3. **Dashboard Simplicity** - Dashboard just fetches + sums
4. **Offline-First** - Agents work without dashboard
5. **No Vendor Lock-In** - SQLite is portable, no cloud dependencies

---

## Data Sources

### Claude Code JSONL Files

**Location:**
```
~/.claude/projects/<project-path>/<session-uuid>.jsonl
```

**Example:**
```
~/.claude/projects/-Users-juanpelaez-23blocks-webApps-agents-web/
  ├── 1e8544aa-de65-4f54-8691-4d138836c981.jsonl  (17MB)
  ├── 5729a025-a7a1-4d4f-a306-c253db9173ba.jsonl  (9MB)
  └── 0788d181-33ee-4f6b-88da-45e17634d39f.jsonl  (19MB)
```

### JSONL Message Structure

Each line is a JSON object containing:

```json
{
  "uuid": "abc123...",
  "sessionId": "1e8544aa-...",
  "timestamp": "2025-10-29T04:41:30.541Z",
  "type": "user" | "assistant",
  "message": {
    "role": "user" | "assistant",
    "content": [...],
    "usage": {
      "input_tokens": 4,
      "output_tokens": 114,
      "cache_read_input_tokens": 70236
    }
  },
  "toolUseResult": {
    "durationMs": 86,
    "stdout": "...",
    "numFiles": 8
  }
}
```

### Data We Extract

**Per Message:**
- Message UUID, timestamp, role
- Token usage (input, output, cached)
- Cost (calculated from tokens)
- Tool invocations (name, duration, status)

**Per Session:**
- Session ID, start time, last active
- Total messages, tokens, cost
- Git branch, working directory
- Claude Code version

**Reference Documents:**
- [JSONL Conversation Structure](./JSONL-CONVERSATION-STRUCTURE.md) - Complete JSONL format
- [Claude File Source](./benchmark/claude-file-source.md) - Deep dive on available data
- [Consolidation Strategy](./benchmark/jsonl-consolidation-strategy.md) - Why we need consolidation

---

## Agent-Side Pipeline

### Component: JSONL Parser & Collector

**File:** `lib/metrics/jsonl-parser.js`

```javascript
const Database = require('better-sqlite3')
const chokidar = require('chokidar')
const fs = require('fs')
const readline = require('readline')

class MetricsCollector {
  constructor(agentId, claudeProjectDir) {
    this.agentId = agentId
    this.claudeProjectDir = claudeProjectDir
    this.db = new Database(`/var/lib/ai-maestro/${agentId}.db`)

    this.initDatabase()
    this.startWatching()
  }

  initDatabase() {
    this.db.exec(`
      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        start_time TEXT,
        last_active TEXT,
        git_branch TEXT,
        working_directory TEXT,
        claude_version TEXT,
        total_messages INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0
      );

      -- Messages table
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_uuid TEXT UNIQUE,
        session_id TEXT,
        parent_uuid TEXT,
        timestamp TEXT,
        type TEXT,  -- 'user' or 'assistant'
        role TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cached_tokens INTEGER DEFAULT 0,
        cost REAL DEFAULT 0,
        model TEXT,
        request_id TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      );

      -- Tool invocations table
      CREATE TABLE IF NOT EXISTS tool_invocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_id TEXT UNIQUE,
        session_id TEXT,
        message_uuid TEXT,
        tool_name TEXT,
        timestamp TEXT,
        duration_ms INTEGER,
        status TEXT,  -- 'success' or 'error'
        input TEXT,   -- JSON
        output TEXT,  -- JSON
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      );

      -- Pre-aggregated metrics (for fast /metrics queries)
      CREATE TABLE IF NOT EXISTS current_metrics (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        agent_id TEXT,
        total_sessions INTEGER DEFAULT 0,
        total_messages INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,

        -- Tool counts
        tool_bash INTEGER DEFAULT 0,
        tool_read INTEGER DEFAULT 0,
        tool_write INTEGER DEFAULT 0,
        tool_edit INTEGER DEFAULT 0,
        tool_grep INTEGER DEFAULT 0,
        tool_glob INTEGER DEFAULT 0,
        tool_todowrite INTEGER DEFAULT 0,
        tool_webfetch INTEGER DEFAULT 0,
        tool_websearch INTEGER DEFAULT 0,
        tool_task INTEGER DEFAULT 0,

        -- Performance metrics
        avg_response_time_ms INTEGER DEFAULT 0,
        cache_hit_rate REAL DEFAULT 0,
        error_rate REAL DEFAULT 0,

        -- Timestamps
        first_message TEXT,
        last_message TEXT,
        last_updated TEXT
      );

      -- Initialize metrics row
      INSERT OR IGNORE INTO current_metrics (id, agent_id) VALUES (1, ?);

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_tools_session ON tool_invocations(session_id);
      CREATE INDEX IF NOT EXISTS idx_tools_name ON tool_invocations(tool_name);
    `, [this.agentId])
  }

  startWatching() {
    // Watch for new/changed JSONL files
    const watcher = chokidar.watch(`${this.claudeProjectDir}/*.jsonl`, {
      persistent: true,
      ignoreInitial: false,  // Parse existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    })

    watcher.on('add', (filepath) => this.parseFile(filepath))
    watcher.on('change', (filepath) => this.parseFile(filepath))

    console.log(`[MetricsCollector] Watching ${this.claudeProjectDir}`)
  }

  async parseFile(filepath) {
    const sessionId = path.basename(filepath, '.jsonl')
    const lastPosition = this.getLastPosition(filepath)

    const stream = fs.createReadStream(filepath, {
      start: lastPosition,
      encoding: 'utf8'
    })

    const rl = readline.createInterface({ input: stream })

    let lineCount = 0
    for await (const line of rl) {
      if (!line.trim()) continue

      try {
        const msg = JSON.parse(line)
        this.processMessage(msg, sessionId)
        lineCount++
      } catch (error) {
        console.error(`[MetricsCollector] Parse error:`, error)
      }
    }

    if (lineCount > 0) {
      this.updateAggregates()
      this.saveLastPosition(filepath)
    }
  }

  processMessage(msg, sessionId) {
    // Upsert session
    this.db.prepare(`
      INSERT INTO sessions (session_id, start_time, last_active, git_branch, working_directory, claude_version)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        last_active = excluded.last_active
    `).run(
      sessionId,
      msg.timestamp,
      msg.timestamp,
      msg.gitBranch,
      msg.cwd,
      msg.version
    )

    // Insert assistant message with token data
    if (msg.type === 'assistant' && msg.message?.usage) {
      const usage = msg.message.usage
      const cost = this.calculateCost(usage)

      this.db.prepare(`
        INSERT OR IGNORE INTO messages (
          message_uuid, session_id, parent_uuid, timestamp, type, role,
          input_tokens, output_tokens, cached_tokens, cost, model, request_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        msg.uuid,
        sessionId,
        msg.parentUuid,
        msg.timestamp,
        msg.type,
        msg.message.role,
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        usage.cache_read_input_tokens || 0,
        cost,
        msg.message.model,
        msg.requestId
      )
    }

    // Insert tool invocation
    if (msg.message?.content?.[0]?.type === 'tool_use') {
      const tool = msg.message.content[0]

      this.db.prepare(`
        INSERT OR IGNORE INTO tool_invocations (
          tool_id, session_id, message_uuid, tool_name, timestamp, input
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        tool.id,
        sessionId,
        msg.uuid,
        tool.name,
        msg.timestamp,
        JSON.stringify(tool.input)
      )
    }

    // Update tool result
    if (msg.toolUseResult && msg.message?.content?.[0]?.tool_use_id) {
      const toolId = msg.message.content[0].tool_use_id
      const isError = msg.message.content[0].is_error

      this.db.prepare(`
        UPDATE tool_invocations
        SET duration_ms = ?, status = ?, output = ?
        WHERE tool_id = ?
      `).run(
        msg.toolUseResult.durationMs || 0,
        isError ? 'error' : 'success',
        JSON.stringify(msg.toolUseResult),
        toolId
      )
    }
  }

  calculateCost(usage) {
    // Sonnet 4.5 pricing (per 1M tokens)
    const PRICING = {
      input: 0.003,
      output: 0.015,
      cacheWrite: 0.00375,
      cacheRead: 0.0003
    }

    return (
      (usage.input_tokens / 1000000 * PRICING.input) +
      (usage.output_tokens / 1000000 * PRICING.output) +
      ((usage.cache_creation_input_tokens || 0) / 1000000 * PRICING.cacheWrite) +
      ((usage.cache_read_input_tokens || 0) / 1000000 * PRICING.cacheRead)
    )
  }

  updateAggregates() {
    // Update current_metrics table with latest totals
    this.db.prepare(`
      UPDATE current_metrics SET
        total_sessions = (SELECT COUNT(DISTINCT session_id) FROM sessions),
        total_messages = (SELECT COUNT(*) FROM messages),
        total_tokens = (SELECT SUM(input_tokens + output_tokens) FROM messages),
        total_cost = (SELECT SUM(cost) FROM messages),

        tool_bash = (SELECT COUNT(*) FROM tool_invocations WHERE tool_name = 'Bash'),
        tool_read = (SELECT COUNT(*) FROM tool_invocations WHERE tool_name = 'Read'),
        tool_write = (SELECT COUNT(*) FROM tool_invocations WHERE tool_name = 'Write'),
        tool_edit = (SELECT COUNT(*) FROM tool_invocations WHERE tool_name = 'Edit'),
        tool_grep = (SELECT COUNT(*) FROM tool_invocations WHERE tool_name = 'Grep'),
        tool_glob = (SELECT COUNT(*) FROM tool_invocations WHERE tool_name = 'Glob'),
        tool_todowrite = (SELECT COUNT(*) FROM tool_invocations WHERE tool_name = 'TodoWrite'),
        tool_webfetch = (SELECT COUNT(*) FROM tool_invocations WHERE tool_name = 'WebFetch'),
        tool_websearch = (SELECT COUNT(*) FROM tool_invocations WHERE tool_name = 'WebSearch'),
        tool_task = (SELECT COUNT(*) FROM tool_invocations WHERE tool_name = 'Task'),

        cache_hit_rate = (
          SELECT 100.0 * SUM(cached_tokens) / NULLIF(SUM(input_tokens + cached_tokens), 0)
          FROM messages
        ),
        error_rate = (
          SELECT 100.0 * COUNT(*) FILTER (WHERE status = 'error') / NULLIF(COUNT(*), 0)
          FROM tool_invocations
        ),

        first_message = (SELECT MIN(timestamp) FROM messages),
        last_message = (SELECT MAX(timestamp) FROM messages),
        last_updated = datetime('now')
      WHERE id = 1
    `).run()
  }

  getMetrics() {
    return this.db.prepare('SELECT * FROM current_metrics WHERE id = 1').get()
  }

  getLastPosition(filepath) {
    // Track last read position per file
    const key = `pos:${filepath}`
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key)
    return row ? parseInt(row.value) : 0
  }

  saveLastPosition(filepath) {
    const position = fs.statSync(filepath).size
    const key = `pos:${filepath}`
    this.db.prepare(`
      INSERT INTO kv (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, position.toString())
  }
}

module.exports = MetricsCollector
```

### Component: Metrics API Server

**File:** `lib/metrics/api-server.js`

```javascript
const express = require('express')
const jwt = require('jsonwebtoken')

class MetricsAPIServer {
  constructor(metricsCollector, port, authToken) {
    this.collector = metricsCollector
    this.port = port
    this.authToken = authToken
    this.app = express()
  }

  start() {
    // Authentication middleware (for remote agents)
    const authenticate = (req, res, next) => {
      if (req.hostname === 'localhost' || req.hostname === '127.0.0.1') {
        // Local requests don't need auth
        return next()
      }

      const token = req.headers.authorization?.replace('Bearer ', '')
      if (!token || token !== this.authToken) {
        return res.status(403).json({ error: 'Forbidden' })
      }

      next()
    }

    // GET /metrics - Current aggregated metrics
    this.app.get('/metrics', authenticate, (req, res) => {
      try {
        const metrics = this.collector.getMetrics()
        res.json(metrics)
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // GET /metrics/tools - Tool usage details
    this.app.get('/metrics/tools', authenticate, (req, res) => {
      try {
        const tools = this.collector.db.prepare(`
          SELECT
            tool_name,
            COUNT(*) as invocations,
            AVG(duration_ms) as avg_duration,
            MIN(duration_ms) as min_duration,
            MAX(duration_ms) as max_duration,
            100.0 * COUNT(*) FILTER (WHERE status = 'error') / COUNT(*) as error_rate
          FROM tool_invocations
          GROUP BY tool_name
          ORDER BY invocations DESC
        `).all()

        res.json({ tools })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // GET /metrics/sessions - Per-session breakdown
    this.app.get('/metrics/sessions', authenticate, (req, res) => {
      try {
        const sessions = this.collector.db.prepare(`
          SELECT
            s.session_id,
            s.start_time,
            s.last_active,
            s.git_branch,
            COUNT(m.id) as messages,
            SUM(m.input_tokens + m.output_tokens) as tokens,
            SUM(m.cost) as cost
          FROM sessions s
          LEFT JOIN messages m ON s.session_id = m.session_id
          GROUP BY s.session_id
          ORDER BY s.last_active DESC
        `).all()

        res.json({ sessions })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    })

    // GET /health - Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        agentId: this.collector.agentId,
        timestamp: new Date().toISOString()
      })
    })

    // Start server
    this.app.listen(this.port, 'localhost', () => {
      console.log(`[MetricsAPI] Listening on http://localhost:${this.port}`)
    })
  }
}

module.exports = MetricsAPIServer
```

---

## Dashboard Aggregation

### Component: Metrics Fetcher

**File:** `lib/metrics/dashboard-aggregator.js`

```javascript
class DashboardMetricsAggregator {
  constructor() {
    this.agents = new Map()
    this.cache = new Map()
    this.pollInterval = 30000  // 30 seconds
  }

  registerAgent(agentId, endpoint, authToken = null) {
    this.agents.set(agentId, {
      id: agentId,
      endpoint: endpoint,
      authToken: authToken,
      lastFetch: null,
      lastMetrics: null,
      status: 'unknown'
    })

    console.log(`[Aggregator] Registered agent: ${agentId} at ${endpoint}`)
  }

  async fetchAgentMetrics(agentId) {
    const agent = this.agents.get(agentId)
    if (!agent) return null

    try {
      const headers = {}
      if (agent.authToken) {
        headers['Authorization'] = `Bearer ${agent.authToken}`
      }

      const response = await fetch(`${agent.endpoint}/metrics`, {
        headers,
        timeout: 5000
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const metrics = await response.json()

      agent.lastMetrics = metrics
      agent.lastFetch = new Date()
      agent.status = 'online'

      return metrics
    } catch (error) {
      console.error(`[Aggregator] Failed to fetch ${agentId}:`, error.message)
      agent.status = 'offline'
      return agent.lastMetrics  // Return cached metrics
    }
  }

  async getAllMetrics() {
    const agentIds = Array.from(this.agents.keys())
    const results = await Promise.allSettled(
      agentIds.map(id => this.fetchAgentMetrics(id))
    )

    const metricsArray = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value)

    // Aggregate across all agents
    const aggregated = {
      totalAgents: this.agents.size,
      onlineAgents: metricsArray.length,

      totalMessages: metricsArray.reduce((sum, m) => sum + (m.total_messages || 0), 0),
      totalTokens: metricsArray.reduce((sum, m) => sum + (m.total_tokens || 0), 0),
      totalCost: metricsArray.reduce((sum, m) => sum + (m.total_cost || 0), 0),
      totalSessions: metricsArray.reduce((sum, m) => sum + (m.total_sessions || 0), 0),

      // Tool aggregates
      tools: {
        bash: metricsArray.reduce((sum, m) => sum + (m.tool_bash || 0), 0),
        read: metricsArray.reduce((sum, m) => sum + (m.tool_read || 0), 0),
        write: metricsArray.reduce((sum, m) => sum + (m.tool_write || 0), 0),
        edit: metricsArray.reduce((sum, m) => sum + (m.tool_edit || 0), 0)
      },

      // Average metrics
      avgCacheHitRate: metricsArray.reduce((sum, m) => sum + (m.cache_hit_rate || 0), 0) / metricsArray.length,
      avgErrorRate: metricsArray.reduce((sum, m) => sum + (m.error_rate || 0), 0) / metricsArray.length,

      // Per-agent breakdown
      agents: Array.from(this.agents.entries()).map(([id, agent]) => ({
        id,
        endpoint: agent.endpoint,
        status: agent.status,
        lastFetch: agent.lastFetch,
        metrics: agent.lastMetrics
      })),

      lastUpdated: new Date().toISOString()
    }

    this.cache.set('all', aggregated)
    return aggregated
  }

  startPolling() {
    // Initial fetch
    this.getAllMetrics()

    // Poll every 30 seconds
    setInterval(() => {
      this.getAllMetrics()
    }, this.pollInterval)

    console.log(`[Aggregator] Started polling (every ${this.pollInterval/1000}s)`)
  }

  stopPolling() {
    clearInterval(this.pollInterval)
  }
}

module.exports = DashboardMetricsAggregator
```

### API Routes (Dashboard)

**File:** `app/api/metrics/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { aggregator } from '@/lib/metrics-aggregator'

export async function GET() {
  try {
    const metrics = await aggregator.getAllMetrics()
    return NextResponse.json(metrics)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}
```

**File:** `app/api/metrics/agents/[agentId]/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { aggregator } from '@/lib/metrics-aggregator'

export async function GET(
  request: Request,
  { params }: { params: { agentId: string } }
) {
  try {
    const metrics = await aggregator.fetchAgentMetrics(params.agentId)

    if (!metrics) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(metrics)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch agent metrics' },
      { status: 500 }
    )
  }
}
```

---

## Database Schema

### SQLite Schema (Agent-Side)

```sql
-- sessions: One row per Claude conversation
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  start_time TEXT,
  last_active TEXT,
  git_branch TEXT,
  working_directory TEXT,
  claude_version TEXT,
  total_messages INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0
);

-- messages: One row per assistant message
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_uuid TEXT UNIQUE,
  session_id TEXT,
  parent_uuid TEXT,
  timestamp TEXT,
  type TEXT,  -- 'user' or 'assistant'
  role TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  model TEXT,
  request_id TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

-- tool_invocations: One row per tool use
CREATE TABLE tool_invocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id TEXT UNIQUE,
  session_id TEXT,
  message_uuid TEXT,
  tool_name TEXT,
  timestamp TEXT,
  duration_ms INTEGER,
  status TEXT,  -- 'success' or 'error'
  input TEXT,   -- JSON
  output TEXT,  -- JSON
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

-- current_metrics: Pre-aggregated metrics (single row)
CREATE TABLE current_metrics (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  agent_id TEXT,
  total_sessions INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0,

  -- Tool counts
  tool_bash INTEGER DEFAULT 0,
  tool_read INTEGER DEFAULT 0,
  tool_write INTEGER DEFAULT 0,
  tool_edit INTEGER DEFAULT 0,
  tool_grep INTEGER DEFAULT 0,
  tool_glob INTEGER DEFAULT 0,
  tool_todowrite INTEGER DEFAULT 0,
  tool_webfetch INTEGER DEFAULT 0,
  tool_websearch INTEGER DEFAULT 0,
  tool_task INTEGER DEFAULT 0,

  -- Performance metrics
  avg_response_time_ms INTEGER DEFAULT 0,
  cache_hit_rate REAL DEFAULT 0,
  error_rate REAL DEFAULT 0,

  -- Timestamps
  first_message TEXT,
  last_message TEXT,
  last_updated TEXT
);

-- kv: Key-value store for file positions
CREATE TABLE kv (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Indexes
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_tools_session ON tool_invocations(session_id);
CREATE INDEX idx_tools_name ON tool_invocations(tool_name);
CREATE INDEX idx_tools_timestamp ON tool_invocations(timestamp);
```

---

## API Specification

### Agent API Endpoints

#### GET /metrics

Returns pre-aggregated metrics for the agent.

**Response:**
```json
{
  "agent_id": "23blocks-api-authentication",
  "total_sessions": 4,
  "total_messages": 2845,
  "total_tokens": 1234567,
  "total_cost": 3.47,

  "tool_bash": 924,
  "tool_read": 234,
  "tool_write": 57,
  "tool_edit": 280,
  "tool_grep": 52,
  "tool_glob": 19,
  "tool_todowrite": 173,
  "tool_webfetch": 25,
  "tool_websearch": 3,
  "tool_task": 5,

  "avg_response_time_ms": 1250,
  "cache_hit_rate": 94.5,
  "error_rate": 2.1,

  "first_message": "2025-10-10T10:00:00Z",
  "last_message": "2025-11-02T21:35:00Z",
  "last_updated": "2025-11-03T01:00:00Z"
}
```

#### GET /metrics/tools

Returns tool usage details.

**Response:**
```json
{
  "tools": [
    {
      "tool_name": "Bash",
      "invocations": 924,
      "avg_duration": 50.3,
      "min_duration": 5,
      "max_duration": 1200,
      "error_rate": 2.1
    },
    {
      "tool_name": "Read",
      "invocations": 234,
      "avg_duration": 20.5,
      "min_duration": 8,
      "max_duration": 150,
      "error_rate": 0.0
    }
  ]
}
```

#### GET /metrics/sessions

Returns per-session breakdown.

**Response:**
```json
{
  "sessions": [
    {
      "session_id": "1e8544aa-de65-4f54-8691-4d138836c981",
      "start_time": "2025-10-28T23:26:23Z",
      "last_active": "2025-11-02T21:35:00Z",
      "git_branch": "feature/metrics",
      "messages": 426,
      "tokens": 234567,
      "cost": 0.52
    }
  ]
}
```

#### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "agentId": "23blocks-api-authentication",
  "timestamp": "2025-11-03T01:00:00Z"
}
```

### Dashboard API Endpoints

#### GET /api/metrics

Returns aggregated metrics across all agents.

**Response:**
```json
{
  "totalAgents": 5,
  "onlineAgents": 4,
  "totalMessages": 12340,
  "totalTokens": 5678901,
  "totalCost": 15.67,
  "totalSessions": 23,

  "tools": {
    "bash": 3540,
    "read": 890,
    "write": 245,
    "edit": 1023
  },

  "avgCacheHitRate": 92.3,
  "avgErrorRate": 1.8,

  "agents": [
    {
      "id": "23blocks-api-auth",
      "endpoint": "http://localhost:3001/metrics",
      "status": "online",
      "lastFetch": "2025-11-03T01:00:00Z",
      "metrics": { ... }
    }
  ],

  "lastUpdated": "2025-11-03T01:00:00Z"
}
```

#### GET /api/metrics/agents/[agentId]

Returns metrics for specific agent.

---

## Implementation Phases

### Phase 1: Local Agents (Week 1) - 13 points

**Goal:** Basic metrics collection for local tmux sessions

**Tasks:**
1. Create MetricsCollector class (JSONL parser + SQLite)
2. Create MetricsAPIServer (Express + /metrics endpoint)
3. Test with one local agent
4. Verify SQLite database populated correctly

**Deliverable:** Single local agent exposing `/metrics` endpoint

### Phase 2: Dashboard Integration (Week 2) - 8 points

**Goal:** Dashboard fetches and displays metrics

**Tasks:**
1. Create DashboardMetricsAggregator class
2. Add `/api/metrics` route to dashboard
3. Update AgentProfile component to display real metrics
4. Test with multiple local agents

**Deliverable:** Dashboard showing real metrics from local agents

### Phase 3: Remote Agent Support (Week 3) - 8 points

**Goal:** Support cloud-deployed agents

**Tasks:**
1. Add JWT authentication to agent API
2. Test with one cloud agent (AWS)
3. Handle HTTPS endpoints
4. Add agent registration UI

**Deliverable:** Dashboard aggregating local + cloud agents

### Phase 4: Visualizations (Week 4) - 13 points

**Goal:** Charts and historical views

**Tasks:**
1. Add Chart.js for visualizations
2. Tool usage doughnut chart
3. Token usage line chart over time
4. Session history table
5. Export to CSV

**Deliverable:** Rich analytics dashboard

### Phase 5: Optional Cloud Sync (Future) - 8 points

**Goal:** Premium cloud backup feature

**Tasks:**
1. Opt-in cloud sync API
2. Upload SQLite to cloud storage
3. Team analytics dashboards
4. Pricing tier implementation

**Deliverable:** Premium cloud features for power users

**Total Story Points:** 50

---

## Cost Analysis

### Distributed SQLite (Our Approach)

**Infrastructure:**
- SQLite: $0 (embedded)
- Agent hosting: $5-10/agent/month (AWS/GCP/DO)
- Dashboard: $0 (self-hosted)

**Total: $0 for database, just agent hosting costs**

### Centralized PostgreSQL (Alternative)

**Infrastructure:**
- PostgreSQL (Supabase): $25/month
- Vercel hosting: $20/month
- Agent hosting: $5-10/agent/month

**Total: $45/month + agent hosting**

### Savings

**10 agents:**
- Distributed SQLite: $50-100/month (agents only)
- Centralized PostgreSQL: $95-145/month
- **Savings: $45/month (47% cheaper)**

**100 agents:**
- Distributed SQLite: $500-1000/month (agents only)
- Centralized PostgreSQL: $545-1045/month
- **Savings: $45/month (still significant)**

---

## Security Considerations

### Local Agents

**Binding:**
```javascript
// Bind to localhost only
app.listen(3001, 'localhost')
// NOT accessible from network
```

**No authentication needed** - OS-level user security sufficient

### Cloud Agents

**HTTPS Required:**
```javascript
// Force HTTPS
if (req.protocol !== 'https') {
  return res.redirect('https://' + req.hostname + req.url)
}
```

**JWT Authentication:**
```javascript
const jwt = require('jsonwebtoken')

app.get('/metrics', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')

  try {
    jwt.verify(token, process.env.JWT_SECRET)
    // Authorized
  } catch (error) {
    return res.status(403).json({ error: 'Forbidden' })
  }
})
```

**Rate Limiting:**
```javascript
const rateLimit = require('express-rate-limit')

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // 100 requests per window
})

app.use('/metrics', limiter)
```

---

## References

- [JSONL Conversation Structure](./JSONL-CONVERSATION-STRUCTURE.md)
- [Claude File Source](./benchmark/claude-file-source.md)
- [Consolidation Strategy](./benchmark/jsonl-consolidation-strategy.md)
- [Distributed SQLite Architecture](./benchmark/distributed-sqlite-architecture.md)
- [Why Database for Consolidation](./benchmark/why-database-for-consolidation.md)

---

## Appendix: Example Usage

### Setting Up an Agent

```bash
# Install dependencies
npm install better-sqlite3 chokidar express

# Start metrics collector
node lib/metrics/start-collector.js --agent-id=my-agent --port=3001

# Verify metrics endpoint
curl http://localhost:3001/metrics
```

### Registering Agent in Dashboard

```javascript
// In dashboard
const aggregator = new DashboardMetricsAggregator()

// Local agent
aggregator.registerAgent('my-agent', 'http://localhost:3001/metrics')

// Cloud agent (with auth)
aggregator.registerAgent(
  'cloud-agent',
  'https://agent.aws.com/metrics',
  'jwt-token-here'
)

// Start polling
aggregator.startPolling()
```

### Querying Metrics

```bash
# All agents (aggregated)
curl http://localhost:3000/api/metrics

# Specific agent
curl http://localhost:3000/api/metrics/agents/my-agent

# Tool usage
curl http://localhost:3001/metrics/tools

# Session history
curl http://localhost:3001/metrics/sessions
```
