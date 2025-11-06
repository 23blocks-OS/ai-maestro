# Tool Usage Tracking - Deep Dive

**Date**: November 2, 2025
**Context**: Understanding how to track Claude Code tool invocations for analytics
**Reference**: Based on claude-code-templates analysis + Claude Code JSONL format

---

## Executive Summary

**The Question**: How do we know which tools Claude is using during a session?

**The Answer**: Claude Code saves every conversation to JSONL files (`~/.claude/projects/*/...jsonl`). Each tool invocation appears as a structured message with `tool_use` blocks containing tool name, ID, and parameters.

**Our Challenge**: We stream terminal output via WebSocket. We don't have direct access to JSONL files for remote agents.

**Our Solution**: Parse terminal output for tool patterns + Use agent-side JSONL parsing + Expose via `/metrics` API

---

## How Claude Code Records Tool Usage

### JSONL Message Format

Every interaction is recorded as a newline-delimited JSON object:

```json
{
  "parentUuid": "previous-message-uuid",
  "isSidechain": false,
  "userType": "external",
  "cwd": "/Users/juanpelaez/23blocks/webApps/agents-web",
  "sessionId": "1e8544aa-de65-4f54-8691-4d138836c981",
  "version": "2.0.28",
  "gitBranch": "feature/distributed-agents",
  "message": {
    "model": "claude-sonnet-4-5-20250929",
    "id": "msg_01B2EwDuae6XL6zamo2fwgcc",
    "type": "message",
    "role": "assistant",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_017zNo5mvbBGH9e3muGcpdvz",
        "name": "Glob",
        "input": {"pattern": "components/**/*.tsx"}
      }
    ],
    "stop_reason": null,
    "stop_sequence": null,
    "usage": {
      "input_tokens": 1,
      "cache_creation_input_tokens": 406,
      "cache_read_input_tokens": 88936,
      "cache_creation": {
        "ephemeral_5m_input_tokens": 406,
        "ephemeral_1h_input_tokens": 0
      },
      "output_tokens": 55,
      "service_tier": "standard"
    }
  },
  "requestId": "req_011CUk81tnA49XXyc3zxcqVi",
  "type": "assistant",
  "uuid": "63a1394a-e02a-4c71-b5a2-33b5b10e9672",
  "timestamp": "2025-11-03T01:53:57.236Z"
}
```

### Tool Use Message Structure

**Key Fields**:

1. **`message.content[]`** - Array of content blocks
   - Type: `"tool_use"` (indicates tool invocation)
   - Name: Tool name (`"Read"`, `"Write"`, `"Bash"`, `"Glob"`, `"Grep"`, etc.)
   - ID: Unique tool invocation ID (`"toolu_..."`)
   - Input: Tool parameters (object)

2. **`message.usage`** - Token usage for this message
   - `input_tokens` - Tokens in request
   - `output_tokens` - Tokens in response
   - `cache_read_input_tokens` - Tokens from cache

3. **`timestamp`** - ISO timestamp of invocation

4. **`uuid`** - Message UUID (for linking tool_use → tool_result)

### Tool Result Message Structure

Following every tool_use, there's a tool_result:

```json
{
  "parentUuid": "63a1394a-e02a-4c71-b5a2-33b5b10e9672",  // Links to tool_use
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "tool_use_id": "toolu_017zNo5mvbBGH9e3muGcpdvz",  // Links back
        "type": "tool_result",
        "content": "/Users/.../AgentProfile.tsx\n/Users/.../Header.tsx\n..."
      }
    ]
  },
  "uuid": "3ed66b35-8a36-473c-86ef-cef19997206f",
  "timestamp": "2025-11-03T01:53:57.354Z",
  "toolUseResult": {
    "filenames": ["..."],
    "durationMs": 19,  // ✅ Execution time!
    "numFiles": 8,
    "truncated": false
  }
}
```

**Key Fields**:

1. **`toolUseResult`** - Execution metadata
   - `durationMs` - How long the tool took
   - Success/failure implied by content (error string vs data)

2. **`tool_use_id`** - Links result back to invocation

---

## Tool Detection Strategies

### Strategy 1: Parse JSONL Files (claude-code-templates approach)

**How it works**:
```javascript
// Read conversation JSONL file
const lines = fs.readFileSync('conversation.jsonl', 'utf8').split('\n')

const tools = []
for (const line of lines) {
  if (!line.trim()) continue
  const msg = JSON.parse(line)

  // Detect tool_use
  if (msg.message?.content) {
    const contentArray = Array.isArray(msg.message.content)
      ? msg.message.content
      : [{ type: 'text', text: msg.message.content }]

    for (const block of contentArray) {
      if (block.type === 'tool_use') {
        tools.push({
          name: block.name,
          id: block.id,
          input: block.input,
          timestamp: msg.timestamp,
          uuid: msg.uuid
        })
      }
    }
  }

  // Detect tool_result (for duration)
  if (msg.toolUseResult && msg.message?.content?.[0]?.tool_use_id) {
    const toolUseId = msg.message.content[0].tool_use_id
    const tool = tools.find(t => t.id === toolUseId)
    if (tool) {
      tool.durationMs = msg.toolUseResult.durationMs
      tool.success = !msg.message.content[0].content.includes('error')
    }
  }
}

console.log(`Total tools used: ${tools.length}`)
console.log(`By type:`, countByName(tools))
console.log(`Avg duration:`, avgDuration(tools))
```

**Pros**:
- ✅ Accurate (structured data)
- ✅ Complete history
- ✅ Duration included
- ✅ Input/output captured

**Cons**:
- ❌ Requires file system access
- ❌ Doesn't work for remote agents
- ❌ Only works on dashboard machine

---

### Strategy 2: Parse Terminal Output (our current approach)

**How it works**:
```javascript
// In PTY 'data' handler
pty.on('data', (data) => {
  // Look for tool patterns in terminal output
  // Claude doesn't always print tool usage clearly!

  // Example patterns to detect:
  // "📝 Writing to file: ..."
  // "🔍 Searching for: ..."
  // "⚡ Running command: ..."
  // "📖 Reading file: ..."

  const toolPatterns = [
    { pattern: /Writing to.*?:/, tool: 'Write' },
    { pattern: /Reading file.*?:/, tool: 'Read' },
    { pattern: /Running command.*?:/, tool: 'Bash' },
    { pattern: /Searching for.*?:/, tool: 'Grep' },
    { pattern: /Finding files.*?:/, tool: 'Glob' }
  ]

  for (const { pattern, tool } of toolPatterns) {
    if (pattern.test(data)) {
      metrics.trackTool(tool, Date.now())
    }
  }
})
```

**Pros**:
- ✅ Works for local agents
- ✅ Works for remote agents (via WebSocket)
- ✅ Real-time tracking

**Cons**:
- ❌ Unreliable (heuristic-based)
- ❌ Claude doesn't always print tool names
- ❌ Can't get duration or input/output
- ❌ False positives possible

---

### Strategy 3: Agent-Side JSONL Parsing (RECOMMENDED)

**How it works**:

Each agent (local or remote) runs a watcher that monitors its JSONL files:

```javascript
// In agent container or local dashboard
import chokidar from 'chokidar'
import fs from 'fs'
import path from 'path'

class ToolUsageTracker {
  constructor(projectDir) {
    this.projectDir = projectDir  // ~/.claude/projects/<project>/
    this.tools = new Map()  // tool_use_id -> ToolInvocation

    this.startWatching()
  }

  startWatching() {
    const watcher = chokidar.watch(`${this.projectDir}/*.jsonl`, {
      persistent: true,
      ignoreInitial: false
    })

    watcher.on('change', (filepath) => {
      this.parseNewLines(filepath)
    })
  }

  async parseNewLines(filepath) {
    const content = fs.readFileSync(filepath, 'utf8')
    const lines = content.split('\n')

    // Parse only new lines (track last position)
    const newLines = lines.slice(this.lastLineCount[filepath] || 0)
    this.lastLineCount[filepath] = lines.length

    for (const line of newLines) {
      if (!line.trim()) continue

      try {
        const msg = JSON.parse(line)
        this.processMessage(msg)
      } catch (err) {
        console.error('Failed to parse JSONL line:', err)
      }
    }
  }

  processMessage(msg) {
    // Detect tool_use
    if (msg.message?.content) {
      const blocks = Array.isArray(msg.message.content)
        ? msg.message.content
        : [msg.message.content]

      for (const block of blocks) {
        if (block.type === 'tool_use') {
          this.tools.set(block.id, {
            name: block.name,
            id: block.id,
            input: block.input,
            timestamp: msg.timestamp,
            uuid: msg.uuid,
            status: 'pending'
          })
        }
      }
    }

    // Detect tool_result
    if (msg.toolUseResult && msg.message?.content?.[0]?.tool_use_id) {
      const toolUseId = msg.message.content[0].tool_use_id
      const tool = this.tools.get(toolUseId)

      if (tool) {
        tool.durationMs = msg.toolUseResult.durationMs
        tool.status = this.detectStatus(msg)
        tool.completedAt = msg.timestamp
      }
    }
  }

  detectStatus(resultMsg) {
    const content = resultMsg.message.content[0].content
    if (typeof content === 'string') {
      // Check for error indicators
      if (content.includes('Error:') || content.includes('Failed')) {
        return 'error'
      }
      if (content.includes('Permission denied')) {
        return 'permission_error'
      }
    }
    return 'success'
  }

  getMetrics() {
    const tools = Array.from(this.tools.values())

    return {
      totalInvocations: tools.length,
      byTool: this.groupByTool(tools),
      avgDuration: this.calculateAvgDuration(tools),
      successRate: this.calculateSuccessRate(tools),
      recentTools: tools.slice(-10)  // Last 10 tools
    }
  }

  groupByTool(tools) {
    const counts = {}
    for (const tool of tools) {
      counts[tool.name] = (counts[tool.name] || 0) + 1
    }
    return counts
  }

  calculateAvgDuration(tools) {
    const durations = tools
      .filter(t => t.durationMs !== undefined)
      .map(t => t.durationMs)

    if (durations.length === 0) return 0
    return durations.reduce((a, b) => a + b, 0) / durations.length
  }

  calculateSuccessRate(tools) {
    const completed = tools.filter(t => t.status !== 'pending')
    if (completed.length === 0) return 1.0

    const successful = completed.filter(t => t.status === 'success').length
    return successful / completed.length
  }
}
```

**Expose via API**:

```javascript
// In agent's server.mjs
const toolTracker = new ToolUsageTracker('~/.claude/projects/my-project')

app.get('/metrics/tools', (req, res) => {
  res.json(toolTracker.getMetrics())
})

// Returns:
// {
//   totalInvocations: 245,
//   byTool: {
//     "Read": 89,
//     "Write": 34,
//     "Bash": 56,
//     "Grep": 28,
//     "Glob": 38
//   },
//   avgDuration: 145,  // ms
//   successRate: 0.96,
//   recentTools: [
//     { name: "Read", timestamp: "...", durationMs: 12 },
//     ...
//   ]
// }
```

**Pros**:
- ✅ Accurate (structured data from JSONL)
- ✅ Works for local and remote agents
- ✅ Real-time updates (file watching)
- ✅ Complete metrics (duration, success rate)
- ✅ No parsing terminal output needed

**Cons**:
- ❌ Requires file system access on agent
- ❌ Need to deploy to all agents
- ❌ Slightly delayed (file write delay)

---

## Comparison Matrix

| Metric | JSONL Parsing | Terminal Parsing | Agent-Side JSONL |
|--------|--------------|------------------|------------------|
| **Accuracy** | ✅ 100% | ⚠️ ~60% | ✅ 100% |
| **Remote Support** | ❌ No | ✅ Yes | ✅ Yes |
| **Duration** | ✅ Yes | ❌ No | ✅ Yes |
| **Success Rate** | ✅ Yes | ❌ No | ✅ Yes |
| **Input/Output** | ✅ Yes | ❌ No | ✅ Yes |
| **Real-time** | ⚠️ File delay | ✅ Instant | ⚠️ File delay |
| **Deployment** | Dashboard only | Dashboard only | All agents |
| **Complexity** | 🟢 Low | 🟢 Low | 🟡 Medium |

---

## Tool Types in Claude Code

### Built-in Tools

1. **Read** - Read file contents
   - Input: `{ file_path: string, limit?: number, offset?: number }`
   - Output: File contents with line numbers

2. **Write** - Create/overwrite files
   - Input: `{ file_path: string, content: string }`
   - Output: Confirmation message

3. **Edit** - String replacement in files
   - Input: `{ file_path: string, old_string: string, new_string: string }`
   - Output: Edited snippet

4. **Bash** - Execute shell commands
   - Input: `{ command: string, timeout?: number }`
   - Output: stdout/stderr

5. **Glob** - Find files by pattern
   - Input: `{ pattern: string, path?: string }`
   - Output: List of matching files

6. **Grep** - Search file contents
   - Input: `{ pattern: string, path?: string, glob?: string }`
   - Output: Matching lines

7. **Task** - Launch sub-agents
   - Input: `{ subagent_type: string, prompt: string }`
   - Output: Agent result

8. **WebSearch** - Search the web
   - Input: `{ query: string }`
   - Output: Search results

9. **WebFetch** - Fetch web pages
   - Input: `{ url: string, prompt: string }`
   - Output: Page analysis

10. **AskUserQuestion** - Interactive prompts
    - Input: `{ questions: [...] }`
    - Output: User answers

### Custom MCP Tools

Users can add custom tools via MCP (Model Context Protocol):
- GitHub operations
- Database queries
- API calls
- Custom business logic

---

## Implementation Recommendation

### Phase 1: Agent-Side JSONL Tracker (1 week)

**Step 1**: Create ToolUsageTracker class
```javascript
// lib/tool-usage-tracker.js
export class ToolUsageTracker {
  // ... implementation from above
}
```

**Step 2**: Integrate in agent server
```javascript
// server.mjs
import { ToolUsageTracker } from './lib/tool-usage-tracker.js'

// Find project directory
const projectName = sanitizeProjectName(process.cwd())
const projectDir = path.join(os.homedir(), '.claude/projects', projectName)

const toolTracker = new ToolUsageTracker(projectDir)

// Expose API
app.get('/metrics/tools', (req, res) => {
  res.json(toolTracker.getMetrics())
})
```

**Step 3**: Deploy to agents
```bash
# Build new Docker image with tool tracker
docker build -t claude-agent:0.3.0 .
docker push <ecr>/claude-agent:0.3.0

# Update Terraform
terraform apply
```

---

### Phase 2: Dashboard Integration (3 days)

**Step 1**: Create useToolMetrics hook
```typescript
// hooks/useToolMetrics.ts
export function useToolMetrics(agentId: string) {
  const [metrics, setMetrics] = useState<ToolMetrics | null>(null)

  useEffect(() => {
    const fetchMetrics = async () => {
      const agent = await getAgent(agentId)
      const endpoint = getMetricsEndpoint(agent, '/metrics/tools')

      const response = await fetch(endpoint)
      if (response.ok) {
        const data = await response.json()
        setMetrics(data)
      }
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000) // 30s

    return () => clearInterval(interval)
  }, [agentId])

  return metrics
}
```

**Step 2**: Create ToolUsageChart component
```typescript
// components/ToolUsageChart.tsx
import { Doughnut } from 'react-chartjs-2'

export function ToolUsageChart({ agentId }: Props) {
  const metrics = useToolMetrics(agentId)

  if (!metrics) return <div>Loading...</div>

  const data = {
    labels: Object.keys(metrics.byTool),
    datasets: [{
      data: Object.values(metrics.byTool),
      backgroundColor: [
        '#3B82F6', // Blue - Read
        '#10B981', // Green - Write
        '#F59E0B', // Orange - Bash
        '#8B5CF6', // Purple - Grep
        '#EC4899', // Pink - Glob
        '#06B6D4', // Cyan - Task
        '#EF4444', // Red - WebSearch
        '#6366F1'  // Indigo - WebFetch
      ]
    }]
  }

  return (
    <div className="tool-usage-chart">
      <h3>Tool Usage Distribution</h3>
      <Doughnut data={data} options={{...}} />
      <div className="tool-stats">
        <div>Total: {metrics.totalInvocations}</div>
        <div>Avg Duration: {metrics.avgDuration}ms</div>
        <div>Success Rate: {(metrics.successRate * 100).toFixed(1)}%</div>
      </div>
    </div>
  )
}
```

**Step 3**: Add to AgentProfile
```typescript
// components/AgentProfile.tsx
{expandedSections.metrics && (
  <div>
    {/* Existing metric cards */}
    <MetricCard ... />

    {/* NEW: Tool usage chart */}
    <div className="col-span-2 mt-6">
      <ToolUsageChart agentId={agent.id} />
    </div>
  </div>
)}
```

---

### Phase 3: Tool Timeline (5 days)

**Create interactive timeline showing tool invocations over time**:

```typescript
// components/ToolTimeline.tsx
export function ToolTimeline({ agentId }: Props) {
  const metrics = useToolMetrics(agentId)

  // Group tools by time bucket (hourly)
  const timeline = groupByHour(metrics.recentTools)

  return (
    <div className="tool-timeline">
      {timeline.map(hour => (
        <div key={hour.timestamp} className="hour-bucket">
          <span className="time">{hour.label}</span>
          <div className="tools">
            {hour.tools.map(tool => (
              <div
                key={tool.id}
                className={`tool-pill tool-${tool.name.toLowerCase()}`}
                title={`${tool.name} (${tool.durationMs}ms)`}
              >
                {getToolIcon(tool.name)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

## Success Metrics

- [ ] Track tool usage for local agents
- [ ] Track tool usage for cloud agents
- [ ] Display tool distribution chart
- [ ] Show avg duration per tool
- [ ] Show success rate per tool
- [ ] Display recent tool timeline
- [ ] Export tool usage report

---

## Open Questions

1. **Storage**: Keep tool history in memory or persist to DB?
   - **Answer**: Memory for real-time, DB for history (30 days)

2. **Granularity**: Track per-agent or per-session?
   - **Answer**: Per-agent (aggregate across all sessions)

3. **Privacy**: Should we log tool inputs/outputs?
   - **Answer**: No - only tool name, duration, success/failure

4. **Performance**: Will file watching impact agent performance?
   - **Answer**: Minimal - chokidar is efficient, JSONL writes are async

---

## Next Steps

1. ✅ **Research complete** - Understand JSONL structure
2. 🔄 **Design architecture** - Agent-side tracker + API
3. ⏳ **Implement Phase 1** - Create ToolUsageTracker class
4. ⏳ **Deploy to agents** - Build new Docker image
5. ⏳ **Dashboard integration** - useToolMetrics hook
6. ⏳ **Visualizations** - Charts and timeline

**Timeline**: 2 weeks for full implementation

---

**Last Updated**: November 2, 2025
**Status**: Design complete, ready for implementation
**Dependencies**: Metrics Epic Phase 1 (agent-side metrics API)
