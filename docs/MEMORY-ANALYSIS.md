# AI Maestro - Memory Usage Analysis

**Date:** October 19, 2025
**Server Runtime:** 2 days, 15 hours, 54 minutes
**Active Sessions:** 11 tmux sessions

## Current Memory Footprint

### Server-Side (Node.js Process PID 73818)
- **RSS (Physical Memory):** 227 MB
- **VSZ (Virtual Memory):** 478 GB (mostly mapped memory, not actual usage)
- **PTY Processes:** 11 active (one per session)
- **WebSocket Connections:** 11 (from Chrome browser)
- **File Descriptors:** ~1,896 total, 87 pseudo-terminals
- **Log Files:** 2.4 MB (21,717 lines across 4 files)

### Client-Side (Browser)
- **Terminal Instances:** 11 xterm.js instances (all mounted, visibility-toggled)
- **Scrollback Buffer per Terminal:** 50,000 lines
- **Total Scrollback Capacity:** 550,000 lines (11 × 50,000)
- **Estimated Browser Memory:** ~500-800 MB (depends on scrollback usage)

### System Memory (macOS)
- **Free:** 359 MB
- **Active:** 12,310 MB
- **Inactive:** 12,755 MB
- **Compressed:** 99,644 MB (in compressor)
- **Wired:** 7,591 MB

## Identified Memory Leak Risks

### ✅ SAFE - Properly Managed
1. **Event Listeners** - All have cleanup handlers
   - ResizeObserver disconnected on unmount
   - Touch event listeners removed properly
   - Window resize listeners cleaned up
   - Terminal onData/onResize disposables handled

2. **WebSocket Connections** - Cleanup on unmount
   - 30-second grace period before PTY cleanup
   - Prevents thrashing during quick reconnects

3. **Log Files** - Bounded growth
   - Append mode, not growing infinitely
   - ANSI filter reduces noise
   - Only 2.4 MB after 2+ days runtime

### ⚠️ POTENTIAL ISSUES

#### 1. **Terminal Scrollback Buffers** (HIGH IMPACT)
**Location:** `hooks/useTerminal.ts:144`
```typescript
scrollback: 50000,  // 50K lines per terminal × 11 = 550K lines
```

**Problem:**
- Each terminal stores 50,000 lines in memory
- With 11 sessions: **550,000 lines total**
- Heavy Claude Code output (thinking steps, diffs, logs) fills buffers quickly
- Each line can be 100+ characters (ANSI codes, UTF-8)
- **Estimated impact:** 100-200 MB browser memory

**Calculation:**
```
50,000 lines × 200 bytes avg × 11 terminals = ~110 MB
(Could be higher with ANSI escape codes and Unicode)
```

**Recommended Fix:**
```typescript
// Reduce scrollback for most sessions
scrollback: 10000,  // 10K default (30-50 MB total for 11 terminals)

// For sessions needing history, use tmux scrollback instead:
// Shift+PageUp/PageDown scrolls xterm.js buffer
// Ctrl-b [ enters tmux copy mode (full history)
```

#### 2. **Refresh Timeouts in TerminalView** (LOW IMPACT)
**Location:** `components/TerminalView.tsx:165-174`
```typescript
refreshTimeoutRef.current = setTimeout(() => {
  if (terminalInstanceRef.current) {
    terminalInstanceRef.current.refresh(0, terminalInstanceRef.current.rows - 1)
  }
}, 200)
```

**Problem:**
- Timeout not cleared if component unmounts during 200ms window
- Could accumulate if sessions are rapidly switched (unlikely with tab architecture)

**Fix:**
```typescript
// Add to cleanup in useEffect
return () => {
  if (refreshTimeoutRef.current) {
    clearTimeout(refreshTimeoutRef.current)
  }
}
```

#### 3. **Message Buffer Array** (MEDIUM IMPACT)
**Location:** `components/TerminalView.tsx:177, 239`
```typescript
messageBufferRef.current.push(data)
// ...
messageBufferRef.current = []  // Cleanup on unmount
```

**Problem:**
- If WebSocket receives data faster than terminal initializes, buffer grows
- Each message is raw terminal data (can be large)
- Buffer only cleared on unmount or when terminal becomes ready

**Observed Behavior:**
- Usually fine because terminal initializes quickly
- Could be an issue if PTY sends massive history dump before terminal ready

**Recommended Improvement:**
```typescript
// Add buffer size limit
if (messageBufferRef.current.length < 100) {  // Max 100 messages
  messageBufferRef.current.push(data)
} else {
  console.warn('Message buffer full, dropping oldest messages')
  messageBufferRef.current.shift()  // Drop oldest
  messageBufferRef.current.push(data)
}
```

#### 4. **Browser Console Logging** (LOW-MEDIUM IMPACT)
**Throughout codebase:** Extensive `console.log()` statements

**Problem:**
- Browser DevTools keeps all console messages in memory
- With 11 terminals generating logs, messages accumulate quickly
- Observed patterns: "📨 [WS-MESSAGE]", "✍️ [TERMINAL-WRITE]", etc.

**Impact if DevTools open:**
- 1,000+ console messages over a session
- Each message stores stack trace, timestamp, arguments
- **Estimated:** 20-50 MB if DevTools open for hours

**Recommended Fix:**
```typescript
// Create a debug flag
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true'

// Wrap all non-critical logs
if (DEBUG) console.log('📨 [WS-MESSAGE] ...')
```

#### 5. **No Memory Limits on Next.js** (MEDIUM IMPACT)
**Location:** `server.mjs` - No Node.js memory flags set

**Problem:**
- Node.js defaults to ~1.4 GB heap on 64-bit systems
- If sessions grow beyond this, Node crashes with OOM
- No warning before crash

**Recommended Improvement:**
```bash
# Add to package.json scripts
"dev": "NODE_OPTIONS='--max-old-space-size=2048' node server.mjs",
"start": "NODE_OPTIONS='--max-old-space-size=2048' node server.mjs"

# Or for production with more headroom:
"start": "NODE_OPTIONS='--max-old-space-size=4096' node server.mjs"
```

## Memory Leak Detection Script

Create `/scripts/memory-check.sh`:
```bash
#!/bin/bash

# Find AI Maestro server process
PID=$(pgrep -f "node.*server.mjs" | head -1)

if [ -z "$PID" ]; then
  echo "AI Maestro server not running"
  exit 1
fi

# Get memory stats
ps -p $PID -o pid,vsz,rss,pmem,etime,command

# Count file descriptors
echo ""
echo "File Descriptors: $(lsof -p $PID 2>/dev/null | wc -l)"

# Check PTY count
echo "PTY Processes: $(ps aux | grep 'tmux attach-session' | grep -v grep | wc -l)"

# Log file sizes
echo ""
echo "Log Directory Size:"
du -sh logs/

# Chrome connections
echo ""
echo "Active WebSocket Connections:"
lsof -i :23000 2>/dev/null | grep ESTABLISHED | wc -l
```

Usage:
```bash
chmod +x scripts/memory-check.sh
./scripts/memory-check.sh
```

## Monitoring Recommendations

### 1. Add Memory Logging to Server
```javascript
// server.mjs - Add periodic memory logging
setInterval(() => {
  const used = process.memoryUsage()
  console.log('Memory Stats:', {
    rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(used.external / 1024 / 1024)} MB`,
    activeSessions: sessions.size
  })
}, 60000) // Every minute
```

### 2. Browser Memory API
Add to `app/page.tsx`:
```typescript
useEffect(() => {
  if ('memory' in performance) {
    const interval = setInterval(() => {
      const memory = (performance as any).memory
      console.log('Browser Memory:', {
        usedJSHeapSize: `${Math.round(memory.usedJSHeapSize / 1024 / 1024)} MB`,
        totalJSHeapSize: `${Math.round(memory.totalJSHeapSize / 1024 / 1024)} MB`,
        jsHeapSizeLimit: `${Math.round(memory.jsHeapSizeLimit / 1024 / 1024)} MB`,
        terminals: sessions.length
      })
    }, 60000) // Every minute

    return () => clearInterval(interval)
  }
}, [sessions.length])
```

### 3. Add /api/health Endpoint
```typescript
// app/api/health/route.ts
export async function GET() {
  const used = process.memoryUsage()
  return Response.json({
    uptime: process.uptime(),
    memory: {
      rss: Math.round(used.rss / 1024 / 1024),
      heapTotal: Math.round(used.heapTotal / 1024 / 1024),
      heapUsed: Math.round(used.heapUsed / 1024 / 1024),
      heapPercent: Math.round((used.heapUsed / used.heapTotal) * 100)
    },
    activeSessions: global.sessions?.size || 0,
    timestamp: new Date().toISOString()
  })
}
```

## Immediate Action Items

### High Priority
1. **Reduce scrollback buffer** from 50,000 → 10,000 lines
   - Saves ~80-100 MB browser memory
   - Users can still access full history via tmux

2. **Add refresh timeout cleanup** in TerminalView
   - Prevents timeout leak on rapid session switching

3. **Add message buffer size limit** (100 messages max)
   - Prevents unbounded growth during slow initialization

### Medium Priority
4. **Increase Node.js heap size** to 2-4 GB
   - Prevents OOM crashes during heavy usage

5. **Add debug flag** for console.log statements
   - Reduces DevTools memory usage

6. **Create memory monitoring script**
   - Run weekly to detect slow leaks

### Low Priority
7. **Implement log rotation** (optional)
   - Logs are small (2.4 MB after 2 days)
   - Only needed if running for weeks/months

## Expected Results After Fixes

**Before:**
- Browser: ~500-800 MB (with full scrollback)
- Server: ~227 MB (current)

**After:**
- Browser: ~300-500 MB (reduced scrollback)
- Server: ~227 MB (unchanged, already efficient)

**Total savings:** ~200-300 MB browser memory

## Long-Term Architecture Improvements

### 1. Virtual Scrolling for Terminals
- Render only visible portion of scrollback
- Load history on-demand when scrolling up
- Libraries: react-virtualized, react-window

### 2. Lazy Terminal Mounting
```typescript
// Instead of mounting all 11 terminals:
// Only mount: active + 2 most recently used
// Unmount others, preserve state in localStorage
```

### 3. Incremental Log Loading
```typescript
// Instead of loading 1000 lines of history:
// Load 100 lines initially, fetch more on scroll
```

### 4. Session Hibernation
```typescript
// Auto-hibernate inactive sessions after 10 minutes:
// - Close PTY process
// - Save terminal state to disk
// - Restore on re-activation
```

## Conclusion

**Current Status:** ✅ Healthy
- Server using 227 MB after 2+ days is excellent
- Browser memory (500-800 MB) is acceptable for 11 sessions
- No critical leaks detected

**Main Issue:** Large scrollback buffers (50K lines × 11 terminals)
- Reducing to 10K will save ~200 MB browser memory
- Most users don't need 50,000 lines in xterm.js buffer
- Tmux provides unlimited scrollback via copy mode

**Recommendation:** Implement high-priority fixes first, monitor for 1 week.
