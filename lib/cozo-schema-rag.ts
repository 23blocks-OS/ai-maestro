/**
 * RAG Schema Extension for AI Maestro Agent Memory
 *
 * Extends the existing simple schema with:
 * - Message embeddings (dense vectors for semantic search)
 * - Message terms (keywords for BM25 lexical search)
 * - Code symbols (identifiers extracted from code blocks)
 * - Code graph (files, functions, components, services, APIs)
 * - Database schema graph (tables, columns, relationships)
 */

import { AgentDatabase } from './cozo-db'

/**
 * Initialize RAG extensions to the existing agent memory schema
 */
export async function initializeRagSchema(agentDb: AgentDatabase): Promise<void> {
  console.log('[SCHEMA-RAG] Initializing RAG extensions...')

  // ============================================================================
  // MESSAGE INDEXING TABLES
  // ============================================================================

  // Messages table - stores actual message content
  try {
    await agentDb.run(`
      :create messages {
        msg_id: String
        =>
        conversation_file: String,
        role: String,
        ts: Int,
        text: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created messages table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ messages table already exists')
    } else {
      throw error
    }
  }

  // Message embeddings - 384-d vectors for semantic search
  try {
    await agentDb.run(`
      :create msg_vec {
        msg_id: String
        =>
        vec: Bytes
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created msg_vec table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ msg_vec table already exists')
    } else {
      throw error
    }
  }

  // Message terms - keywords for BM25 search
  try {
    await agentDb.run(`
      :create msg_terms {
        msg_id: String,
        term: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created msg_terms table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ msg_terms table already exists')
    } else {
      throw error
    }
  }

  // Code symbols - identifiers from code blocks
  try {
    await agentDb.run(`
      :create code_symbols {
        msg_id: String,
        symbol: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created code_symbols table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ code_symbols table already exists')
    } else {
      throw error
    }
  }

  // ============================================================================
  // CODE GRAPH TABLES
  // ============================================================================

  // Files
  try {
    await agentDb.run(`
      :create files {
        file_id: String
        =>
        path: String,
        module: String,
        project_path: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created files table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ files table already exists')
    } else {
      throw error
    }
  }

  // Functions
  try {
    await agentDb.run(`
      :create functions {
        fn_id: String
        =>
        name: String,
        file_id: String,
        is_export: Bool,
        lang: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created functions table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ functions table already exists')
    } else {
      throw error
    }
  }

  // Components
  try {
    await agentDb.run(`
      :create components {
        component_id: String
        =>
        name: String,
        file_id: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created components table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ components table already exists')
    } else {
      throw error
    }
  }

  // Services
  try {
    await agentDb.run(`
      :create services {
        service_id: String
        =>
        name: String,
        file_id: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created services table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ services table already exists')
    } else {
      throw error
    }
  }

  // APIs
  try {
    await agentDb.run(`
      :create apis {
        api_id: String
        =>
        method: String,
        path: String,
        service_id: String?
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created apis table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ apis table already exists')
    } else {
      throw error
    }
  }

  // ============================================================================
  // CODE GRAPH EDGES
  // ============================================================================

  // File declares function
  try {
    await agentDb.run(`
      :create declares {
        file_id: String,
        fn_id: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created declares table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ declares table already exists')
    } else {
      throw error
    }
  }

  // File imports file
  try {
    await agentDb.run(`
      :create imports {
        from_file: String,
        to_file: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created imports table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ imports table already exists')
    } else {
      throw error
    }
  }

  // Function calls function
  try {
    await agentDb.run(`
      :create calls {
        caller_fn: String,
        callee_fn: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created calls table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ calls table already exists')
    } else {
      throw error
    }
  }

  // ============================================================================
  // DATABASE SCHEMA GRAPH TABLES
  // ============================================================================

  // Database nodes
  try {
    await agentDb.run(`
      :create db_node {
        id: String
        =>
        name: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created db_node table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ db_node table already exists')
    } else {
      throw error
    }
  }

  // Schema nodes
  try {
    await agentDb.run(`
      :create schema_node {
        id: String
        =>
        name: String,
        db: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created schema_node table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ schema_node table already exists')
    } else {
      throw error
    }
  }

  // Table nodes
  try {
    await agentDb.run(`
      :create table_node {
        id: String
        =>
        name: String,
        schema: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created table_node table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ table_node table already exists')
    } else {
      throw error
    }
  }

  // Column nodes
  try {
    await agentDb.run(`
      :create column_node {
        id: String
        =>
        name: String,
        table: String,
        data_type: String,
        udt: String,
        nullable: Bool,
        default: String?
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created column_node table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ column_node table already exists')
    } else {
      throw error
    }
  }

  // Index nodes
  try {
    await agentDb.run(`
      :create index_node {
        id: String
        =>
        name: String,
        table: String,
        is_unique: Bool,
        method: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created index_node table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ index_node table already exists')
    } else {
      throw error
    }
  }

  // Constraint nodes
  try {
    await agentDb.run(`
      :create constraint_node {
        id: String
        =>
        name: String,
        table: String,
        kind: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created constraint_node table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ constraint_node table already exists')
    } else {
      throw error
    }
  }

  // View nodes
  try {
    await agentDb.run(`
      :create view_node {
        id: String
        =>
        name: String,
        schema: String,
        definition: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created view_node table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ view_node table already exists')
    } else {
      throw error
    }
  }

  // Enum nodes
  try {
    await agentDb.run(`
      :create enum_node {
        id: String
        =>
        name: String,
        schema: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created enum_node table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ enum_node table already exists')
    } else {
      throw error
    }
  }

  // Enum values
  try {
    await agentDb.run(`
      :create enum_value {
        id: String
        =>
        enum_id: String,
        value: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created enum_value table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ enum_value table already exists')
    } else {
      throw error
    }
  }

  // Procedure nodes
  try {
    await agentDb.run(`
      :create proc_node {
        id: String
        =>
        name: String,
        schema: String,
        kind: String,
        lang: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created proc_node table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ proc_node table already exists')
    } else {
      throw error
    }
  }

  // Foreign key edges
  try {
    await agentDb.run(`
      :create fk_edge {
        src_table: String,
        src_col: String,
        dst_table: String,
        dst_col: String,
        on_delete: String,
        on_update: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created fk_edge table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ fk_edge table already exists')
    } else {
      throw error
    }
  }

  // Index contains columns
  try {
    await agentDb.run(`
      :create index_on {
        index: String,
        column: String
      }
    `)
    console.log('[SCHEMA-RAG] ✓ Created index_on table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA-RAG] ℹ index_on table already exists')
    } else {
      throw error
    }
  }

  console.log('[SCHEMA-RAG] ✅ RAG extensions initialized')
}

/**
 * Upsert a message with embeddings and terms
 */
export async function upsertMessage(
  agentDb: AgentDatabase,
  message: {
    msg_id: string
    conversation_file: string
    role: 'user' | 'assistant' | 'system'
    ts: number
    text: string
  },
  embedding?: Buffer,
  terms?: string[],
  symbols?: string[]
): Promise<void> {
  // Escape single quotes for file paths
  const escapeString = (str: string) => str.replace(/'/g, "''")

  // Convert text to Base64 to avoid escaping issues
  const base64Text = Buffer.from(message.text, 'utf-8').toString('base64')

  // Insert message
  await agentDb.run(`
    ?[msg_id, conversation_file, role, ts, text] <- [[
      '${message.msg_id}',
      '${escapeString(message.conversation_file)}',
      '${message.role}',
      ${message.ts},
      to_string(decode_base64('${base64Text}'))
    ]]
    :put messages
  `)

  // Insert embedding if provided
  if (embedding) {
    // Convert buffer to Base64 for safe insertion
    const base64Vec = embedding.toString('base64')
    await agentDb.run(`
      ?[msg_id, vec] <- [[
        '${message.msg_id}',
        decode_base64('${base64Vec}')
      ]]
      :put msg_vec
    `)
  }

  // Insert terms if provided
  if (terms && terms.length > 0) {
    const termRows = terms.map((term) => `['${message.msg_id}', '${escapeString(term)}']`).join(',\n      ')
    await agentDb.run(`
      ?[msg_id, term] <- [
        ${termRows}
      ]
      :put msg_terms {msg_id, term}
    `)
  }

  // Insert symbols if provided
  if (symbols && symbols.length > 0) {
    const symbolRows = symbols.map((symbol) => `['${message.msg_id}', '${escapeString(symbol)}']`).join(',\n      ')
    await agentDb.run(`
      ?[msg_id, symbol] <- [
        ${symbolRows}
      ]
      :put code_symbols {msg_id, symbol}
    `)
  }
}

/**
 * Search messages by cosine similarity
 * Note: CozoDB doesn't have built-in vector similarity, so this returns all vectors
 * and similarity computation happens in memory
 */
export async function getMessageVectors(agentDb: AgentDatabase): Promise<Array<{ msg_id: string; vec: Buffer }>> {
  const result = await agentDb.run(`
    ?[msg_id, vec] := *msg_vec{msg_id, vec}
  `)

  return result.rows.map((row: any[]) => ({
    msg_id: row[0],
    vec: row[1],
  }))
}

/**
 * Get messages by IDs
 */
export async function getMessagesByIds(
  agentDb: AgentDatabase,
  msgIds: string[]
): Promise<Array<{
  msg_id: string
  conversation_file: string
  role: string
  ts: number
  text: string
}>> {
  if (msgIds.length === 0) return []

  const ids = msgIds.map((id) => `'${id}'`).join(', ')
  const result = await agentDb.run(`
    ?[msg_id, conversation_file, role, ts, text] :=
      *messages{msg_id, conversation_file, role, ts, text},
      is_in(msg_id, [${ids}])
  `)

  return result.rows.map((row: any[]) => ({
    msg_id: row[0],
    conversation_file: row[1],
    role: row[2],
    ts: row[3],
    text: row[4],
  }))
}

/**
 * Search messages by term (BM25-style keyword search)
 */
export async function searchMessagesByTerm(
  agentDb: AgentDatabase,
  term: string
): Promise<Array<{ msg_id: string }>> {
  const result = await agentDb.run(`
    ?[msg_id] := *msg_terms{msg_id, term}, term = '${term.toLowerCase()}'
  `)

  return result.rows.map((row: any[]) => ({
    msg_id: row[0],
  }))
}

/**
 * Search messages by code symbol
 */
export async function searchMessagesBySymbol(
  agentDb: AgentDatabase,
  symbol: string
): Promise<Array<{ msg_id: string }>> {
  const result = await agentDb.run(`
    ?[msg_id] := *code_symbols{msg_id, symbol}, symbol = '${symbol}'
  `)

  return result.rows.map((row: any[]) => ({
    msg_id: row[0],
  }))
}
