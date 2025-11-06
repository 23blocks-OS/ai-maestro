#!/usr/bin/env node

// Script to initialize memory for all agents
const API_BASE = 'http://localhost:23000'

async function initAllAgents() {
  try {
    // Fetch all sessions
    const sessionsRes = await fetch(`${API_BASE}/api/sessions`)
    const sessionsData = await sessionsRes.json()

    // Get unique agent IDs
    const agentIds = [...new Set(
      sessionsData.sessions
        .map(s => s.agentId)
        .filter(id => id)
    )]

    console.log(`Found ${agentIds.length} unique agents`)

    // Initialize all agents in parallel (batches of 5 to avoid overwhelming)
    const batchSize = 5
    for (let i = 0; i < agentIds.length; i += batchSize) {
      const batch = agentIds.slice(i, i + batchSize)
      console.log(`\nInitializing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(agentIds.length / batchSize)}...`)

      await Promise.all(
        batch.map(async (agentId) => {
          try {
            const response = await fetch(`${API_BASE}/api/agents/${agentId}/memory`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ populateFromSessions: true })
            })
            const data = await response.json()
            console.log(`✓ ${agentId.substring(0, 8)}: ${data.message || data.error}`)
          } catch (error) {
            console.error(`✗ ${agentId.substring(0, 8)}: ${error.message}`)
          }
        })
      )
    }

    console.log('\n✅ All agents initialized!')
  } catch (error) {
    console.error('Failed to initialize agents:', error)
    process.exit(1)
  }
}

initAllAgents()
