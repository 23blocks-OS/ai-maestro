# AI Maestro Plugin Scripts - Help Screens

**Date:** 2026-03-23
**Source:** `/Users/emanuelesabetta/ai-maestro/plugin/plugins/ai-maestro/scripts/`
**Total scripts:** 43

---

## Quality Legend

| Rating | Description |
|--------|-------------|
| COMPLETE | Covers all subcommands with examples |
| PARTIAL | Missing subcommands or examples |
| MISSING | No help screen at all |
| LIBRARY | Sourced helper module, not a standalone command |

---

## 1. AMP Scripts (amp-*.sh)

### amp-delete.sh -- COMPLETE

```
Usage: amp-delete <message-id> [options]

Delete a message from inbox or sent folder.

Arguments:
  message-id      The message ID to delete

Options:
  --sent, -s      Delete from sent folder (default: inbox)
  --force, -f     Delete without confirmation
  --help, -h      Show this help

Examples:
  amp-delete msg_1234567890_abc123
  amp-delete msg_1234567890_abc123 --sent
  amp-delete msg_1234567890_abc123 --force
```

### amp-download.sh -- COMPLETE

```
Usage: amp-download <message-id> [attachment-id|--all] [options]

Download attachments from a message.

Arguments:
  message-id       The message ID (from amp-inbox or amp-read)
  attachment-id    Specific attachment ID to download

Options:
  --all             Download all attachments from the message
  --dest, -d DIR    Destination directory (default: ~/.agent-messaging/attachments/<msg-id>/)
  --sent, -s        Download from sent folder instead of inbox
  --help, -h        Show this help

Examples:
  amp-download msg_123_abc --all
  amp-download msg_123_abc att_456_def
  amp-download msg_123_abc --all --dest ~/Downloads
```

### amp-fetch.sh -- COMPLETE

```
Usage: amp-fetch [options]

Fetch new messages from external providers.

Options:
  --provider, -p PROVIDER   Fetch from specific provider only
  --verbose, -v             Show detailed output
  --no-mark                 Don't mark messages as fetched on provider
  --help, -h                Show this help

Examples:
  amp-fetch                     # Fetch from all registered providers
  amp-fetch -p crabmail.ai      # Fetch from Crabmail only
  amp-fetch --verbose           # Show details
```

### amp-identity.sh -- COMPLETE

```
Usage: amp-identity [options]

Check and display your AMP identity.
Run this FIRST to recover your identity after context reset.

Options:
  --json, -j     Output as JSON
  --brief, -b    One-line summary
  --help, -h     Show this help

Files:
  Identity: ~/.agent-messaging/IDENTITY.md
  Config:   ~/.agent-messaging/config.json
```

### amp-inbox.sh -- COMPLETE

```
Usage: amp-inbox [options]

List messages in your inbox.

Options:
  --all, -a       Show all messages (default: unread only)
  --unread, -u    Show only unread messages
  --read, -r      Show only read messages
  --count, -c     Show message count only
  --json, -j      Output as JSON
  --limit, -l N   Limit to N messages (default: 20)
  --help, -h      Show this help

Examples:
  amp-inbox                # Check unread messages
  amp-inbox --all          # Show all messages
  amp-inbox --count        # Just show count
```

### amp-init.sh -- COMPLETE

```
Usage: amp-init [options]

Initialize your agent identity for the Agent Messaging Protocol.

Options:
  --name, -n NAME      Agent name (e.g., backend-api)
  --tenant, -t TENANT  Organization/tenant (auto-detected)
  --auto, -a           Auto-detect name from environment
  --force, -f          Overwrite existing configuration
  --help, -h           Show this help

Examples:
  amp-init --auto                    # Auto-detect from environment
  amp-init --name backend-api       # Set specific name
  amp-init -n myagent               # Tenant auto-detected
```

### amp-read.sh -- COMPLETE

```
Usage: amp-read <message-id> [options]

Read a specific message.

Arguments:
  message-id      The message ID (from amp-inbox)

Options:
  --no-mark-read, -n   Don't mark the message as read
  --json, -j           Output raw JSON
  --sent, -s           Read from sent folder instead of inbox
  --download           Auto-download clean attachments after display
  --help, -h           Show this help

Examples:
  amp-read msg_1234567890_abc123
  amp-read msg_1234567890_abc123 --no-mark-read
```

### amp-register.sh -- COMPLETE

```
Usage: amp-register --provider <provider> --user-key <key> [options]

Register your agent with an external AMP provider.

Required:
  --provider, -p PROVIDER   Provider domain (e.g., crabmail.ai)

Authentication (one of):
  --user-key, -k KEY        User Key from provider dashboard (e.g., uk_xxx)
  --token TOKEN             Alias for --user-key
  --tenant, -t TENANT       Organization name (legacy, for providers without user keys)

Options:
  --name, -n NAME           Agent name (default: from local config)
  --api-url, -a URL         Custom API URL (for self-hosted providers)
  --force, -f               Re-register even if already registered
  --help, -h                Show this help

Supported providers:
  - crabmail.ai            Crabmail (requires --user-key)

Examples:
  # Register with Crabmail (get user key from dashboard)
  amp-register --provider crabmail.ai --user-key uk_dXNyXzEyMzQ1

  # Register with custom name
  amp-register -p crabmail.ai -k uk_xxx -n backend-api

  # Legacy: Provider without user key auth
  amp-register -p myprovider.com -t mycompany
```

### amp-reply.sh -- COMPLETE

```
Usage: amp-reply <message-id> <reply-message> [options]

Reply to a message.

Arguments:
  message-id      The message ID to reply to
  reply-message   Your reply message

Options:
  --priority, -p PRIORITY   Override priority (default: same as original)
  --type, -t TYPE           Message type (default: response)
  --attach, -a FILE         Attach a file (can be repeated)
  --help, -h                Show this help

Examples:
  amp-reply msg_1234567890_abc "Got it, working on it"
  amp-reply msg_1234567890_abc "Urgent update" --priority urgent
  amp-reply msg_1234567890_abc "See attached" --attach report.pdf
```

### amp-send.sh -- COMPLETE

```
Usage: amp-send <recipient> <subject> <message> [options]

Send a message to another agent.

Arguments:
  recipient   Agent address (e.g., alice, bob@tenant.provider)
  subject     Message subject
  message     Message body

Options:
  --priority, -p PRIORITY   low|normal|high|urgent (default: normal)
  --type, -t TYPE           request|response|notification|task|status (default: notification)
  --reply-to, -r ID         Message ID this is replying to
  --context, -c JSON        Additional context as JSON
  --attach, -a FILE         Attach a file (repeatable, max 10 files,
                              max 25.0 MB/file,
                              max 100.0 MB total)
  --help, -h                Show this help

Address formats:
  alice                     → alice@default.local (local)
  alice@myteam.local        → alice@myteam.local (local)
  alice@acme.crabmail.ai    → alice@acme.crabmail.ai (external)

Examples:
  amp-send alice "Hello" "How are you?"
  amp-send backend-api "Deploy" "Ready" --priority high
  amp-send bob@acme.crabmail.ai "Help" "Need assistance" --type request
```

### amp-status.sh -- PARTIAL

Missing examples.

```
Usage: amp-status [options]

Show your AMP agent status and registrations.

Options:
  --json, -j      Output as JSON
  --help, -h      Show this help
```

### amp-helper.sh -- LIBRARY

Sourced helper module (`AMP Helper Functions - Core utilities for all AMP scripts`). Not a standalone command.

### amp-security.sh -- LIBRARY

Sourced helper module (`AMP Security - Content Security Module`). Not a standalone command.

---

## 2. Agent Scripts (agent-*.sh, aimaestro-agent.sh, list-agents.sh)

### aimaestro-agent.sh -- COMPLETE

Main CLI entry point with 11 subcommands. Full help below.

```
AI Maestro Agent CLI

Usage: aimaestro-agent.sh <command> [options]

Commands:
  list                          List all agents
  show <agent>                  Show agent details
  create <name>                 Create a new agent
  delete <agent>                Delete an agent
  update <agent>                Update agent properties
  rename <old> <new>            Rename an agent
  session <subcommand>          Manage agent sessions
  hibernate <agent>             Hibernate an agent
  wake <agent>                  Wake a hibernated agent
  skill <subcommand>            Manage agent skills
  plugin <subcommand>           Manage Claude Code plugins
  export <agent>                Export agent to file
  import <file>                 Import agent from file
  help                          Show this help

Examples:
  # Create a new agent with a project folder
  aimaestro-agent.sh create my-agent -d ~/Code/my-project

  # List all online agents
  aimaestro-agent.sh list --status online

  # Hibernate and later wake an agent
  aimaestro-agent.sh hibernate my-agent
  aimaestro-agent.sh wake my-agent --attach

  # Install a plugin for an agent (local scope)
  aimaestro-agent.sh plugin install my-agent feature-dev --scope local

  # Export and import an agent
  aimaestro-agent.sh export my-agent -o backup.json
  aimaestro-agent.sh import backup.json --name restored-agent

Run 'aimaestro-agent.sh <command> --help' for command-specific help.
```

#### Subcommand: `list` -- COMPLETE

```
Usage: aimaestro-agent.sh list [options]

Options:
  --status <status>   Filter by status (online, offline, hibernated, all)
  --format <format>   Output format (table, json, names)
  -q, --quiet         Output names only (same as --format names)
  --json              Output as JSON (same as --format json)

Examples:
  aimaestro-agent.sh list
  aimaestro-agent.sh list --status all
  aimaestro-agent.sh list --status online
  aimaestro-agent.sh list --status hibernated
  aimaestro-agent.sh list --json
  aimaestro-agent.sh list -q
```

#### Subcommand: `show` -- PARTIAL

Missing examples and option details.

```
Usage: aimaestro-agent.sh show <agent> [--format pretty|json]
```

#### Subcommand: `create` -- COMPLETE

```
Usage: aimaestro-agent.sh create <name> --dir <path> [options] [-- <program-args>...]

Options:
  -d, --dir <path>       Working directory (REQUIRED - must be full path)
  -p, --program <prog>   Program to run (default: claude-code)
  -m, --model <model>    AI model (e.g., claude-sonnet-4)
  -t, --task <desc>      Task description
  --tags <t1,t2>         Comma-separated tags
  --no-session           Don't create tmux session
  --no-folder            Don't create project folder
  --force-folder         Use existing directory (by default, errors if exists)

Program Arguments:
  Use -- to pass arguments to the program when it starts.

Examples:
  aimaestro-agent.sh create my-agent --dir ~/Code/my-project
  aimaestro-agent.sh create backend-dev --dir ~/Code/backend \
    -m claude-sonnet-4 -t "Develop backend API"
  aimaestro-agent.sh create existing-project --dir ~/Code/old-project --force-folder
  aimaestro-agent.sh create utils-agent --dir ~/Code/utils --tags "utils,tools"
  aimaestro-agent.sh create headless-agent --dir ~/Code/headless --no-session
  aimaestro-agent.sh create my-agent --dir ~/Code/project -- --continue --chrome
```

#### Subcommand: `delete` -- COMPLETE

```
Usage: aimaestro-agent.sh delete <agent> --confirm [options]

Options:
  --confirm         Required for deletion (safety flag)
  --keep-folder     Don't delete project folder
  --keep-data       Don't delete agent data directory

Examples:
  aimaestro-agent.sh delete my-agent --confirm
  aimaestro-agent.sh delete my-agent --confirm --keep-folder
  aimaestro-agent.sh delete my-agent --confirm --keep-data
  aimaestro-agent.sh delete abc123-uuid --confirm
```

#### Subcommand: `update` -- PARTIAL

Missing examples.

```
Usage: aimaestro-agent.sh update <agent> [options]

Options:
  -t, --task <desc>      Update task description
  -m, --model <model>    Update AI model
  --args <arguments>     Update program arguments (e.g. "--continue --chrome")
  --tags <t1,t2>         Replace all tags
  --add-tag <tag>        Add a single tag
  --remove-tag <tag>     Remove a single tag
```

#### Subcommand: `rename` -- COMPLETE

```
Usage: aimaestro-agent.sh rename <old-name> <new-name> --yes [options]

Options:
  --rename-session    Also rename tmux session
  --rename-folder     Also rename project folder
  --yes, -y           Required for rename (safety flag)

Examples:
  aimaestro-agent.sh rename old-name new-name --yes
  aimaestro-agent.sh rename old-name new-name --yes --rename-session
  aimaestro-agent.sh rename old-name new-name --yes --rename-session --rename-folder
```

#### Subcommand: `session` -- PARTIAL

Missing examples.

```
Usage: aimaestro-agent.sh session <subcommand> [options]

Subcommands:
  add <agent>               Add a new session to agent
  remove <agent>            Remove a session from agent
  exec <agent> <command>    Execute command in agent's session
```

#### Subcommand: `hibernate` -- PARTIAL

Missing options and examples.

```
Usage: aimaestro-agent.sh hibernate <agent>
```

#### Subcommand: `wake` -- PARTIAL

Missing examples.

```
Usage: aimaestro-agent.sh wake <agent> [--attach]
```

#### Subcommand: `skill` -- COMPLETE

```
Usage: aimaestro-agent.sh skill <subcommand> [options]

Manage skills for an agent.

Registry commands (via AI Maestro API):
  list <agent>                      List agent's registered skills
  add <agent> <skill-id>            Register skill in agent's profile
  remove <agent> <skill-id>         Unregister skill from agent's profile

Filesystem commands (install/uninstall skill files):
  install <agent> <source>          Install skill to agent's Claude Code
  uninstall <agent> <skill-name>    Uninstall skill from agent's Claude Code

Install methods:
  Plugin-based skills are installed via 'plugin install' (see plugin help).
  The 'skill install' command handles .skill files and skill directories.

Scopes:
  --scope user       ~/.claude/skills/ (all your projects)
  --scope project    .claude/skills/ (shared with collaborators, committed)
  --scope local      .claude/skills/ (only you, gitignored)

Examples:
  aimaestro-agent.sh skill install my-agent ./my-skill.skill
  aimaestro-agent.sh skill install my-agent ./path/to/skill-folder --scope project
  aimaestro-agent.sh skill install my-agent ./my-skill.skill --scope user
  aimaestro-agent.sh skill uninstall my-agent my-skill-name
  aimaestro-agent.sh skill uninstall my-agent my-skill-name --scope project
```

#### Subcommand: `plugin` -- COMPLETE

```
Usage: aimaestro-agent.sh plugin <subcommand> [options]

Manage Claude Code plugins for an agent.

Subcommands:
  install <agent> <plugin>     Install plugin (persistent)
  uninstall <agent> <plugin>   Uninstall plugin
  update <agent> <plugin>      Update plugin to latest version
  load <agent> <path>          Load plugin from local directory (session only)
  enable <agent> <plugin>      Enable a disabled plugin
  disable <agent> <plugin>     Disable plugin without uninstalling
  list <agent>                 List plugins for agent
  validate <agent> <path>      Validate plugin before install
  reinstall <agent> <plugin>   Uninstall + reinstall (preserves state)
  clean <agent>                Clean up corrupt/orphaned plugin data
  marketplace <action>         Manage marketplaces (add, list, remove, update)

Scopes (for install/uninstall/update/enable/disable/reinstall):
  --scope local      Only you, only this repo (.claude/plugins/, gitignored)
                     This is the default scope.
  --scope project    Shared with collaborators (.claude/settings.json, committed)
  --scope user       All your projects (~/.claude.json, user-global)

Plugin format:
  plugin-name@marketplace-name   Full qualified name
  plugin-name                    Short name (searched across marketplaces)

Examples:
  aimaestro-agent.sh plugin install my-agent feature-dev@my-marketplace
  aimaestro-agent.sh plugin install my-agent my-plugin --scope project
  aimaestro-agent.sh plugin install my-agent my-plugin --scope user
  aimaestro-agent.sh plugin load my-agent /path/to/plugin
  aimaestro-agent.sh plugin update my-agent my-plugin@my-marketplace
  aimaestro-agent.sh plugin uninstall my-agent feature-dev
  aimaestro-agent.sh plugin uninstall my-agent broken-plugin --force
  aimaestro-agent.sh plugin list my-agent
```

### list-agents.sh -- PARTIAL

No `--help` flag. Runs directly and lists agents. Accepts `--json` flag per header comment.

```
Usage: list-agents.sh [--json]

Lists all agents available for export.
Default output: formatted table with status indicators.
```

### agent-commands.sh -- LIBRARY

Sourced module (`CRUD commands: help, list, show, create, delete, update, rename, export, import`). Not a standalone command.

### agent-core.sh -- LIBRARY

Sourced module (`Shared infrastructure: temp files, security scanning, validation, Claude CLI helpers, and safe JSON editing`). Not a standalone command.

### agent-helper.sh -- LIBRARY

Sourced module (`Agent-specific utilities for aimaestro-agent.sh`). Not a standalone command.

### agent-plugin.sh -- LIBRARY

Sourced module (`Plugin management: dispatcher + 10 plugin subcommands + marketplace`). Not a standalone command.

### agent-session.sh -- LIBRARY

Sourced module (`Session lifecycle: add/remove/exec, hibernate, wake, restart`). Not a standalone command.

### agent-skill.sh -- LIBRARY

Sourced module (`Skill management: dispatcher + list/add/remove/install/uninstall`). Not a standalone command.

---

## 3. Docs Scripts (docs-*.sh)

### docs-find-by-type.sh -- COMPLETE

```
Usage: docs-find-by-type.sh <type>

Document types:
  function   - Function/method documentation
  class      - Class documentation
  module     - Module/namespace documentation
  interface  - Interface/type documentation
  component  - React/Vue component documentation
  constant   - Documented constants
  readme     - README files
  guide      - Guide/tutorial documentation
```

### docs-get.sh -- COMPLETE

```
Usage: docs-get.sh <doc-id>

Get a specific document with all its sections.
Find doc IDs using: docs-search.sh or docs-list.sh
```

### docs-index.sh -- COMPLETE

```
Usage: docs-index.sh [project-path]

Index documentation from a project directory.
If no path is provided, uses the agent's configured working directory.

This extracts documentation from:
  - JSDoc comments
  - RDoc comments
  - Python docstrings
  - TypeScript interfaces
  - README files
  - Markdown documentation
```

### docs-index-delta.sh -- COMPLETE

```
Usage: docs-index-delta.sh [project-path]

Delta index documentation from a project directory.
Only indexes new and modified files, skips unchanged files.

If no path is provided, uses the agent's configured working directory.

Benefits of delta indexing:
  - Much faster than full indexing
  - Only processes changed files
  - Preserves existing indexed content

Use 'docs-index.sh' for a full re-index.
```

### docs-list.sh -- COMPLETE

```
Usage: docs-list.sh [--limit N]

Options:
  --limit, -l N    Limit results (default: 50)
```

### docs-search.sh -- COMPLETE

```
Usage: docs-search.sh [options] <query>

Options:
  --keyword, -k    Use keyword search instead of semantic
  --limit, -l N    Limit results (default: 10)
  --help, -h       Show this help

Examples:
  docs-search.sh 'authentication flow'
  docs-search.sh --keyword authenticate
  docs-search.sh --limit 20 'database connection'
```

### docs-stats.sh -- PARTIAL

No `--help` flag. Runs directly and outputs statistics. No usage/options documentation.

```
(Runs immediately, outputs stats like:)
Documentation Index Statistics
==============================
documents: 0
sections: 0
chunks: 0
embeddings: 0
byType: {}
```

### docs-helper.sh -- LIBRARY

Sourced helper module (`Documentation Helper Functions`). Not a standalone command.

---

## 4. Graph Scripts (graph-*.sh)

### graph-describe.sh -- MISSING

No `--help` flag. Treats `--help` as a component name argument. Usage from behavior: `graph-describe.sh <component-name>`

### graph-find-associations.sh -- MISSING

No `--help` flag. Treats `--help` as a model name argument. Usage from behavior: `graph-find-associations.sh <model-name>`

### graph-find-by-type.sh -- MISSING

No `--help` flag. Treats `--help` as a type argument. Usage from behavior: `graph-find-by-type.sh <type>`

### graph-find-callees.sh -- MISSING

No `--help` flag. Treats `--help` as a function name argument. Usage from behavior: `graph-find-callees.sh <function-name>`

### graph-find-callers.sh -- MISSING

No `--help` flag. Treats `--help` as a function name argument. Usage from behavior: `graph-find-callers.sh <function-name>`

### graph-find-path.sh -- PARTIAL

Has usage text but triggers it by checking argument count, not `--help`. Duplicates output.

```
Usage: graph-find-path.sh <from-function> <to-function>

Find how one function eventually calls another.
Useful for tracing data flow and debugging.

Examples:
  graph-find-path.sh create_order send_email
  graph-find-path.sh login authenticate
```

### graph-find-related.sh -- MISSING

No `--help` flag. Treats `--help` as a component name argument. Usage from behavior: `graph-find-related.sh <component-name>`

### graph-find-serializers.sh -- MISSING

No `--help` flag. Treats `--help` as a model name argument. Usage from behavior: `graph-find-serializers.sh <model-name>`

### graph-index-delta.sh -- MISSING

No `--help` flag. Treats `--help` as a project path argument. Usage from behavior: `graph-index-delta.sh [project-path]`

### graph-helper.sh -- LIBRARY

Sourced helper module (`Graph Helper Functions`). Not a standalone command.

---

## 5. Memory Scripts (memory-*.sh)

### memory-search.sh -- COMPLETE

```
Usage: memory-search.sh <query> [options]

Search your conversation history for past discussions and context.

Options:
  --mode MODE    Search mode: hybrid (default), semantic, term, symbol
  --role ROLE    Filter by role: user, assistant
  --limit N      Limit results (default: 10)

Examples:
  memory-search.sh "authentication"           # Hybrid search
  memory-search.sh "component design" --mode semantic
  memory-search.sh "what did user ask" --role user
  memory-search.sh "previous solution" --limit 5
```

### memory-helper.sh -- LIBRARY

Sourced helper module (`Memory Search Helper Functions`). Not a standalone command.

---

## 6. Import/Export (export-agent.sh, import-agent.sh)

### export-agent.sh -- MISSING

No `--help` flag. Treats first argument as agent alias/ID directly. Usage from file header comment:

```
Usage: export-agent.sh <agent-alias-or-id> [output-dir]

Examples:
  export-agent.sh backend-api           # Export to current directory
  export-agent.sh backend-api ~/exports # Export to ~/exports/
  export-agent.sh 633f6cdc-4404-...     # Export by ID
```

### import-agent.sh -- COMPLETE

```
Usage: import-agent.sh <zip-file> [options]

Import an AI Maestro agent from a portable ZIP file.

Arguments:
  zip-file           Path to the agent export ZIP file

Options:
  --alias <name>     Override the agent alias
  --new-id           Generate a new agent ID instead of keeping original
  --skip-messages    Don't import messages
  --overwrite        Overwrite existing agent with same alias

Examples:
  import-agent.sh backend-api-export.zip
  import-agent.sh backend-api-export.zip --alias backend-api-v2
  import-agent.sh backend-api-export.zip --new-id --overwrite

Environment Variables:
  AIMAESTRO_API  API endpoint (auto-detected from running instance)
```

---

## Summary Table

| # | Script | Category | Help Quality |
|---|--------|----------|-------------|
| 1 | amp-delete.sh | AMP | COMPLETE |
| 2 | amp-download.sh | AMP | COMPLETE |
| 3 | amp-fetch.sh | AMP | COMPLETE |
| 4 | amp-identity.sh | AMP | COMPLETE |
| 5 | amp-inbox.sh | AMP | COMPLETE |
| 6 | amp-init.sh | AMP | COMPLETE |
| 7 | amp-read.sh | AMP | COMPLETE |
| 8 | amp-register.sh | AMP | COMPLETE |
| 9 | amp-reply.sh | AMP | COMPLETE |
| 10 | amp-send.sh | AMP | COMPLETE |
| 11 | amp-status.sh | AMP | PARTIAL (no examples) |
| 12 | amp-helper.sh | AMP | LIBRARY |
| 13 | amp-security.sh | AMP | LIBRARY |
| 14 | aimaestro-agent.sh | Agent | COMPLETE |
| 15 | aimaestro-agent.sh list | Agent | COMPLETE |
| 16 | aimaestro-agent.sh show | Agent | PARTIAL (no examples) |
| 17 | aimaestro-agent.sh create | Agent | COMPLETE |
| 18 | aimaestro-agent.sh delete | Agent | COMPLETE |
| 19 | aimaestro-agent.sh update | Agent | PARTIAL (no examples) |
| 20 | aimaestro-agent.sh rename | Agent | COMPLETE |
| 21 | aimaestro-agent.sh session | Agent | PARTIAL (no examples) |
| 22 | aimaestro-agent.sh hibernate | Agent | PARTIAL (minimal) |
| 23 | aimaestro-agent.sh wake | Agent | PARTIAL (no examples) |
| 24 | aimaestro-agent.sh skill | Agent | COMPLETE |
| 25 | aimaestro-agent.sh plugin | Agent | COMPLETE |
| 26 | list-agents.sh | Agent | PARTIAL (no --help flag) |
| 27 | agent-commands.sh | Agent | LIBRARY |
| 28 | agent-core.sh | Agent | LIBRARY |
| 29 | agent-helper.sh | Agent | LIBRARY |
| 30 | agent-plugin.sh | Agent | LIBRARY |
| 31 | agent-session.sh | Agent | LIBRARY |
| 32 | agent-skill.sh | Agent | LIBRARY |
| 33 | docs-find-by-type.sh | Docs | COMPLETE |
| 34 | docs-get.sh | Docs | COMPLETE |
| 35 | docs-index.sh | Docs | COMPLETE |
| 36 | docs-index-delta.sh | Docs | COMPLETE |
| 37 | docs-list.sh | Docs | COMPLETE |
| 38 | docs-search.sh | Docs | COMPLETE |
| 39 | docs-stats.sh | Docs | PARTIAL (no --help flag) |
| 40 | docs-helper.sh | Docs | LIBRARY |
| 41 | graph-describe.sh | Graph | MISSING |
| 42 | graph-find-associations.sh | Graph | MISSING |
| 43 | graph-find-by-type.sh | Graph | MISSING |
| 44 | graph-find-callees.sh | Graph | MISSING |
| 45 | graph-find-callers.sh | Graph | MISSING |
| 46 | graph-find-path.sh | Graph | PARTIAL (usage on wrong args only) |
| 47 | graph-find-related.sh | Graph | MISSING |
| 48 | graph-find-serializers.sh | Graph | MISSING |
| 49 | graph-index-delta.sh | Graph | MISSING |
| 50 | graph-helper.sh | Graph | LIBRARY |
| 51 | memory-search.sh | Memory | COMPLETE |
| 52 | memory-helper.sh | Memory | LIBRARY |
| 53 | export-agent.sh | Import/Export | MISSING (usage in header only) |
| 54 | import-agent.sh | Import/Export | COMPLETE |

### Totals (excluding LIBRARY modules)

| Rating | Count | Scripts |
|--------|-------|---------|
| COMPLETE | 27 | amp-delete, amp-download, amp-fetch, amp-identity, amp-inbox, amp-init, amp-read, amp-register, amp-reply, amp-send, aimaestro-agent (main + list, create, delete, rename, skill, plugin), docs-find-by-type, docs-get, docs-index, docs-index-delta, docs-list, docs-search, memory-search, import-agent |
| PARTIAL | 9 | amp-status, aimaestro-agent (show, update, session, hibernate, wake), list-agents, docs-stats, graph-find-path |
| MISSING | 8 | graph-describe, graph-find-associations, graph-find-by-type, graph-find-callees, graph-find-callers, graph-find-related, graph-find-serializers, graph-index-delta, export-agent |
| LIBRARY | 10 | amp-helper, amp-security, agent-commands, agent-core, agent-helper, agent-plugin, agent-session, agent-skill, docs-helper, graph-helper, memory-helper |

### Key Findings

1. **AMP scripts** are the best documented -- 10 of 11 standalone scripts have COMPLETE help screens.
2. **Graph scripts** are the worst -- 7 of 8 standalone scripts have NO help at all (they treat `--help` as a regular argument).
3. **Agent CLI** (`aimaestro-agent.sh`) is well documented at the top level and for major subcommands, but 5 subcommands (show, update, session, hibernate, wake) have minimal/partial help.
4. **export-agent.sh** has no `--help` handling despite `import-agent.sh` having complete help.
5. **10 scripts** are sourced library modules (not standalone commands) and correctly produce no help output.
