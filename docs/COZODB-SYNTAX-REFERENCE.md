# CozoDB Datalog Syntax Reference

**Official Documentation:** https://docs.cozodb.org/en/latest/

This is a practical reference for working with CozoDB in the AI Maestro project.

---

## Table of Contents
1. [Creating Stored Relations (:create)](#creating-stored-relations-create)
2. [Inserting/Updating Data (:put)](#insertingupdating-data-put)
3. [Inserting New Data Only (:insert)](#inserting-new-data-only-insert)
4. [Updating Existing Data (:update)](#updating-existing-data-update)
5. [Deleting Data (:delete)](#deleting-data-delete)
6. [Querying Data](#querying-data)
7. [Handling Nullable Values](#handling-nullable-values)
8. [Common Pitfalls](#common-pitfalls)

---

## Creating Stored Relations (:create)

### Basic Syntax

```datalog
:create table_name {
    key_column1: Type,
    key_column2: Type
    =>
    value_column1: Type,
    value_column2: Type?
}
```

**Key Points:**
- Columns **before** `=>` form the **primary key** (can be composite)
- Columns **after** `=>` are value columns
- Add `?` to make a column **nullable** (e.g., `String?`)
- **No commas** after the last column before or after `=>`

### Example: Simple Table

```datalog
:create users {
    user_id: String
    =>
    name: String,
    email: String,
    age: Int?,
    created_at: Int
}
```

**Interpretation:**
- Primary key: `user_id`
- Values: `name`, `email`, `age` (nullable), `created_at`

### Example: Composite Primary Key

```datalog
:create session_projects {
    session_id: String,
    project_id: String
    =>
    agent_id: String,
    started_at: Int,
    ended_at: Int?,
    is_current: Bool
}
```

**Interpretation:**
- Composite key: `(session_id, project_id)`
- Values: `agent_id`, `started_at`, `ended_at` (nullable), `is_current`

### Available Types

- `String` - Text data
- `Int` - Integer numbers
- `Float` - Floating point numbers
- `Bool` - Boolean (true/false)
- `Bytes` - Binary data
- `Uuid` - UUID values
- `Validity` - Temporal validity (for time-travel queries)
- Add `?` for nullable: `String?`, `Int?`, etc.

---

## Inserting/Updating Data (:put)

`:put` is an **upsert** operation - it inserts new rows or updates existing ones based on the primary key.

### Basic Syntax

```datalog
?[col1, col2, col3, col4] <- [
    [val1, val2, val3, val4]
]
:put table_name
```

**Critical Rules:**
1. The `?[...]` pattern **must match the table schema exactly** in order: keys first, then values
2. **No need to specify** `{key => values}` - CozoDB knows from the table definition
3. Values in `[[...]]` must match the column order
4. Use **actual null values** carefully - prefer empty strings for optional String fields

### Example: Insert User

```datalog
:create users {
    user_id: String
    =>
    name: String,
    email: String,
    age: Int?
}

# Insert a user (age is null)
?[user_id, name, email, age] <- [
    ['user-123', 'Alice', 'alice@example.com', null]
]
:put users
```

### Example: Insert Multiple Rows

```datalog
?[user_id, name, email, age] <- [
    ['user-1', 'Alice', 'alice@example.com', 25],
    ['user-2', 'Bob', 'bob@example.com', 30],
    ['user-3', 'Charlie', 'charlie@example.com', null]
]
:put users
```

### Example with String Interpolation (TypeScript)

```typescript
const agentId = 'test-agent'
const name = 'Test Agent'
const createdAt = Date.now()

await db.run(`
    ?[agent_id, name, status, created_at] <- [
        ['${agentId}', '${name}', 'active', ${createdAt}]
    ]
    :put agents
`)
```

---

## Inserting New Data Only (:insert)

`:insert` only adds new rows. If a row with the same key exists, it **raises an error**.

### Syntax

```datalog
?[col1, col2, col3] <- [
    [val1, val2, val3]
]
:insert table_name
```

### When to Use
- When you want to ensure no duplicates
- When you need to know if a key already exists
- For initial data seeding

---

## Updating Existing Data (:update)

`:update` only modifies existing rows. If the key doesn't exist, it **raises an error**.

### Syntax

```datalog
?[key_col, value_col_to_update] <- [
    [key_val, new_value]
]
:update table_name
```

**Important:** Only include:
1. **All key columns**
2. **Only the value columns you want to update**

### Example: Update User Email

```datalog
# Table: users { user_id: String => name: String, email: String, age: Int? }

# Update only email
?[user_id, email] <- [
    ['user-123', 'newemail@example.com']
]
:update users
```

### Example: Update Multiple Columns

```datalog
?[user_id, email, age] <- [
    ['user-123', 'newemail@example.com', 26]
]
:update users
```

---

## Deleting Data (:delete)

`:delete` removes rows by their primary key.

### Syntax

```datalog
?[key_col] <- [
    [key_val]
]
:delete table_name
```

### Example: Delete User

```datalog
?[user_id] <- [
    ['user-123']
]
:delete users
```

### Example: Delete Multiple Users

```datalog
?[user_id] <- [
    ['user-1'],
    ['user-2'],
    ['user-3']
]
:delete users
```

---

## Querying Data

### Basic Query

```datalog
?[col1, col2] := *table_name{col1, col2}
```

### Query with Filter

```datalog
?[user_id, name] := *users{user_id, name, age},
                     age > 25
```

### Query with Join

```datalog
?[session_name, project_name] :=
    *sessions{session_id, session_name},
    *session_projects{session_id, project_id},
    *projects{project_id, project_name}
```

---

## Handling Nullable Values

### In Table Definition

Use `?` suffix for nullable columns:

```datalog
:create agents {
    agent_id: String
    =>
    name: String,
    current_session_id: String?,    # Nullable
    last_active_at: Int?             # Nullable
}
```

### In Data Insertion

**Option 1: Use `null`** (for Int, Bool types)
```datalog
?[agent_id, name, current_session_id, last_active_at] <- [
    ['agent-1', 'Agent 1', null, null]
]
:put agents
```

**Option 2: Use empty string** (for String types, safer)
```datalog
?[agent_id, name, current_session_id, last_active_at] <- [
    ['agent-1', 'Agent 1', '', null]
]
:put agents
```

### Querying Nullable Fields

Check for null:
```datalog
?[agent_id] := *agents{agent_id, current_session_id},
               is_null(current_session_id)
```

Check for non-null:
```datalog
?[agent_id] := *agents{agent_id, current_session_id},
               !is_null(current_session_id)
```

---

## Common Pitfalls

### ❌ WRONG: Specifying column mapping in :put

```datalog
# DON'T DO THIS
:put agents { agent_id => name, status }
```

**Why:** The table definition already specifies keys vs values. Just use `:put table_name`.

### ❌ WRONG: Column order mismatch

```datalog
:create users { user_id: String => name: String, age: Int }

# WRONG ORDER
?[name, user_id, age] <- [['Alice', 'user-1', 25]]
:put users
```

**Fix:** Match the exact order from `:create`:
```datalog
?[user_id, name, age] <- [['user-1', 'Alice', 25]]
:put users
```

### ❌ WRONG: Using string 'null' instead of null

```datalog
# WRONG
?[agent_id, name, session_id] <- [['agent-1', 'Agent', 'null']]
:put agents
```

**Fix:** Use actual null or empty string:
```datalog
?[agent_id, name, session_id] <- [['agent-1', 'Agent', null]]
# OR
?[agent_id, name, session_id] <- [['agent-1', 'Agent', '']]
:put agents
```

### ❌ WRONG: Forgetting separator `=>`

```datalog
# WRONG
:create users {
    user_id: String,
    name: String,
    age: Int
}
```

**Fix:** Always include `=>` to separate keys from values:
```datalog
:create users {
    user_id: String
    =>
    name: String,
    age: Int
}
```

### ❌ WRONG: Extra commas in schema definition

```datalog
# WRONG
:create users {
    user_id: String,   # ← Extra comma before =>
    =>
    name: String,
    age: Int,          # ← Extra comma at end
}
```

**Fix:** No comma before `=>` or after last column:
```datalog
:create users {
    user_id: String
    =>
    name: String,
    age: Int
}
```

---

## Complete Working Example

```datalog
# 1. Create tables
:create agents {
    agent_id: String
    =>
    name: String,
    status: String,
    created_at: Int,
    current_session_id: String?
}

:create sessions {
    session_id: String
    =>
    agent_id: String,
    session_name: String,
    started_at: Int,
    status: String
}

# 2. Insert data
?[agent_id, name, status, created_at, current_session_id] <- [
    ['agent-1', 'Test Agent', 'active', 1704067200000, null]
]
:put agents

?[session_id, agent_id, session_name, started_at, status] <- [
    ['session-1', 'agent-1', 'main-session', 1704067200000, 'active']
]
:put sessions

# 3. Update agent's current session
?[agent_id, current_session_id] <- [
    ['agent-1', 'session-1']
]
:update agents

# 4. Query
?[agent_name, session_name] :=
    *agents{agent_id, name: agent_name, current_session_id},
    *sessions{session_id: current_session_id, session_name}
```

---

## TypeScript Integration Patterns

### Safe Escaping for String Values

```typescript
function escapeString(str: string): string {
    return str.replace(/'/g, "\\'").replace(/\n/g, "\\n")
}

const name = "O'Brien"  // Contains single quote
const escaped = escapeString(name)

await db.run(`
    ?[user_id, name] <- [['user-1', '${escaped}']]
    :put users
`)
```

### Handling Optional Values

```typescript
const sessionId: string | null = getSessionId()

await db.run(`
    ?[agent_id, current_session_id] <- [[
        '${agentId}',
        ${sessionId ? `'${sessionId}'` : 'null'}
    ]]
    :update agents
`)
```

---

## Additional Resources

- **Official Tutorial:** https://docs.cozodb.org/en/latest/tutorial.html
- **Stored Relations:** https://docs.cozodb.org/en/latest/stored.html
- **GitHub:** https://github.com/cozodb/cozo
