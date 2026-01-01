# AI Maestro Graph Scripts

Command-line tools for querying the code graph database. These scripts help AI agents understand code relationships, dependencies, and impact of changes before modifying code.

## Purpose

Graph scripts help agents:
- **Understand** code structure and relationships
- **Find** what depends on a component before changing it
- **Avoid** breaking changes by identifying all callers
- **Discover** related components (serializers, associations, child classes)

## Installation

```bash
cd /path/to/ai-maestro
./install-messaging.sh
# Installs all scripts including graph tools
```

Scripts are installed to `~/.local/bin/`.

---

## Available Scripts

| Script | Purpose |
|--------|---------|
| `graph-describe.sh` | Describe a component and its relationships |
| `graph-find-callers.sh` | Find all functions that call a given function |
| `graph-find-callees.sh` | Find all functions called by a given function |
| `graph-find-related.sh` | Find all related components |
| `graph-find-serializers.sh` | Find serializers for a model |
| `graph-find-associations.sh` | Find model associations |
| `graph-find-by-type.sh` | Find components by type (model, controller, etc.) |
| `graph-find-path.sh` | Find dependency path between components |
| `graph-index-delta.sh` | Trigger incremental graph indexing |
| `graph-helper.sh` | Helper functions (sourced by other scripts) |

---

## Script Reference

### graph-describe.sh

Get comprehensive information about a component.

```bash
graph-describe.sh <component-name>
```

**Examples:**
```bash
# Describe a model
graph-describe.sh User

# Describe a service
graph-describe.sh PaymentService

# Describe a function
graph-describe.sh authenticate
```

**Output:**
```
Describing: User
---
Type: component
Class Type: model
File: app/models/user.rb

Extends:
  - ApplicationRecord

Extended by:
  - AdminUser
  - GuestUser

Serialized by:
  - UserSerializer
  - UserDetailSerializer

Associations:
  - has_many: orders
  - has_one: profile
  - belongs_to: organization
```

---

### graph-find-callers.sh

Find all functions that call a given function. **Use before modifying function signatures.**

```bash
graph-find-callers.sh <function-name>
```

**Example:**
```bash
graph-find-callers.sh authenticate
```

**Output:**
```
Finding callers of: authenticate
---
Found 4 caller(s):

  LoginController.create
    File: app/controllers/login_controller.rb

  SessionManager.refresh
    File: lib/session_manager.rb

  ApiController.before_action
    File: app/controllers/api_controller.rb

  TestHelper.login_as
    File: test/test_helper.rb
```

---

### graph-find-callees.sh

Find all functions called by a given function.

```bash
graph-find-callees.sh <function-name>
```

**Example:**
```bash
graph-find-callees.sh process_payment
```

**Output:**
```
Finding callees of: process_payment
---
Found 5 callee(s):

  validate_card
  charge_customer
  send_receipt
  update_inventory
  log_transaction
```

---

### graph-find-related.sh

Find all components related to a given component.

```bash
graph-find-related.sh <component-name>
```

**Example:**
```bash
graph-find-related.sh PaymentService
```

---

### graph-find-serializers.sh

Find serializers that handle a given model. **Use before changing model attributes.**

```bash
graph-find-serializers.sh <model-name>
```

**Example:**
```bash
graph-find-serializers.sh User
```

**Output:**
```
Finding serializers for: User
---
Found 2 serializer(s):

  UserSerializer
    File: app/serializers/user_serializer.rb

  UserDetailSerializer
    File: app/serializers/user_detail_serializer.rb
```

---

### graph-find-associations.sh

Find model associations (has_many, belongs_to, etc.).

```bash
graph-find-associations.sh <model-name>
```

**Example:**
```bash
graph-find-associations.sh Order
```

**Output:**
```
Finding associations for: Order
---
Found 4 association(s):

  belongs_to: user
  belongs_to: product
  has_many: line_items
  has_one: shipment
```

---

### graph-find-by-type.sh

Find all components of a specific type.

```bash
graph-find-by-type.sh <type>
```

**Types:**
| Type | Description |
|------|-------------|
| `model` | Database models (ActiveRecord, etc.) |
| `controller` | Request controllers |
| `service` | Service objects |
| `serializer` | JSON serializers |
| `job` | Background jobs |
| `mailer` | Email mailers |
| `concern` | Shared concerns/mixins |

**Example:**
```bash
graph-find-by-type.sh model
```

---

### graph-find-path.sh

Find the dependency path between two components.

```bash
graph-find-path.sh <from> <to>
```

**Example:**
```bash
graph-find-path.sh OrderController PaymentGateway
```

---

### graph-index-delta.sh

Trigger incremental graph indexing (updates changed files only).

```bash
graph-index-delta.sh
```

---

## How It Works

1. **Code Parsing**: Source files are parsed to extract components, functions, and relationships
2. **Graph Storage**: Relationships stored in CozoDB as a graph database
3. **Query**: Graph queries traverse relationships to find connections

---

## Proactive Usage Pattern

Graph queries should be used **proactively** when:

- After reading ANY code file - Query for dependencies
- Before modifying a function - Find all callers
- When changing a model - Find serializers and associations
- Before refactoring - Understand the impact

**Example workflow:**
```bash
# User: "Change the User model to add a phone field"
# Agent should immediately query the graph:

graph-describe.sh User
# Shows: associations, serializers, child classes

graph-find-serializers.sh User
# Shows: UserSerializer, UserDetailSerializer (need updating)

graph-find-related.sh User
# Shows: all components that depend on User
```

**The graph query takes 1 second. A broken deployment takes hours to fix.**

---

## Common Patterns

### Before Changing a Function Signature

```bash
# Find everything that calls this function
graph-find-callers.sh my_function

# Check what this function depends on
graph-find-callees.sh my_function
```

### Before Changing a Model

```bash
# Find serializers that need updating
graph-find-serializers.sh MyModel

# Find associations that might break
graph-find-associations.sh MyModel

# Find child classes
graph-describe.sh MyModel
```

### Before Refactoring

```bash
# Understand full component relationships
graph-find-related.sh MyComponent

# Find the dependency chain
graph-find-path.sh ControllerA ServiceB
```

---

## Troubleshooting

### Component not found

```bash
# Check if graph is indexed
curl "http://localhost:23000/api/agents/${AGENT_ID}/graph/stats" | jq

# Trigger indexing
graph-index-delta.sh
```

### Script not found

```bash
# Check PATH
which graph-describe.sh

# Scripts are installed to ~/.local/bin/
# Add to PATH if needed:
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Cannot connect to API

```bash
# Check AI Maestro is running
pm2 status ai-maestro

# Restart if needed
pm2 restart ai-maestro
```

---

## Related Skills

The `graph-query` Claude Code skill provides natural language access to these scripts. When an agent says "what calls this function" or "find serializers for User", the skill translates that to the appropriate script calls.

See: [Graph Query Skill](../skills/graph-query/SKILL.md)

---

## Requirements

- AI Maestro running on `http://localhost:23000`
- tmux session with registered agent
- Indexed code graph (run `graph-index-delta.sh` first)
- `curl` and `jq` installed

---

## License

MIT License - Same as AI Maestro
