/**
 * Help Service
 *
 * Pure business logic extracted from app/api/help/agent/route.ts.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   POST   /api/help/agent   -> createAssistantAgent
 *   DELETE /api/help/agent   -> deleteAssistantAgent
 *   GET    /api/help/agent   -> getAssistantStatus
 */

import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getAgentByName, createAgent, deleteAgent } from '@/lib/agent-registry'
import { parseNameForDisplay } from '@/types/agent'
import { getRuntime } from '@/lib/agent-runtime'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number  // HTTP-like status code for the route to use
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSISTANT_NAME = '_aim-assistant'
const ASSISTANT_LABEL = 'AI Maestro Assistant'

// Cheapest model for help queries -- fast and affordable
const ASSISTANT_MODEL = 'haiku'

// Read-only tools -- the assistant can search and read but never modify anything
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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Check if the assistant tmux session exists.
 */
async function assistantSessionExists(): Promise<boolean> {
  const runtime = getRuntime()
  return runtime.sessionExists(ASSISTANT_NAME)
}

// ===========================================================================
// PUBLIC API -- called by API routes
// ===========================================================================

/**
 * Create or return existing assistant agent.
 */
export async function createAssistantAgent(): Promise<ServiceResult<{
  success: boolean
  agentId: string
  name: string
  status: string
  created: boolean
}>> {
  try {
    // Check if assistant agent already exists in registry
    let agent = getAgentByName(ASSISTANT_NAME)
    const sessionExists = await assistantSessionExists()

    if (agent && sessionExists) {
      // Already running -- return it
      return {
        data: {
          success: true,
          agentId: agent.id,
          name: ASSISTANT_NAME,
          status: 'online',
          created: false,
        },
        status: 200,
      }
    }

    // Clean up stale agent if session is gone
    if (agent && !sessionExists) {
      try { deleteAgent(agent.id) } catch { /* ignore */ }
      agent = null
    }

    // Create tmux session in the AI Maestro project directory
    const runtime = getRuntime()
    const cwd = process.cwd()
    await runtime.createSession(ASSISTANT_NAME, cwd)

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
    await runtime.unsetEnvironment(ASSISTANT_NAME, 'CLAUDECODE')
    await runtime.sendKeys(ASSISTANT_NAME, '"unset CLAUDECODE"', { enter: true })

    // Small delay for env to take effect
    await new Promise(resolve => setTimeout(resolve, 300))

    // Write system prompt to a temp file (avoids shell escaping issues with long prompts)
    const promptFile = join(tmpdir(), 'aim-assistant-prompt.txt')
    writeFileSync(promptFile, SYSTEM_PROMPT)

    // Launch claude with read-only tools and bypass permissions
    const launchCmd = `claude --model ${ASSISTANT_MODEL} --tools ${ASSISTANT_TOOLS} --permission-mode bypassPermissions --system-prompt "$(cat ${promptFile})"`
    await runtime.sendKeys(ASSISTANT_NAME, launchCmd, { literal: true, enter: true })

    return {
      data: {
        success: true,
        agentId: agent.id,
        name: ASSISTANT_NAME,
        status: 'starting',
        created: true,
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Help Agent] Failed to create assistant:', error)
    return {
      data: {
        success: false,
        agentId: '',
        name: ASSISTANT_NAME,
        status: 'error',
        created: false,
      },
      error: error instanceof Error ? error.message : 'Failed to create assistant',
      status: 500,
    }
  }
}

/**
 * Kill assistant agent and clean up.
 */
export async function deleteAssistantAgent(): Promise<ServiceResult<{ success: boolean }>> {
  try {
    // Kill tmux session
    const runtime = getRuntime()
    const sessionExists = await assistantSessionExists()
    if (sessionExists) {
      try { await runtime.killSession(ASSISTANT_NAME) } catch { /* ignore */ }
    }

    // Remove from agent registry
    const agent = getAgentByName(ASSISTANT_NAME)
    if (agent) {
      try { deleteAgent(agent.id) } catch { /* ignore */ }
    }

    return { data: { success: true }, status: 200 }
  } catch (error) {
    console.error('[Help Agent] Failed to delete assistant:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to delete assistant',
      status: 500,
    }
  }
}

/**
 * Check assistant agent status.
 */
export async function getAssistantStatus(): Promise<ServiceResult<{
  success: boolean
  agentId: string | null
  name: string
  status: string
}>> {
  try {
    const agent = getAgentByName(ASSISTANT_NAME)
    const sessionExists = await assistantSessionExists()

    if (agent && sessionExists) {
      return {
        data: {
          success: true,
          agentId: agent.id,
          name: ASSISTANT_NAME,
          status: 'online',
        },
        status: 200,
      }
    }

    return {
      data: {
        success: true,
        agentId: null,
        name: ASSISTANT_NAME,
        status: 'offline',
      },
      status: 200,
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}
