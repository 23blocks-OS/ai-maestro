# Metrics Collection Architecture: Local vs Remote Agents

**Date**: November 2, 2025
**Status**: Design Phase - Pre-Implementation Analysis
**Branch**: feature/distributed-agents

---

## The Core Challenge

**Question**: How do we track metrics (messages, tokens, response times, etc.) for agents that can be:
1. **Local tmux sessions** (direct PTY access via node-pty)
2. **Local containers** (WebSocket to localhost:46000)
3. **Cloud containers** (WebSocket to agent1.23blocks.net)

**Problem**: Our current metrics plan assumes we can parse terminal output from PTY, but remote agents only send us WebSocket data. We don't have direct access to their PTY or file system.

---

## Current Architecture Review

### Local tmux Sessions (Current Working Model)

```
User's Machine
├── AI Maestro Dashboard (localhost:23000)
│   ├── server.mjs (WebSocket server)
│   └── node-pty (direct PTY access)
│
└── tmux session
    └── Claude Code running

Flow:
1. PTY creates process: tmux attach-session -t "session-name"
2. PTY emits 'data' events with terminal output
3. server.mjs receives raw terminal data
4. server.mjs broadcasts to WebSocket clients
5. Dashboard displays in xterm.js

Metrics Collection Points:
✅ PTY 'data' handler - Parse terminal output
✅ Direct access to tmux capture-pane
✅ Can run commands in session (tmux send-keys)
✅ File system access (~/.aimaestro/)
```

### Remote Agents (Current + Planned)

```
User's Machine                      Remote Machine (Cloud/Container)
├── AI Maestro Dashboard           ├── Claude Code Agent Container
│   └── WebSocket client           │   ├── server.mjs (WebSocket server)
│                                  │   ├── node-pty
│                                  │   └── tmux session
│                                  │       └── Claude Code
│                                  │
└── WebSocket connection ──────────┘
    (wss://agent1.23blocks.net/term)

Flow:
1. Remote PTY creates tmux session
2. Remote server.mjs emits to WebSocket
3. Dashboard WebSocket client receives data
4. Dashboard displays in xterm.js

Metrics Collection Points:
❌ No direct PTY access
❌ No direct tmux access
❌ No file system access
✅ WebSocket data stream (terminal output)
❓ Need API for metrics retrieval
```

---

## Three Possible Architectures

### Architecture 1: Distributed Parsing (Dashboard Parses All)

**Concept**: Dashboard parses terminal output from WebSocket, whether local or remote

```
┌─────────────────────────────────────────────────────────┐
│  Agent (Local or Remote)                                │
│  └─ Terminal output → WebSocket                         │
└────────────────────┬────────────────────────────────────┘
                     │ Raw terminal data
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Dashboard (Centralized)                                │
│  ├─ WebSocket receiver                                  │
│  ├─ TerminalParser (parses output)                      │
│  ├─ SessionAnalytics (tracks metrics)                   │
│  └─ MetricsStorage (~/.aimaestro/metrics/)              │
└─────────────────────────────────────────────────────────┘
```

**Pros**:
- ✅ Single source of truth (dashboard)
- ✅ Works for both local and remote
- ✅ No changes needed to remote agents
- ✅ Centralized storage

**Cons**:
- ❌ Must parse terminal output (unreliable)
- ❌ Dependent on Claude's output format
- ❌ Token counts might not be in output
- ❌ Can't track metrics when dashboard is offline
- ❌ High CPU usage (parsing all terminal output)

**Implementation**:
```typescript
// In dashboard WebSocket handler
ws.on('message', (data) => {
  const message = JSON.parse(data)

  if (message.type === 'output') {
    // Display in terminal
    terminal.write(message.data)

    // Parse for metrics
    const parsed = terminalParser.parse(message.data)
    if (parsed.type === 'claude_message') {
      analytics.incrementMessage(sessionId, 'assistant')
    }
    if (parsed.type === 'token_report') {
      analytics.addTokens(sessionId, parsed.input, parsed.output)
    }
  }
})
```

**Reliability Issues**:
- Claude output format may change
- Token reports not always printed
- Difficult to detect message boundaries
- Can't distinguish between user/assistant without heuristics

---

### Architecture 2: Agent-Side Collection + API (Recommended)

**Concept**: Each agent tracks its own metrics, dashboard fetches via API

```
┌─────────────────────────────────────────────────────────┐
│  Agent (Local or Remote)                                │
│  ├─ Terminal output → WebSocket (for display)           │
│  ├─ Claude Code Hooks (accurate tracking)               │
│  ├─ MetricsCollector (tracks locally)                   │
│  └─ /metrics API endpoint                               │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ WebSocket: Terminal data
                     │ HTTP: Metrics data
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Dashboard (Aggregation)                                │
│  ├─ WebSocket client (terminal display)                 │
│  ├─ Metrics fetcher (polls /metrics)                    │
│  ├─ Metrics aggregator                                  │
│  └─ Metrics display (AgentProfile)                      │
└─────────────────────────────────────────────────────────┘
```

**Pros**:
- ✅ Accurate metrics (hooks into Claude Code)
- ✅ Works offline (agent tracks independently)
- ✅ Low dashboard CPU (no parsing)
- ✅ Extensible (agent can track more later)
- ✅ Works for local and remote identically

**Cons**:
- ❌ Requires changes to agent containers
- ❌ Need to deploy new container images
- ❌ More complex setup

**Implementation**:

#### On Agent Side (server.mjs in container)

```javascript
// server.mjs (in agent container)
import express from 'express'
import { MetricsCollector } from './metrics-collector.js'

const app = express()
const metrics = new MetricsCollector()

// Hook into PTY data
pty.on('data', (data) => {
  // Send to WebSocket clients (existing)
  wss.clients.forEach(client => {
    client.send(JSON.stringify({ type: 'output', data }))
  })

  // Track metrics
  metrics.processTerminalOutput(data)
})

// Metrics API endpoint
app.get('/metrics', (req, res) => {
  res.json({
    messageCount: metrics.getTotalMessages(),
    tokenUsage: metrics.getTokenUsage(),
    uptimeSeconds: metrics.getUptimeSeconds(),
    toolInvocations: metrics.getToolInvocations(),
    errors: metrics.getErrors(),
    lastUpdated: new Date().toISOString()
  })
})

// Health check (already exists)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    agentId: 'agent-1',
    uptime: process.uptime()
  })
})
```

#### Metrics Collector (in agent)

```javascript
// metrics-collector.js
export class MetricsCollector {
  constructor() {
    this.messageCount = 0
    this.userMessages = 0
    this.assistantMessages = 0
    this.tokenUsage = { input: 0, output: 0, total: 0 }
    this.toolInvocations = []
    this.errors = []
    this.startTime = Date.now()
  }

  processTerminalOutput(data) {
    // Detect Claude messages
    if (this.isClaudeMessage(data)) {
      this.messageCount++
      this.assistantMessages++
    }

    // Detect token reports
    const tokens = this.parseTokens(data)
    if (tokens) {
      this.tokenUsage.input += tokens.input
      this.tokenUsage.output += tokens.output
      this.tokenUsage.total += tokens.input + tokens.output
    }

    // Detect tool usage
    const tool = this.parseTool(data)
    if (tool) {
      this.toolInvocations.push({
        name: tool.name,
        timestamp: new Date().toISOString()
      })
    }

    // Detect errors
    if (this.isError(data)) {
      this.errors.push({
        message: data,
        timestamp: new Date().toISOString()
      })
    }
  }

  getTotalMessages() { return this.messageCount }
  getTokenUsage() { return this.tokenUsage }
  getUptimeSeconds() { return Math.floor((Date.now() - this.startTime) / 1000) }
  getToolInvocations() { return this.toolInvocations.length }
  getErrors() { return this.errors.length }
}
```

#### On Dashboard Side

```typescript
// lib/metrics-fetcher.ts
export class MetricsFetcher {
  async fetchAgentMetrics(agent: Agent): Promise<AgentMetrics> {
    // Determine endpoint based on deployment type
    const endpoint = this.getMetricsEndpoint(agent)

    try {
      const response = await fetch(endpoint, { timeout: 5000 })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      return {
        totalMessages: data.messageCount,
        totalTokensUsed: data.tokenUsage.total,
        uptimeHours: data.uptimeSeconds / 3600,
        totalApiCalls: data.messageCount, // Approximate
        estimatedCost: this.calculateCost(data.tokenUsage, agent.model),
        // ... more metrics
      }
    } catch (error) {
      console.error(`Failed to fetch metrics for ${agent.id}:`, error)
      return this.getDefaultMetrics()
    }
  }

  private getMetricsEndpoint(agent: Agent): string {
    if (agent.deployment.type === 'cloud' && agent.deployment.cloud) {
      // Cloud agent: Use public endpoint
      const domain = agent.deployment.cloud.domain
      return `https://${domain}/metrics`
    } else {
      // Local: Use localhost or container endpoint
      return 'http://localhost:46000/metrics'
    }
  }
}

// Hook to refresh metrics periodically
export function useAgentMetrics(agentId: string) {
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null)

  useEffect(() => {
    const fetchMetrics = async () => {
      const agent = await getAgent(agentId)
      const data = await metricsFetcher.fetchAgentMetrics(agent)
      setMetrics(data)
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000) // Every 30s

    return () => clearInterval(interval)
  }, [agentId])

  return metrics
}
```

---

### Architecture 3: Hybrid (Best of Both)

**Concept**: Agent-side collection for accurate data + Dashboard parsing for real-time updates

```
┌─────────────────────────────────────────────────────────┐
│  Agent                                                  │
│  ├─ MetricsCollector (accurate, persisted)              │
│  ├─ /metrics API (primary source)                       │
│  └─ WebSocket (terminal + metrics events)               │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ WebSocket: data + metric_update events
                     │ HTTP: Full metrics on demand
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Dashboard                                              │
│  ├─ WebSocket: Instant updates (real-time)              │
│  ├─ HTTP poll: Periodic sync (every 30s)                │
│  └─ Local cache: Blend both sources                     │
└─────────────────────────────────────────────────────────┘
```

**WebSocket Message Format**:
```json
// Terminal output (existing)
{ "type": "output", "data": "..." }

// Metrics update (new)
{
  "type": "metric_update",
  "metric": "message_count",
  "value": 42,
  "timestamp": "2025-11-02T10:30:00Z"
}

// Token update (new)
{
  "type": "token_update",
  "input": 1234,
  "output": 567,
  "timestamp": "2025-11-02T10:30:00Z"
}
```

**Pros**:
- ✅ Real-time updates via WebSocket
- ✅ Accurate data from agent-side hooks
- ✅ Fallback to HTTP polling if WebSocket drops
- ✅ Low latency for dashboard updates

**Cons**:
- ❌ More complex protocol
- ❌ Need to handle message ordering
- ❌ Requires agent container updates

---

## Comparison Matrix

| Feature | Arch 1: Dashboard Parsing | Arch 2: Agent API | Arch 3: Hybrid |
|---------|-------------------------|------------------|----------------|
| **Accuracy** | ⚠️ Heuristic-based | ✅ Hook-based | ✅ Hook-based |
| **Real-time** | ✅ Instant | ⚠️ Poll delay (30s) | ✅ Instant |
| **Reliability** | ❌ Format-dependent | ✅ Stable API | ✅ Dual source |
| **Agent Changes** | ✅ None needed | ❌ Deploy new image | ❌ Deploy new image |
| **Dashboard CPU** | ❌ High (parsing) | ✅ Low (fetch) | ✅ Low (events) |
| **Offline Tracking** | ❌ No | ✅ Yes | ✅ Yes |
| **Complexity** | 🟢 Low | 🟡 Medium | 🔴 High |
| **Local Support** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Remote Support** | ✅ Yes | ✅ Yes | ✅ Yes |

---

## Recommended Approach: Architecture 2 (Agent API)

### Why Architecture 2?

1. **Accuracy First**: Parsing terminal output is unreliable. We need hook-based tracking.
2. **Scalability**: Works identically for local and remote agents.
3. **Agent Independence**: Agents track metrics even when dashboard is offline.
4. **Maintainability**: Clean separation of concerns - agents track, dashboard displays.
5. **Extensibility**: Easy to add new metrics without changing dashboard.

### Why Not Architecture 3 (Hybrid)?

While hybrid offers the best UX (real-time + accuracy), the complexity isn't justified at this stage:
- 30-second poll delay is acceptable for metrics (not critical path)
- Real-time terminal display already works
- Metrics don't need instant updates (not life-or-death data)
- Can upgrade to hybrid later if needed

### Why Not Architecture 1 (Parsing)?

- Too fragile (format changes break tracking)
- Not accurate (heuristics fail)
- Can't track when dashboard is offline
- High CPU overhead

---

## Implementation Roadmap

### Phase 1: Agent-Side Metrics Collection (1 week)

#### 1.1 Create MetricsCollector Class

```javascript
// In agent container: lib/metrics-collector.js
export class MetricsCollector {
  // Track all metrics locally
  // Parse terminal output for Claude messages, tokens, tools
  // Store in memory (phase 1)
}
```

#### 1.2 Add Metrics API Endpoint

```javascript
// In agent container: server.mjs
app.get('/metrics', (req, res) => {
  res.json(metrics.toJSON())
})
```

#### 1.3 Update Docker Image

```dockerfile
# infrastructure/docker/claude-agent/Dockerfile
# Copy new metrics files
COPY lib/metrics-collector.js /app/lib/
```

#### 1.4 Deploy to Test Environment

```bash
# Build and push new image
cd infrastructure/docker/claude-agent
docker build -t claude-agent:0.2.0 .
docker tag claude-agent:0.2.0 <ecr-repo>/claude-agent:0.2.0
docker push <ecr-repo>/claude-agent:0.2.0

# Update Terraform to use new image
terraform apply
```

---

### Phase 2: Dashboard Metrics Fetcher (3 days)

#### 2.1 Create MetricsFetcher

```typescript
// lib/metrics-fetcher.ts
export class MetricsFetcher {
  async fetchAgentMetrics(agent: Agent): Promise<AgentMetrics>
}
```

#### 2.2 Add useAgentMetrics Hook

```typescript
// hooks/useAgentMetrics.ts
export function useAgentMetrics(agentId: string) {
  // Fetch metrics every 30 seconds
  // Return metrics with loading/error states
}
```

#### 2.3 Update AgentProfile Component

```typescript
// components/AgentProfile.tsx
const metrics = useAgentMetrics(agent.id)

// Display real metrics instead of placeholders
<MetricCard
  icon={<MessageSquare />}
  value={metrics?.totalMessages || 0}
  label="Messages"
/>
```

---

### Phase 3: Local Agent Support (2 days)

#### 3.1 Run MetricsCollector Locally

```javascript
// server.mjs (local dashboard)
// Import MetricsCollector
// Track metrics for local tmux sessions
// Expose same /metrics API for local agents
```

#### 3.2 Unified Fetcher Logic

```typescript
// MetricsFetcher works for both local and remote
// Auto-detects agent type and uses correct endpoint
```

---

### Phase 4: Persistence (3 days)

#### 4.1 Add SQLite Storage (Agent Side)

```javascript
// lib/metrics-storage.js
export class MetricsStorage {
  // Store metrics in SQLite
  // Persist across container restarts
  // Provide historical data
}
```

#### 4.2 Metrics History API

```javascript
app.get('/metrics/history', (req, res) => {
  // Return time-series data for charts
  // Support date range queries
})
```

---

### Phase 5: Visualizations (1 week)

#### 5.1 Add Chart.js

```bash
yarn add chart.js react-chartjs-2
```

#### 5.2 Timeline Chart

```typescript
// components/SessionTimeline.tsx
// Show messages/tokens over time
```

#### 5.3 Tool Usage Chart

```typescript
// components/ToolUsageChart.tsx
// Pie chart of tool invocations
```

---

## Claude Code Hooks Strategy

### Using Claude Code's Native Hooks

Instead of parsing terminal output, we can use Claude Code's hook system to get accurate metrics:

**Available Hooks** (from .claude/hooks/):
- `user-prompt-submit` - Runs when user submits a prompt
- `tool-call-before` - Runs before a tool is called
- `tool-call-after` - Runs after a tool completes
- `task-complete` - Runs when a task finishes

**Example Hook for Metrics**:

```bash
# .claude/hooks/user-prompt-submit.sh
#!/bin/bash
# Track user message
curl -X POST http://localhost:46000/metrics/event \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"user_message\", \"timestamp\": \"$(date -Iseconds)\"}"
```

```bash
# .claude/hooks/tool-call-after.sh
#!/bin/bash
# Track tool invocation
TOOL_NAME="$1"
DURATION="$2"
SUCCESS="$3"

curl -X POST http://localhost:46000/metrics/event \
  -H "Content-Type: application/json" \
  -d "{\"type\": \"tool_call\", \"tool\": \"$TOOL_NAME\", \"duration\": $DURATION, \"success\": $SUCCESS}"
```

**Benefits**:
- ✅ Accurate (native hook system)
- ✅ No parsing needed
- ✅ Low overhead
- ✅ Official API

**Challenges**:
- Token counts not exposed in hooks
- Need to combine hooks + parsing for complete picture

---

## Cost Calculation Strategy

### Token Tracking Sources

| Source | Reliability | Availability |
|--------|-------------|--------------|
| **Claude Code output** | ⚠️ Only if printed | Sometimes shown |
| **Hook system** | ❌ Not exposed | N/A |
| **API response** | ✅ Reliable | Only if we proxy |
| **Estimation** | ⚠️ Approximate | Always available |

### Recommended: Estimation + Opportunistic Tracking

```typescript
export class CostCalculator {
  estimateTokens(messageText: string): { input: number, output: number } {
    // Rough estimation: 1 token ≈ 4 characters
    const inputTokens = Math.ceil(messageText.length / 4)
    const outputTokens = Math.ceil(messageText.length / 4) * 1.5 // Claude usually responds longer

    return { input: inputTokens, output: outputTokens }
  }

  parseActualTokens(terminalOutput: string): { input: number, output: number } | null {
    // Try to parse: "Tokens: 1234 input, 567 output"
    const match = terminalOutput.match(/Tokens:\s*(\d+)\s*input,\s*(\d+)\s*output/)
    if (match) {
      return {
        input: parseInt(match[1]),
        output: parseInt(match[2])
      }
    }
    return null
  }

  track(sessionId: string, terminalOutput: string, messageText: string) {
    // Try actual tokens first
    const actual = this.parseActualTokens(terminalOutput)
    if (actual) {
      metrics.addTokens(sessionId, actual.input, actual.output)
      metrics.setTokenSource(sessionId, 'actual')
    } else {
      // Fallback to estimation
      const estimated = this.estimateTokens(messageText)
      metrics.addTokens(sessionId, estimated.input, estimated.output)
      metrics.setTokenSource(sessionId, 'estimated')
    }
  }

  calculateCost(tokenUsage: TokenUsage, model: string): number {
    // Use pricing table from metrics-comparison-analysis.md
  }
}
```

---

## Testing Strategy

### Agent-Side Tests

```javascript
// __tests__/metrics-collector.test.js
describe('MetricsCollector', () => {
  it('should increment message count', () => {
    collector.processTerminalOutput('🤖 Claude: Hello!')
    expect(collector.getTotalMessages()).toBe(1)
  })

  it('should parse token counts', () => {
    collector.processTerminalOutput('Tokens: 100 input, 200 output')
    expect(collector.getTokenUsage()).toEqual({
      input: 100,
      output: 200,
      total: 300
    })
  })
})
```

### Dashboard Tests

```typescript
// __tests__/metrics-fetcher.test.ts
describe('MetricsFetcher', () => {
  it('should fetch metrics from cloud agent', async () => {
    const agent = createCloudAgent()
    const metrics = await fetcher.fetchAgentMetrics(agent)

    expect(metrics.totalMessages).toBeGreaterThan(0)
    expect(metrics.totalTokensUsed).toBeGreaterThan(0)
  })

  it('should handle offline agents', async () => {
    const agent = createOfflineAgent()
    const metrics = await fetcher.fetchAgentMetrics(agent)

    expect(metrics).toEqual(defaultMetrics)
  })
})
```

### Integration Tests

```typescript
// __tests__/metrics-e2e.test.ts
describe('Metrics E2E', () => {
  it('should track metrics end-to-end', async () => {
    // 1. Start agent container
    // 2. Send messages via WebSocket
    // 3. Fetch metrics via API
    // 4. Verify counts match
  })
})
```

---

## Migration Path for Existing Agents

### Step 1: Deploy New Agent Images
```bash
# Build image with metrics support
docker build -t claude-agent:0.2.0 .

# Push to ECR
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin <ecr-repo>
docker push <ecr-repo>/claude-agent:0.2.0

# Update Terraform
terraform apply
```

### Step 2: Verify Metrics Endpoint
```bash
# Test health + metrics
curl https://agent1.23blocks.net/health
curl https://agent1.23blocks.net/metrics
```

### Step 3: Update Dashboard
```bash
# Deploy dashboard with metrics fetcher
yarn build
pm2 restart ai-maestro
```

### Step 4: Gradual Rollout
- New agents get metrics automatically
- Old agents show default values (0)
- No breaking changes

---

## Summary & Decision

### ✅ **Recommended: Architecture 2 - Agent API**

**Why**:
1. Accurate metrics via agent-side tracking
2. Works for local and remote agents identically
3. Agents track independently (offline support)
4. Clean architecture (separation of concerns)
5. Extensible for future metrics

**Trade-offs**:
- Requires agent container updates
- 30-second poll delay (acceptable)
- More initial setup work

**Next Steps**:
1. Create MetricsCollector in agent container
2. Add /metrics API endpoint
3. Build and deploy new Docker image
4. Create MetricsFetcher in dashboard
5. Update AgentProfile to use real metrics

**Timeline**: ~2 weeks for full implementation

---

## Open Questions

1. **Token Tracking**: Should we proxy Anthropic API to get accurate tokens, or rely on estimation + parsing?
   - **Answer**: Start with estimation + parsing (Phase 1), add API proxy later (Phase 2+)

2. **Persistence**: SQLite in agent container, or send metrics to dashboard for central storage?
   - **Answer**: Agent-side SQLite (Phase 4), optional dashboard aggregation later

3. **Historical Data**: How long should agents keep metrics history?
   - **Answer**: 30 days rolling window, configurable

4. **Metrics Granularity**: Per-session or per-agent?
   - **Answer**: Per-agent (aggregate all sessions)

---

**Last Updated**: November 2, 2025
**Status**: Ready for implementation review
**Next**: Review with team, then proceed with Phase 1
