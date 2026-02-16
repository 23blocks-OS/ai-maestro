/**
 * Help Agent API
 *
 * POST /api/help/agent - Create or return existing AI Maestro assistant agent
 * DELETE /api/help/agent - Kill the assistant agent and clean up
 *
 * The assistant is a regular Claude Code agent launched in the AI Maestro project
 * directory with access to all docs, README, and source code. It uses the user's
 * own subscription — no separate API key needed.
 */

import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getAgentByName, createAgent, deleteAgent } from '@/lib/agent-registry'
import { parseNameForDisplay } from '@/types/agent'

const execAsync = promisify(exec)

const ASSISTANT_NAME = '_aim-assistant'
const ASSISTANT_LABEL = 'AI Maestro Assistant'

// Cheapest model for help queries — fast and affordable
const ASSISTANT_MODEL = 'haiku'

// Read-only tools — the assistant can search and read but never modify anything
const ASSISTANT_TOOLS = 'Read,Glob,Grep'

// System prompt that gives the assistant its personality and focus
const SYSTEM_PROMPT = `You are the AI Maestro built-in help assistant. Help users learn and use AI Maestro effectively.

IMPORTANT RULES:
- You are READ-ONLY. You can read files but NEVER write, edit, or execute commands.
- Be concise — users want quick answers, not essays. Keep responses under 200 words unless they ask for detail.
- When answering, READ the relevant docs first. Don't guess.

KEY DOCUMENTATION FILES (read these to answer questions):
- README.md — Project overview, quick start, features
- CLAUDE.md — Architecture, patterns, technical details
- docs/QUICKSTART.md — Installation and setup guide
- docs/CONCEPTS.md — Core concepts explained
- docs/AGENT-MESSAGING-GUIDE.md — AMP messaging between agents
- docs/SETUP-TUTORIAL.md — Multi-machine setup
- docs/NETWORK-ACCESS.md — Network configuration
- docs/OPERATIONS-GUIDE.md — Day-to-day operations
- docs/TROUBLESHOOTING.md — Common issues and fixes
- docs/AGENT-INTELLIGENCE.md — Memory, code graph, docs
- docs/CEREBELLUM.md — Cerebellum subsystem
- docs/WINDOWS-INSTALLATION.md — Windows/WSL2 setup
- lib/tutorialData.ts — Interactive tutorials content
- lib/glossaryData.ts — Glossary of terms

TOPICS YOU HELP WITH:
- Setting up AI Maestro and adding machines to the mesh
- Creating and managing AI agents (any AI tool: Claude Code, Aider, Cursor, etc.)
- Agent Messaging Protocol (AMP) — sending messages between agents
- Team meetings, task boards, and collaboration features
- Terminal management, tmux sessions, and troubleshooting
- Plugin development and customization
- Multi-machine peer mesh networking

Start by greeting the user: "Hi! I'm the AI Maestro assistant. What can I help you with?"`

/**
 * Check if the assistant tmux session exists
 */
async function assistantSessionExists(): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `tmux has-session -t "${ASSISTANT_NAME}" 2>&1 || echo "not_found"`
    )
    return !stdout.includes('not_found')
  } catch {
    return false
  }
}

/**
 * POST - Create or return existing assistant agent
 */
export async function POST() {
  try {
    // Check if assistant agent already exists in registry
    let agent = getAgentByName(ASSISTANT_NAME)
    const sessionExists = await assistantSessionExists()

    if (agent && sessionExists) {
      // Already running — return it
      return NextResponse.json({
        success: true,
        agentId: agent.id,
        name: ASSISTANT_NAME,
        status: 'online',
        created: false,
      })
    }

    // Clean up stale agent if session is gone
    if (agent && !sessionExists) {
      try { deleteAgent(agent.id) } catch { /* ignore */ }
      agent = null
    }

    // Create tmux session in the AI Maestro project directory
    const cwd = process.cwd()
    await execAsync(`tmux new-session -d -s "${ASSISTANT_NAME}" -c "${cwd}"`)

    // Register agent in registry
    if (!agent) {
      const { tags } = parseNameForDisplay(ASSISTANT_NAME)
      agent = createAgent({
        name: ASSISTANT_NAME,
        label: ASSISTANT_LABEL,
        program: 'claude-code',
        taskDescription: 'Built-in help assistant for AI Maestro',
        tags,
        owner: 'system',
        createSession: true,
        workingDirectory: cwd,
        programArgs: '',
      })
    }

    // Unset CLAUDECODE env to avoid nested-session detection
    await execAsync(`tmux set-environment -t "${ASSISTANT_NAME}" -r CLAUDECODE 2>/dev/null || true`)
    await execAsync(`tmux send-keys -t "${ASSISTANT_NAME}" "unset CLAUDECODE" Enter`)

    // Small delay for env to take effect
    await new Promise(resolve => setTimeout(resolve, 300))

    // Write system prompt to a temp file (avoids shell escaping issues with long prompts)
    const promptFile = join(tmpdir(), 'aim-assistant-prompt.txt')
    writeFileSync(promptFile, SYSTEM_PROMPT)

    // Launch claude with:
    // --model haiku          → cheapest model, fast responses
    // --tools Read,Glob,Grep → read-only, no write/edit/bash
    // --permission-mode bypassPermissions → no approval prompts for reads
    // --system-prompt        → help-focused instructions
    const launchCmd = `claude --model ${ASSISTANT_MODEL} --tools ${ASSISTANT_TOOLS} --permission-mode bypassPermissions --system-prompt "$(cat ${promptFile})"`
    await execAsync(`tmux send-keys -t "${ASSISTANT_NAME}" '${launchCmd}' Enter`)

    return NextResponse.json({
      success: true,
      agentId: agent.id,
      name: ASSISTANT_NAME,
      status: 'starting',
      created: true,
    })
  } catch (error) {
    console.error('[Help Agent] Failed to create assistant:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to create assistant' },
      { status: 500 }
    )
  }
}

/**
 * DELETE - Kill assistant agent and clean up
 */
export async function DELETE() {
  try {
    // Kill tmux session
    const sessionExists = await assistantSessionExists()
    if (sessionExists) {
      await execAsync(`tmux kill-session -t "${ASSISTANT_NAME}" 2>/dev/null || true`)
    }

    // Remove from agent registry
    const agent = getAgentByName(ASSISTANT_NAME)
    if (agent) {
      try { deleteAgent(agent.id) } catch { /* ignore */ }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Help Agent] Failed to delete assistant:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete assistant' },
      { status: 500 }
    )
  }
}

/**
 * GET - Check assistant agent status
 */
export async function GET() {
  try {
    const agent = getAgentByName(ASSISTANT_NAME)
    const sessionExists = await assistantSessionExists()

    if (agent && sessionExists) {
      return NextResponse.json({
        success: true,
        agentId: agent.id,
        name: ASSISTANT_NAME,
        status: 'online',
      })
    }

    return NextResponse.json({
      success: true,
      agentId: null,
      name: ASSISTANT_NAME,
      status: 'offline',
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
