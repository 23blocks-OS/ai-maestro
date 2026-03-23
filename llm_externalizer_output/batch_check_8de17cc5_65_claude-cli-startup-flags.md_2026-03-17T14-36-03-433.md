# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:36:03.433Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/docs_dev/anthropic_official_documentation/claude-cli-startup-flags.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```markdown
/Users/emanuelesabetta/ai-maestro/docs_dev/anthropic_official_documentation/claude-cli-startup-flags.md
Line 1: # Claude Code CLI Startup Flags Reference
Line 3: A comprehensive reference of all available command-line flags when launching Claude Code from the terminal.
Line 5: <td><a href="../">← Back to Claude Code Best Practice</a></td>
Line 5: <td align="right"><img src="../!/claude-jumping.svg" alt="Claude" width="60" /></td>
Line 107: | `--permission-prompt-tool <TOOL>` | | Specify MCP tool to handle permission prompts in non-interactive mode |
Line 129: | `--agent <NAME>` | | Specify an agent for the current session |
Line 131: | `--agents <JSON>` | | Define custom subagents dynamically via JSON |
Line 137: | `--mcp-config <PATH\|JSON>` | | Load MCP servers from JSON file or string |
Line 139: | `--strict-mcp-config` | | Only use MCP servers from `--mcp-config`, ignore all others |
Line 151: | `--add-dir <PATH>` | | Add additional working directories for Claude to access |
Line 153: | `--worktree` | `-w` | Start Claude in an isolated git worktree (branched from HEAD) |
Line 171: | `--chrome` | | Enable Chrome browser integration for web automation |
Line 173: | `--no-chrome` | | Disable Chrome browser integration for this session |
Line 175: | `--ide` | | Automatically connect to IDE on startup if exactly one valid IDE available |
Line 183: | `--init` | | Run initialization hooks and start interactive mode |
Line 185: | `--init-only` | | Run initialization hooks and exit (no interactive session) |
Line 187: | `--maintenance` | | Run maintenance hooks and exit |
Line 195: | `--debug <CATEGORIES>` | | Enable debug mode with optional category filtering (e.g., `"api,hooks"`) |
Line 203: | `--settings <PATH\|JSON>` | | Path to settings JSON file or JSON string to load |
Line 205: | `--setting-sources <LIST>` | | Comma-separated list of sources to load: `user`, `project`, `local` |
Line 207: | `--disable-slash-commands` | | Disable all skills and slash commands for this session |
Line 219: | `claude` | Start interactive REPL |
Line 221: | `claude "query"` | Start REPL with initial prompt |
Line 223: | `claude update` | Update to latest version |
Line 225: | `claude mcp` | Configure MCP servers (`add`, `remove`, `list`, `get`, `enable`) |
Line 227: | `claude doctor` | Run diagnostics from the command line |
Line 233: These environment variables modify Claude Code behavior at startup:
Line 237: | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | Enable experimental agent teams |
Line 239: | `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` | Disable experimental beta features |
Line 241: | `CLAUDE_CODE_TMPDIR` | Override temp directory for internal files |
Line 243: | `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | Disable background task functionality |
Line 245: | `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` | Enable additional directory CLAUDE.md loading |
Line 249: | `MAX_THINKING_TOKENS` | Limit thinking token budget (set to `0` to disable) |
Line 251: | `CLAUDE_CODE_EFFORT_LEVEL` | Control thinking depth: `low`, `medium`, `high` |
Line 253: | `USE_BUILTIN_RIPGREP=0` | Use system ripgrep instead of built-in (Alpine Linux) |
Line 255: | `CLAUDE_CODE_ENABLE_TASKS=false` | Disable new task management system, revert to old todos |
Line 257: | `CLAUDE_CODE_SHELL` | Override automatic shell detection |
Line 259: | `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` | Override default file read token limit |
Line 261: | `CLAUDE_CODE_EXIT_AFTER_STOP_DELAY` | Auto-exit SDK mode after idle duration (ms) |
Line 263: | `CLAUDE_CODE_SIMPLE` | Enable simple mode (Bash + Edit tools only) |
Line 265: | `CLAUDE_BASH_NO_LOGIN=1` | Skip login shell for BashTool |
Line 269: - [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
Line 270: - [Claude Code Headless Mode](https://code.claude.com/docs/en/headless)
Line 271: - [Claude Code Setup](https://code.claude.com/docs/en/setup)
Line 272: - [Claude Code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
Line 273: - [Claude Code Common Workflows](https://code.claude.com/docs/en/common-workflows)
```