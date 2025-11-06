# Graph Database Technology Decision

**Author:** AI Maestro Development Team
**Date:** 2025-11-03
**Status:** Approved
**Decision:** Use CozoDB for agent databases

---

## Executive Summary

After comprehensive research into embedded graph databases, we've decided to use **CozoDB** for AI Maestro agent intelligence storage (conversations, vectors, and knowledge graphs).

**Key Decision Factors:**
1. Real graph database with native Datalog queries (not SQL emulation)
2. Embedded like SQLite (perfect for agent portability)
3. Vector search + full-text search built-in (all-in-one solution)
4. More mature than alternatives (3 years development vs alpha)
5. Query language is hidden implementation detail (doesn't affect user adoption)

---

## Technology Comparison

### Options Evaluated

| Database | Query Language | Status | Embedded | Vector Search | Verdict |
|----------|---------------|--------|----------|---------------|---------|
| **CozoDB** | Datalog | v0.7 (pre-1.0) | ✅ Yes | ✅ Built-in | ⭐⭐⭐ **SELECTED** |
| sqlite-graph | Cypher | Alpha v0.1.0 | ✅ Yes | ❌ No | Good alternative if Cypher required |
| LevelGraph | Triples | Stable | ✅ Yes | ❌ No | Too basic |
| Memgraph | Cypher | Production | ❌ Server | ❌ No | Not embedded |
| NebulaGraph | nGQL | Production | ❌ Cluster | ❌ No | Overkill |
| Pure SQLite | SQL CTEs | Stable | ✅ Yes | ⚠️ Extension | ❌ Not a real graph DB |

---

## Why CozoDB Won

### 1. All-in-One Solution

```
BEFORE (multiple dependencies):
  ├── SQLite (relational data)
  ├── sqlite-vss (vector search extension)
  └── sqlite-graph (graph queries, alpha)

AFTER (single dependency):
  └── CozoDB
      ├── Relational tables ✅
      ├── Vector search (HNSW) ✅
      ├── Graph queries (Datalog) ✅
      └── Full-text search (FTS) ✅
```

**Impact:** Simpler installation, fewer moving parts, single database file per agent.

### 2. Real Graph Database

**CozoDB uses Datalog** - a declarative logic programming language designed for recursive queries and relationships.

**Example - Find dependencies (any depth):**

```datalog
// Datalog (CozoDB) - 8 lines, natural recursion
dep[path, depth] := *files{path: 'src/auth.ts'}, depth = 0
dep[to_path, new_depth] := dep[from_path, depth],
                            *relationships{from: from_path, to: to_path},
                            new_depth = depth + 1,
                            new_depth <= 3
?[path, depth] := dep[path, depth]
:order depth
```

vs

```sql
-- Pure SQLite (recursive CTE) - 16 lines, complex joins
WITH RECURSIVE deps AS (
  SELECT target_id, 1 as depth
  FROM relationships
  WHERE source_id = (SELECT id FROM entities WHERE name = 'auth.ts')

  UNION ALL

  SELECT r.target_id, d.depth + 1
  FROM relationships r
  JOIN deps d ON r.source_id = d.target_id
  WHERE d.depth < 3
)
SELECT DISTINCT e.name, MIN(d.depth) as depth
FROM deps d
JOIN entities e ON d.target_id = e.id
GROUP BY e.id
ORDER BY depth;
```

**Verdict:** Datalog is more concise and naturally expresses graph traversal.

### 3. Maturity & Stability

| Metric | CozoDB | sqlite-graph |
|--------|--------|-------------|
| **First Release** | 2022 | 2024 |
| **Current Version** | v0.7 | v0.1.0-alpha |
| **Production v1.0** | TBD | 2027 |
| **Active Development** | 3+ years | Brand new |
| **Language Support** | 10+ languages | Python, limited Node.js |
| **GitHub Stars** | 1.8K+ | New project |
| **Production Use** | Yes (early adopters) | No (alpha) |

**Verdict:** CozoDB is more mature despite being pre-1.0.

### 4. Embedded Architecture

```
~/.aimaestro/agents/{agent-id}/
├── config.json          # Agent metadata
└── agent.db             # CozoDB database (single file!)
    ├── Conversations    # Message history
    ├── Vectors          # Embeddings (HNSW)
    ├── Knowledge graph  # Entities & relationships
    └── Full-text index  # Keyword search
```

**Benefits:**
- ✅ Agent is fully self-contained
- ✅ Transfer agent → customer gets everything
- ✅ No server setup required
- ✅ Works offline
- ✅ Backup = copy one file

### 5. Language Support

**CozoDB supports:**
- Node.js (native) ✅
- Python (pycozo) ✅
- Rust (native) ✅
- Go ✅
- Java/JVM ✅
- Swift (iOS/macOS) ✅
- Android ✅
- WebAssembly ✅
- C/FFI ✅

**sqlite-graph supports:**
- Python (primary) ✅
- Node.js (limited) ⚠️

**Verdict:** CozoDB has much broader ecosystem.

---

## Addressing Concerns

### Concern 1: "Datalog is another syntax to learn"

**TRUE** - Datalog is different from Cypher.

**BUT:**
1. **Hidden implementation detail** - Users never see Datalog
2. **API abstraction** - Developers use our JavaScript API, not raw Datalog
3. **One-time learning cost** - Your team learns it once
4. **Better documentation** - CozoDB has excellent tutorials
5. **Natural for AI** - LLMs can generate Datalog queries easily

**Comparison:**

| If you know... | Learning Datalog is... |
|---------------|----------------------|
| SQL | Medium difficulty |
| Prolog | Easy |
| Cypher | Medium difficulty |
| No query languages | Same as learning Cypher |

**Example - Simple query in both:**

```cypher
// Cypher (sqlite-graph)
MATCH (f:File {name: 'auth.ts'})-[:IMPORTS]->(dep)
RETURN dep.name
```

```datalog
// Datalog (CozoDB)
?[dep_name] := *files{name: 'auth.ts'},
               *imports{from: 'auth.ts', to: dep_name}
```

**Not dramatically different.**

### Concern 2: "Will Datalog hurt adoption?"

**NO** - Because:

1. **Users never write queries** - They use the UI or ask in natural language
2. **Implementation detail** - Like how GitHub uses MySQL internally
3. **Contributors are rare** - Most projects have <5 active contributors
4. **Can abstract** - Provide query builder or API layer

**Industry examples of "obscure" tech that succeeded:**
- Logseq uses Datascript (Datalog) - 25K+ GitHub stars
- Datomic uses Datalog - Used by enterprises
- Kafka uses custom protocols - Doesn't hurt adoption
- Redis uses custom commands - Everyone uses it anyway

**Marketing message:**
"AI Maestro uses advanced knowledge graph technology with vector embeddings"

→ Nobody asks what query language it uses internally.

### Concern 3: "Pre-1.0 software is risky"

**TRUE** - But mitigated:

**Risk Mitigation Strategy:**
1. **Lock to specific version** - `"cozo-node": "0.7.6"` in package.json
2. **Abstract behind API** - Our code wraps CozoDB, not direct usage
3. **Migration path** - Can export to SQLite/Neo4j if needed
4. **Active development** - More stable than "abandoned" v1.0 projects
5. **Production use** - Early adopters already using it

**Comparison:**

| Risk Factor | CozoDB (v0.7) | sqlite-graph (v0.1.0) |
|-------------|--------------|---------------------|
| API Stability | ⚠️ May change | ⚠️ Will change (alpha) |
| Breaking Changes | Possible | Expected |
| Production Use | Yes | No |
| Maturity | 3 years | Brand new |
| Community | Growing | Tiny |
| Fallback Options | Many | Few |

**Verdict:** CozoDB is less risky than sqlite-graph despite both being pre-1.0.

---

## Alternative Considered: sqlite-graph

### When to choose sqlite-graph instead:

1. **Team knows Cypher** - You have Neo4j experience
2. **Cypher is non-negotiable** - Business requirement for Neo4j compatibility
3. **Willing to wait** - Can delay graph features until v1.0 (2027)
4. **Separate concerns** - Want vector search and graph in different databases

### Why we chose CozoDB over sqlite-graph:

| Factor | CozoDB | sqlite-graph |
|--------|--------|-------------|
| **Maturity** | 3 years (v0.7) | Brand new (v0.1.0-alpha) |
| **Vector Search** | Built-in ✅ | Need sqlite-vss separately ❌ |
| **Production Ready** | Early adopters using it | Explicitly not production ❌ |
| **Language Support** | 10+ languages | Python + limited Node.js |
| **v1.0 Timeline** | TBD | 2027 |
| **Dependencies** | 1 (all-in-one) | 2 (graph + vectors) |

**Verdict:** CozoDB is more practical for shipping in 2025.

---

## Implementation Plan

### Phase 0: Proof of Concept (Current)

**Branch:** `feature/db`

**Goal:** Embed CozoDB in agent creation, verify it works

**Tasks:**
1. ✅ Research completed (this document)
2. Add cozo-node dependency
3. Create agent database on agent creation
4. Store basic metadata (test tables)
5. Verify file-based embedding works
6. Test agent portability (copy folder)

**Success Criteria:**
- CozoDB database file created per agent
- Can read/write basic data
- No errors, no server setup required

### Phase 1: Conversations + Vectors (Epic 11)

**Timeline:** 8 weeks (110 points)

**Technology:** CozoDB relational + vector features

**Features:**
- Index conversation history
- Semantic search (vector embeddings)
- Keyword search (full-text)
- Metrics dashboard

**Database Schema:**
```javascript
// CozoDB relational tables
:create conversations {
  id: String,
  agent_id: String,
  role: String,
  content: String,
  timestamp: Int,
  => [id]
}

// Vector search (HNSW)
:create conversation_vectors {
  id: String,
  embedding: <F32; 1536>,
  => [id]
}

// Full-text search
:create conversations_fts {
  content: String,
  => content_fts(content)
}
```

### Phase 2: Knowledge Graph (Epic 14)

**Timeline:** 7 weeks (34 points)

**Technology:** CozoDB graph features (Datalog)

**Features:**
- Entity extraction (files, functions, concepts)
- Relationship tracking (imports, calls, references)
- Graph traversal (find dependencies)
- Knowledge discovery (centrality, clustering)

**Database Schema:**
```datalog
// Entities (graph nodes)
:create entities {
  id: String,
  type: String,
  name: String,
  properties: Json,
  => [id]
}

// Relationships (graph edges)
:create relationships {
  from_id: String,
  to_id: String,
  rel_type: String,
  strength: Float,
  => [from_id, to_id, rel_type]
}
```

---

## Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| CozoDB API changes | Medium | Medium | Lock version, abstract API |
| Performance issues | Low | High | Benchmark early, optimize queries |
| Migration needed | Low | Medium | Export/import scripts ready |
| Learning curve | Medium | Low | Good docs, team training |
| Bugs in pre-1.0 | Medium | Medium | Active support, fallback to v0.6 |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Adoption concerns | Low | Low | Hidden implementation detail |
| Contributor friction | Low | Low | Abstract API, good docs |
| Customer concerns | Very Low | Low | Emphasize benefits, not tech |

**Overall Risk:** **LOW-MEDIUM** - Acceptable for Phase 1/2

---

## Success Metrics

### Phase 0 (Proof of Concept)
- ✅ CozoDB embedded successfully
- ✅ Agent database created on first run
- ✅ Basic CRUD operations work
- ✅ File-based portability confirmed

### Phase 1 (Conversations + Vectors)
- 99.85% cost reduction vs current approach ($200 → $0.30/month)
- <100ms average semantic search latency
- 95%+ search relevance (user feedback)
- Zero database server setup required

### Phase 2 (Knowledge Graph)
- Entity extraction: 90%+ accuracy (files, functions)
- Graph queries: <200ms for 5-hop traversal
- Knowledge discovery: Correctly identify top 10 important files
- User value: "Why did we change X?" queries work

---

## Decision Log

**Date:** 2025-11-03
**Decision Makers:** AI Maestro Development Team
**Decision:** Use CozoDB v0.7 for agent databases

**Rationale:**
1. Real graph database (Datalog, not SQL emulation)
2. All-in-one solution (relational + vector + graph)
3. Embedded architecture (perfect for agent portability)
4. More mature than sqlite-graph (3 years vs alpha)
5. Query language hidden from users (no adoption impact)

**Alternatives Rejected:**
- sqlite-graph: Too new (alpha), no vector search
- Pure SQLite: Not a real graph database
- Memgraph: Requires server (not embedded)
- NebulaGraph: Distributed overkill

**Next Steps:**
1. Create `feature/db` branch
2. Add cozo-node dependency
3. Embed CozoDB in agent creation
4. Test portability and basic operations
5. Proceed with Phase 1 implementation (Epic 11)

---

## References

- [CozoDB GitHub](https://github.com/cozodb/cozo)
- [CozoDB Documentation](https://docs.cozodb.org/)
- [Datalog Tutorial](https://docs.cozodb.org/en/latest/tutorial.html)
- [DATABASE-ARCHITECTURE-DUAL-APPROACH.md](./DATABASE-ARCHITECTURE-DUAL-APPROACH.md) - Technical deep dive
- [CONVERSATION-SEARCH-ARCHITECTURE.md](./CONVERSATION-SEARCH-ARCHITECTURE.md) - Phase 1 design
- [BACKLOG-DISTRIBUTED-AGENTS.md](./BACKLOG-DISTRIBUTED-AGENTS.md) - Epic 11 & 14

---

**Document Status:** ✅ Approved
**Next Action:** Create `feature/db` branch and start Phase 0 implementation
