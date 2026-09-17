# Chat Architecture

How a message gets from the dashboard to an agent, how an agent's question gets
back, and every place those two things can go wrong.

Written on 15 September 2026 after seven releases in one day chasing a single
user-visible symptom through code paths nobody had written down. Most of that day
was not spent fixing bugs — it was spent fixing the *wrong copy* of the right
code. Read this before touching the chat.

---

## There are TWO chat paths

They are completely separate implementations. Knowing which one you are looking
at is the first question to ask about any chat bug.

| | **tmux path** (default) | **SDK path** (`Streaming` tab) |
|---|---|---|
| Component | `ChatView.tsx` / `MobileChatView.tsx` | `StreamingChatView.tsx` |
| Transport | WebSocket → `server.mjs` | WebSocket → `lib/streaming-runtime.mjs` |
| Send function | **`sendChatMessage` in `server.mjs`** | `Session.push()` |
| How text reaches the agent | `tmux load-buffer` + `paste-buffer` + `C-m` | Claude Agent SDK stream |
| How state is known | **reading the terminal as text** | structured SDK events |
| Questions | scraped from the pane, or from the transcript | `canUseTool` callback |
| Reliability ceiling | inherently below 100% | deterministic |

### The trap that cost a full day

There are **two functions named `sendChatMessage`**:

| file | called by |
|---|---|
| `server.mjs:~735` | **the chat UI** (WebSocket `chat:send`) |
| `services/agents-chat-service.ts` | the REST endpoint `/api/agents/:id/chat` |

Verification was added to the TypeScript one, tested through the REST endpoint,
observed returning `verified: true`, and reported as fixed. The chat UI never
calls it. **Check which one you are editing.**

### Why the SDK path is the one that can be right

The tmux path infers agent state by reading a terminal as text and typing
keystrokes back. Everything that broke on 15 Sep follows from that, and none of
it is a coding mistake:

- text pasted into the input box but never submitted, reported as sent
- `C-u` silently not clearing Claude Code's input, so every "clear and retype"
  recovery appended instead of replacing
- Claude Code's **dim placeholder** (your previous prompt, greyed, inside an
  *empty* box) read as staged text — indistinguishable without `capture-pane -e`
- the input box truncating a long line to its tail, so a readback sees only part
- a menu that scrolled into history parsed as a live prompt

Screen-scraping a TUI can be made *better*. It cannot be made *certain*. The SDK
path exchanges structured JSON in both directions.

---

## Sending a message (tmux path)

`server.mjs → sendChatMessage(sessionName, message)`

1. `exitCopyMode` — scrolling leaves the pane in copy-mode, where Enter is eaten
2. **permission check** — see *Permission state* below
3. capture a baseline of the pane
4. write to a temp file → `tmux load-buffer` → `paste-buffer`
5. paste probe — **advisory only**, never gate submission on it
6. `tmux send-keys C-m`
7. **verify submission** — the text must appear *above* the input box
   (`paneSubmitted`). If it is still *in* the box (`paneStaged`), clear with
   **backspaces** and retype once. Twice failing means something is holding the
   keyboard; return an error that says so.

Step 7 did not exist until v0.38.16. Before that the chat reported success for
every message it typed, whether or not it was submitted.

### Pane readback rules — `lib/pane-readback.mjs`

One module, imported by **both** `server.mjs` and the TypeScript services. It
used to live in `lib/notification-service.ts`, which `server.mjs` cannot import —
so the file that needed it most was the only file without it.

- **Proof of submission is position, not presence.** The text must be ABOVE the
  input box. "Anywhere on the pane" also matches text sitting unsent in the box.
- **Capture with `-e` and strip SGR dim** before matching, or the placeholder
  lies to you.
- **Whitespace-insensitive matching** — a TUI wraps long text mid-token.
- **Clearing the input is `BSpace` × N, never `C-u`.** Verified by hand on a live
  agent: a staged line survived two `C-u` and an `Escape`; only backspace removed
  characters.

---

## Where a question panel comes from — THREE places

This is the part that took five releases. A panel of numbered options can be
rendered from three independent sources, and only two of them mention
`AskUserQuestion` anywhere in the code.

### 1. The transcript card — `ChatView.tsx`

An `AskUserQuestion` tool_use block in the conversation JSONL. Answered-ness
comes from a `tool_result_marker`, emitted by `parseJsonlLines` for each
completed tool call, so it **survives a page reload**. (`answeredQuestions` is a
`useState` Set and dies with the page; it is a fallback, not the record.)

A card is interactive only when it is the **last** question AND nothing has been
said since. Once the agent has spoken, the question is settled — clicking an old
option sends a keystroke to a menu that is no longer on screen.

### 2. The same card again — `MobileChatView.tsx`

**A second, independent copy.** Not phone-only: `app/page.tsx` reads a
`layoutOverride` from localStorage and `TabletDashboard` renders `MobileChatView`,
so a desktop browser lands here too. Fixing one renderer and not the other means
the bug persists for half your users and you cannot reproduce it.

### 3. `hookState.options` — synthesised from the PANE

The one with no mention of `AskUserQuestion` at all.

`detectPermissionFromPane` captures **200 lines of scrollback** and
`parsePermissionMenu` looks for a numbered menu in it. If it finds one, the
server manufactures a `hookState` carrying `options`, and *both* renderers draw
buttons from it. **This path never reads the transcript.**

That is why a question answered hours earlier, 46 messages back in the
conversation, kept reappearing on every reload: the transcript said "answered"
and this code does not consult the transcript.

**Rule: a live menu is the LAST thing on the pane.** If Claude Code has spoken
since — `●` assistant turn, `⎿` tool result, `✻` status, or a submitted
`❯ <text>` — the menu is over. An empty `❯` is the waiting input box and still
counts as live.

---

## Permission state

Three sources, in descending trustworthiness:

1. **The pane, right now** — ground truth.
2. `~/.aimaestro/chat-state/<cwdHash>.json` — written by the hook with
   `fs.writeFileSync` *before* any network call, so it survives a hook process
   that exits mid-fetch.
3. `sessionState._lastPermission` — in-memory cache, set from either of the above
   including a pane false-positive.

`_lastPermission` is a **cache, never an authority**. It is cleared only when a
new assistant message arrives, which produced a deadlock:

> refuse the send → nothing reaches the agent → no assistant message → the cache
> never clears → refuse the next send

Measured live: a false `permission_request` blocked every chat message for an
entire afternoon while the pane sat at an ordinary empty prompt. Always
re-validate against the pane before refusing, and drop the cache when the pane
disagrees.

---

## Answering a question on the SDK path

`AskUserQuestion` arrives through the **same** `canUseTool` callback as a
permission request, and needs a **different** answer shape:

```js
// permission
{ behavior: 'allow', updatedInput: input }
{ behavior: 'deny',  message }

// question — an allow with unchanged input gives Claude NO ANSWER
{ behavior: 'allow',
  updatedInput: {
    questions,                                   // always echo these back
    answers: { "<question text>": "<label>" },   // or the user's own words
    response: "…"                                // optional freeform reply
  } }
```

**Free text is a first-class answer**, not a fallback — per Anthropic's
[user-input docs](https://code.claude.com/docs/en/agent-sdk/user-input), the
custom string goes in `answers[question]`. `response` is for a reply that answers
no specific question; Claude reads it as *"The user responded: …"*.

---

## Debugging checklist

Run these before forming a theory. Each one took minutes and would have replaced
hours of reasoning on 15 Sep.

```bash
# Which panel is being rendered? Run the REAL parser on the LIVE pane.
tmux capture-pane -p -t <session> -S -200 > /tmp/pane.txt
node -e "import('./lib/pane-permission.mjs').then(async m => {
  const fs = await import('fs')
  console.log(m.parsePermissionMenu(fs.readFileSync('/tmp/pane.txt','utf-8')))
})"

# What is the chat actually being sent?
curl -s "localhost:23000/api/agents/<id>/chat?limit=200" | python3 -m json.tool | head -40

# Is the fix in the bundle the browser downloads? (app chunks live in chunks/app/)
grep -rl "<your marker>" .next/static/chunks/app/

# Is the process running the version on disk? /api/config reads the FILE.
pm2 list    # the version column and a short uptime are the real evidence
```

**An empty grep is evidence about your search terms, not about the codebase.**
Three wrong diagnoses on 15 Sep came from greps that were correct and pointed at
the wrong file.

---

## Known duplication — fix this and the class of bug goes away

| was duplicated | status |
|---|---|
| pane readback | **resolved** — `lib/pane-readback.mjs` |
| question answered/live rules | **resolved** — `lib/question-state.mjs` |
| verify / clear / retype loop | **resolved** — `lib/chat-verify.mjs` |
| question panel *sources* × 3 | inherent, documented above |

### What was deliberately NOT collapsed

**The two chat components.** `ChatView` and `MobileChatView` are different
layouts, not an accident. Merging them yields one component full of branching
markup — worse than two. Their shared *logic* moved to `lib/question-state.mjs`;
their markup stays apart.

**The two `sendChatMessage` wrappers.** They have genuinely different jobs: the
service resolves an agent from the registry and guards against a bare shell;
`server.mjs` handles tmux copy-mode and the permission cache. They also deliver
text differently — the chat path pastes through a tmux buffer (newlines and
quoting for free), the service types via the runtime abstraction its tests mock.
Both are legitimate. Only the **proof** was duplicated, and that is now
`lib/chat-verify.mjs`, which takes delivery as an injected function.

The rule this leaves behind: **share the logic, not the shape.** Every bug on
15 September was a fork of logic; none of them was a fork of markup.
