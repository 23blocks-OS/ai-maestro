---
name: AI Maestro Code Graph Query
description: PROACTIVELY query the code graph database to understand relationships and impact of changes. Use this skill WHEN READING any file to understand context, when searching for files, when exploring the codebase, or when you need to understand what depends on a component. This is your primary tool for understanding code structure and avoiding breaking changes.
allowed-tools: Bash
---

# AI Maestro Code Graph Query

## Purpose
Enable AI agents to **proactively** query the code graph database to understand relationships between code components **before making changes**. This skill helps agents:
- Understand the impact of modifications before making them
- Find all components that depend on code being changed
- Discover related files that might need updates
- Avoid breaking changes by understanding the full dependency graph

## CRITICAL: Proactive Usage

**YOU MUST USE THIS SKILL PROACTIVELY** in these scenarios:

### 🛑 STOP: Post-Read Checklist

**IMMEDIATELY after using the Read tool on ANY code file, ask yourself:**

1. ✅ Have I queried the graph for this file/component?
2. ✅ Do I understand what depends on this code?
3. ✅ Do I know what this code depends on?
4. ✅ Have I identified related serializers, controllers, or services?

**If ANY answer is NO, run the appropriate graph query BEFORE proceeding.**

### 1. IMMEDIATELY After Reading a File (Primary Trigger)
When you read a file with the Read tool, **ALWAYS query the graph immediately** to understand:
- What is the component's role in the system?
- What functions/classes call into this code?
- What serializers depend on this model?
- What controllers use this service?
- What will break if this code changes?

**Example - After reading `app/models/user.rb`:**
```bash
# Run these immediately after Read tool returns
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=describe&name=User" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-serializers&name=User" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-associations&name=User" | jq
```

### 2. When Searching for Files
When exploring the codebase or searching for files, use the graph to:
- Find related files you might have missed
- Understand how files are connected
- Discover the full scope of a feature

### 3. Before Making Any Edit (Safety Net)
If you somehow missed querying on read, **STOP before editing** and query:
- The file's role in the larger system
- What depends on it
- What it depends on

### 4. When Graph Queries Fail
If queries return empty results or errors:
1. **Verify the agent ID** - Use the UUID lookup method below
2. **Check AI Maestro is running** - `curl -s http://localhost:23000/api/agents | jq '.agents | length'`
3. **Inform the user** - "Graph unavailable, proceeding with manual analysis via grep"
4. **Use grep as fallback** - But acknowledge reduced safety

## When to Use This Skill

**PROACTIVE (Use Automatically - Primary Trigger is File Read):**
- You just read a file with the Read tool → Query its relationships IMMEDIATELY
- You found a file via grep/glob → Query its connections before reading
- You're exploring unfamiliar code → Describe the component as you read
- You're debugging → Trace the call path
- You're about to modify a function → Find all callers (safety net if missed on read)
- You're changing a model → Find all serializers and associations (safety net)

**REACTIVE (When Asked):**
- User asks "who calls this function?"
- User asks "what depends on X?"
- User asks "find serializers for model X"
- User asks "how is X related to Y?"
- User asks "describe component X"

## API Endpoint

**Base URL:** `http://localhost:23000/api/agents/{agent_id}/graph/query`

**Method:** GET

**Required Parameters:**
- `q` - Query type (see below)

## Query Types

### 1. find-callers
Find all functions that call a given function.

**Parameters:**
- `name` (required) - Function name to find callers for

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/graph/query?q=find-callers&name={FUNCTION_NAME}" | jq
```

**Example:**
```bash
# Find all functions that call "authenticate"
curl -s "http://localhost:23000/api/agents/backend-api/graph/query?q=find-callers&name=authenticate" | jq

# Response:
# {
#   "success": true,
#   "result": {
#     "function": "authenticate",
#     "callers": [
#       { "name": "login", "file": "app/controllers/sessions_controller.rb" },
#       { "name": "check_auth", "file": "app/middleware/auth_middleware.rb" }
#     ],
#     "count": 2
#   }
# }
```

### 2. find-callees
Find all functions called by a given function.

**Parameters:**
- `name` (required) - Function name to find callees for

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/graph/query?q=find-callees&name={FUNCTION_NAME}" | jq
```

**Example:**
```bash
# Find all functions called by "process_payment"
curl -s "http://localhost:23000/api/agents/backend-api/graph/query?q=find-callees&name=process_payment" | jq

# Response:
# {
#   "success": true,
#   "result": {
#     "function": "process_payment",
#     "callees": [
#       { "name": "validate_card", "file": "app/services/payment_service.rb" },
#       { "name": "charge_customer", "file": "lib/stripe_client.rb" }
#     ],
#     "count": 2
#   }
# }
```

### 3. find-related
Find all components related to a given component (extends, includes, associations, serializers).

**Parameters:**
- `name` (required) - Component name to find relationships for

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/graph/query?q=find-related&name={COMPONENT_NAME}" | jq
```

**Example:**
```bash
# Find all relationships for User model
curl -s "http://localhost:23000/api/agents/backend-api/graph/query?q=find-related&name=User" | jq

# Response:
# {
#   "success": true,
#   "result": {
#     "component": "User",
#     "extends_from": ["ApplicationRecord"],
#     "extended_by": ["AdminUser", "GuestUser"],
#     "includes": ["Authable", "Trackable"],
#     "included_by": [],
#     "associations": [
#       { "target": "Post", "type": "has_many" },
#       { "target": "Profile", "type": "has_one" },
#       { "target": "Organization", "type": "belongs_to" }
#     ],
#     "associated_by": [
#       { "source": "Comment", "type": "belongs_to" }
#     ],
#     "serializes": null,
#     "serialized_by": ["UserSerializer", "UserDetailSerializer"]
#   }
# }
```

### 4. find-by-type
Find all components of a given type.

**Parameters:**
- `type` (required) - Component type (model, serializer, controller, job, service, etc.)

**Available Types:**
- `model` - ActiveRecord/ORM models
- `serializer` - JSON serializers
- `controller` - API/web controllers
- `job` - Background jobs
- `service` - Service objects
- `mailer` - Email senders
- `concern` - Shared modules
- `helper` - View helpers
- `validator` - Custom validators
- `middleware` - Request middleware
- `component` - React/Vue components
- `hook` - React hooks
- `context` - React contexts
- `store` - State stores
- `util` - Utility functions
- `test` - Test files

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/graph/query?q=find-by-type&type={TYPE}" | jq
```

**Example:**
```bash
# Find all models in the project
curl -s "http://localhost:23000/api/agents/backend-api/graph/query?q=find-by-type&type=model" | jq

# Response:
# {
#   "success": true,
#   "result": {
#     "type": "model",
#     "components": [
#       { "name": "User", "file": "app/models/user.rb" },
#       { "name": "Post", "file": "app/models/post.rb" },
#       { "name": "Comment", "file": "app/models/comment.rb" }
#     ],
#     "count": 3
#   }
# }
```

### 5. find-associations
Find all associations for a model (belongs_to, has_many, has_one, etc.).

**Parameters:**
- `name` (required) - Model name to find associations for

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/graph/query?q=find-associations&name={MODEL_NAME}" | jq
```

**Example:**
```bash
# Find associations for Post model
curl -s "http://localhost:23000/api/agents/backend-api/graph/query?q=find-associations&name=Post" | jq

# Response:
# {
#   "success": true,
#   "result": {
#     "model": "Post",
#     "outgoing": [
#       { "target": "User", "type": "belongs_to" },
#       { "target": "Category", "type": "belongs_to" },
#       { "target": "Comment", "type": "has_many" }
#     ],
#     "incoming": [
#       { "source": "User", "type": "has_many" }
#     ]
#   }
# }
```

### 6. find-serializers
Find all serializers for a model.

**Parameters:**
- `name` (required) - Model name to find serializers for

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/graph/query?q=find-serializers&name={MODEL_NAME}" | jq
```

**Example:**
```bash
# Find serializers for User model
curl -s "http://localhost:23000/api/agents/backend-api/graph/query?q=find-serializers&name=User" | jq

# Response:
# {
#   "success": true,
#   "result": {
#     "model": "User",
#     "serializers": [
#       { "name": "UserSerializer", "file": "app/serializers/user_serializer.rb" },
#       { "name": "UserDetailSerializer", "file": "app/serializers/user_detail_serializer.rb" }
#     ],
#     "count": 2
#   }
# }
```

### 7. find-path
Find the call path between two functions.

**Parameters:**
- `from` (required) - Starting function name
- `to` (required) - Target function name

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/graph/query?q=find-path&from={FROM_FUNCTION}&to={TO_FUNCTION}" | jq
```

**Example:**
```bash
# Find how "create_order" eventually calls "send_email"
curl -s "http://localhost:23000/api/agents/backend-api/graph/query?q=find-path&from=create_order&to=send_email" | jq

# Response:
# {
#   "success": true,
#   "result": {
#     "from": "create_order",
#     "to": "send_email",
#     "paths": [
#       { "depth": 3, "via": ["create_order", "process_order", "notify_customer"] }
#     ],
#     "found": true
#   }
# }
```

### 8. describe
Get a full description of a component and all its relationships.

**Parameters:**
- `name` (required) - Component or function name to describe

**Command:**
```bash
curl -s "http://localhost:23000/api/agents/{AGENT_ID}/graph/query?q=describe&name={NAME}" | jq
```

**Example:**
```bash
# Describe the User component
curl -s "http://localhost:23000/api/agents/backend-api/graph/query?q=describe&name=User" | jq

# Response:
# {
#   "success": true,
#   "result": {
#     "name": "User",
#     "found": true,
#     "type": "component",
#     "class_type": "model",
#     "file": "app/models/user.rb",
#     "relationships": {
#       "extends_from": ["ApplicationRecord"],
#       "includes": ["Devise::Models::Authenticatable"],
#       "associations": [
#         { "target": "Post", "type": "has_many" }
#       ],
#       "serialized_by": ["UserSerializer"]
#     }
#   }
# }
```

## Getting Your Agent ID

**IMPORTANT:** The agent ID is the **UUID** from the AI Maestro agents list, NOT the tmux session name.

### Step 1: Find your agent UUID

```bash
# List all agents and find yours by matching the currentSession to your tmux session
TMUX_SESSION=$(tmux display-message -p '#S')
AGENT_ID=$(curl -s "http://localhost:23000/api/agents" | jq -r ".agents[] | select(.currentSession == \"$TMUX_SESSION\") | .id")
echo "Your agent UUID: $AGENT_ID"
```

### Step 2: Verify the agent ID works

```bash
# Quick test - should return components, not empty results
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-by-type&type=model" | jq '.result.count'
```

### Alternative: Use alias (if supported)

```bash
# Some setups support using the agent alias instead of UUID
AGENT_ALIAS=$(curl -s "http://localhost:23000/api/agents" | jq -r ".agents[] | select(.currentSession == \"$TMUX_SESSION\") | .alias")
echo "Your agent alias: $AGENT_ALIAS"
```

### Troubleshooting Agent ID Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Empty results (`"count": 0`) | Wrong agent ID or graph not indexed | Verify UUID with agents list |
| Connection refused | AI Maestro not running | Start the AI Maestro service |
| `"found": false` | Component name mismatch | Check exact class/function name |

## IMPACT ANALYSIS WORKFLOWS (Use Before Making Changes)

### Workflow: Before Modifying a Model

**Scenario:** You're about to add a field to the User model or change a method.

```bash
# Get agent UUID (run once per session)
TMUX_SESSION=$(tmux display-message -p '#S')
AGENT_ID=$(curl -s "http://localhost:23000/api/agents" | jq -r ".agents[] | select(.currentSession == \"$TMUX_SESSION\") | .id")

# Step 1: Understand the model's full context
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=describe&name=User" | jq

# Step 2: Find ALL serializers that expose this model (they may need updates)
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-serializers&name=User" | jq

# Step 3: Find ALL associations (other models that reference this)
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-associations&name=User" | jq

# Step 4: Find related components (inheritance, includes, etc.)
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-related&name=User" | jq
```

**Before making your change, you now know:**
- Which serializers might need the new field added
- Which models have associations that might be affected
- What modules this model includes (they might have conflicting methods)
- What classes extend this model (they inherit your changes)

### Workflow: Before Modifying a Function

**Scenario:** You're about to change a function's signature or behavior.

```bash
# Assumes AGENT_ID is set from UUID lookup above

# Step 1: Find ALL callers of this function (they may break!)
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-callers&name=process_payment" | jq

# Step 2: Find what this function calls (understand the flow)
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-callees&name=process_payment" | jq

# Step 3: If it's a method, describe the class context
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=describe&name=PaymentService" | jq
```

**Before making your change, you now know:**
- Every place that calls this function (update them if signature changes)
- What downstream functions might be affected
- The broader context of the class/module

### Workflow: Before Modifying a Controller

**Scenario:** You're changing an API endpoint.

```bash
# Assumes AGENT_ID is set from UUID lookup above

# Step 1: Describe the controller
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=describe&name=UsersController" | jq

# Step 2: Find what models it uses
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-callees&name=create" | jq

# Step 3: Find serializers it might use
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-by-type&type=serializer" | jq '.result.components[] | select(.name | contains("User"))'
```

### Workflow: After Finding a File via Search

**Scenario:** You used grep/glob and found `app/services/payment_service.rb`

```bash
# Assumes AGENT_ID is set from UUID lookup above

# Immediately query its relationships before deciding what to do
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=describe&name=PaymentService" | jq

# Find everything that uses this service
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-callers&name=process" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-callers&name=charge" | jq
```

### Workflow: Exploring Unfamiliar Code

**Scenario:** You're new to a codebase or feature area.

```bash
# Assumes AGENT_ID is set from UUID lookup above

# Step 1: Get inventory of all key components
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-by-type&type=model" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-by-type&type=controller" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-by-type&type=service" | jq

# Step 2: For each key model, understand its relationships
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=describe&name=Order" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-associations&name=Order" | jq
```

### Workflow: Debugging - Trace the Call Path

**Scenario:** You need to understand how data flows through the system.

```bash
# Assumes AGENT_ID is set from UUID lookup above

# Find the path from an entry point to a specific function
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-path&from=create&to=send_notification" | jq

# If no direct path, trace step by step
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-callees&name=create" | jq
# Then for each callee...
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-callees&name=process_order" | jq
```

## QUICK REFERENCE WORKFLOWS

### Session Setup (Run First)
```bash
# Run this ONCE at the start of your session to set AGENT_ID
TMUX_SESSION=$(tmux display-message -p '#S')
export AGENT_ID=$(curl -s "http://localhost:23000/api/agents" | jq -r ".agents[] | select(.currentSession == \"$TMUX_SESSION\") | .id")
echo "Agent ID: $AGENT_ID"

# Verify it works
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-by-type&type=model" | jq '.result.count'
```

### Understanding a Model
```bash
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=describe&name=User" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-associations&name=User" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-serializers&name=User" | jq
```

### Tracing Function Calls
```bash
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-callers&name=authenticate" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-callees&name=authenticate" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-path&from=login&to=send_email" | jq
```

### Finding Components by Type
```bash
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-by-type&type=model" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-by-type&type=serializer" | jq
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/query?q=find-by-type&type=controller" | jq
```

## Error Handling

**Missing required parameter:**
```json
{
  "success": false,
  "error": "find-callers requires \"name\" parameter"
}
```

**Unknown query type:**
```json
{
  "success": false,
  "error": "Unknown query type: unknown",
  "available_queries": ["find-callers", "find-callees", "find-related", ...]
}
```

**Component not found:**
```json
{
  "success": true,
  "result": {
    "name": "NonExistent",
    "found": false
  }
}
```

## Tips for Proactive Usage

### The Golden Rule: Query IMMEDIATELY After You Read

**ALWAYS run at least one query immediately after reading any code file:**

| What You Just Read | Query Immediately |
|-------------------|-------------------|
| Model | `describe`, `find-serializers`, `find-associations` |
| Function/Method | `find-callers`, `find-callees` |
| Controller | `describe`, `find-callees` |
| Service | `find-callers`, `describe` |
| Serializer | `describe` (find which model it serializes) |

### Best Practices

1. **Query immediately after every file read** - When you read a file, immediately query its relationships
2. **Query on every file search** - When you find a file via grep/glob, query before reading
3. **Use `describe` first** - Get the full picture before diving into specifics
4. **Check callers for signature changes** - If you change a function signature, find all callers
5. **Check serializers for model changes** - Model changes often require serializer updates
6. **Trace paths for debugging** - Use `find-path` to understand how data flows

### Avoid Breaking Changes

The graph query helps you avoid:
- Changing a function signature without updating callers
- Adding model fields without updating serializers
- Breaking inheritance chains
- Missing dependent components

## DOCUMENTATION SEARCH

In addition to code graph queries, you can search project documentation (README files, ADRs, design docs, etc.) for context, decisions, and business logic.

### Documentation API Endpoint

**Base URL:** `http://localhost:23000/api/agents/{agent_id}/graph/docs`

### Documentation Query Types

#### 1. stats - Get Documentation Statistics

```bash
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=stats" | jq
```

Returns counts of documents, sections, chunks, embeddings, and breakdown by document type.

#### 2. search - Semantic Search

Search documentation using natural language queries. Uses embeddings for semantic similarity.

```bash
# Semantic search
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&q=authentication%20flow" | jq

# Keyword search (lexical)
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&keyword=OAuth" | jq
```

#### 3. find-by-type - Find Documents by Type

Available types: `adr`, `readme`, `design`, `api`, `setup`, `guide`, `spec`, `changelog`, `contributing`, `roadmap`, `doc`

```bash
# Find all ADRs (Architecture Decision Records)
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=find-by-type&type=adr" | jq

# Find all design documents
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=find-by-type&type=design" | jq
```

#### 4. list - List All Documents

```bash
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=list&limit=20" | jq
```

#### 5. get-doc - Get Document with Sections

```bash
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=get-doc&docId=abc123" | jq
```

### When to Search Documentation

**Use documentation search when:**
- Understanding "why" a decision was made → Search ADRs
- Looking for business context or requirements → Search design docs
- Finding setup or configuration details → Search README and setup guides
- Understanding API contracts → Search API docs
- Learning about project conventions → Search contributing guides

**Example workflow - Before implementing a feature:**
```bash
# 1. Search for related decisions
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&q=authentication%20decision" | jq

# 2. Find relevant ADRs
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=find-by-type&type=adr" | jq

# 3. Search for existing designs
curl -s "http://localhost:23000/api/agents/$AGENT_ID/graph/docs?action=search&q=user%20authentication%20design" | jq
```

### Indexing Documentation

To index a project's documentation (usually done once):

```bash
# Index docs for the current project
curl -X POST "http://localhost:23000/api/agents/$AGENT_ID/graph/docs" | jq

# Index with specific project path
curl -X POST "http://localhost:23000/api/agents/$AGENT_ID/graph/docs" \
  -H "Content-Type: application/json" \
  -d '{"projectPath": "/path/to/project"}' | jq
```

## References

- [AI Maestro Documentation](https://github.com/23blocks-OS/ai-maestro)
- [Graph API Code](/app/api/agents/[id]/graph/query/route.ts)
- [Docs API Code](/app/api/agents/[id]/graph/docs/route.ts)
