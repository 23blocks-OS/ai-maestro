#!/bin/bash
#
# meeting-task.sh — Interact with a team's Meeting Task Kanban from the CLI
#
# The Kanban has UI + API but no CLI path until now. Agents coordinating
# inside a meeting use this to create, update, move, list, and delete tasks.
#
# Statuses (Kanban columns): backlog | pending | in_progress | review | completed
#
# Usage:
#   meeting-task.sh create <team-id> <subject> [--description TEXT] [--owner UUID] [--priority N]
#   meeting-task.sh update <team-id> <task-id> [--subject TEXT] [--description TEXT] [--status S] [--owner UUID] [--priority N]
#   meeting-task.sh move   <team-id> <task-id> <status>
#   meeting-task.sh list   <team-id> [--status S] [--owner UUID]
#   meeting-task.sh delete <team-id> <task-id>
#
# Shared flags:
#   --host URL     API base URL (default: $AIMAESTRO_HOST or http://localhost:23000)
#   --json         Emit the raw API response (useful for auto-mirror / scripting)
#
# Environment:
#   AIMAESTRO_HOST — API base URL default
#

set -euo pipefail

HOST="${AIMAESTRO_HOST:-http://localhost:23000}"
JSON_OUTPUT=false

print_usage() {
  sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'
}

# --- helpers -----------------------------------------------------------------

valid_status() {
  case "$1" in
    backlog|pending|in_progress|review|completed) return 0 ;;
    *) return 1 ;;
  esac
}

die() { echo "Error: $*" >&2; exit 1; }

emit() {
  # $1 = raw json response
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo "$1"
  else
    # Human-readable fallback — caller format per subcommand
    echo "$1" | jq .
  fi
}

# curl wrapper that surfaces HTTP errors with body
api_call() {
  local method="$1"; shift
  local path="$1"; shift
  local body="${1:-}"
  local resp code
  if [[ -n "$body" ]]; then
    resp=$(curl -sS -w $'\n%{http_code}' -X "$method" "${HOST}${path}" \
      -H "Content-Type: application/json" -d "$body") || die "curl failed"
  else
    resp=$(curl -sS -w $'\n%{http_code}' -X "$method" "${HOST}${path}") || die "curl failed"
  fi
  code="${resp##*$'\n'}"
  resp="${resp%$'\n'*}"
  if [[ "$code" =~ ^2 ]]; then
    echo "$resp"
  else
    echo "$resp" >&2
    die "API ${method} ${path} failed with HTTP ${code}"
  fi
}

# --- subcommand: create ------------------------------------------------------

cmd_create() {
  local team_id="${1:-}"; local subject="${2:-}"; shift 2 || true
  [[ -z "$team_id" || -z "$subject" ]] && die "Usage: meeting-task.sh create <team-id> <subject> [--description T] [--owner UUID] [--priority N]"

  local description="" owner="" priority=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --description) description="$2"; shift 2 ;;
      --owner)       owner="$2"; shift 2 ;;
      --priority)    priority="$2"; shift 2 ;;
      --host)        HOST="$2"; shift 2 ;;
      --json)        JSON_OUTPUT=true; shift ;;
      *) die "Unknown flag: $1" ;;
    esac
  done

  local body
  body=$(jq -n \
    --arg subject "$subject" \
    --arg description "$description" \
    --arg owner "$owner" \
    --arg priority "$priority" \
    '{subject: $subject}
     + (if $description != "" then {description: $description} else {} end)
     + (if $owner != "" then {assigneeAgentId: $owner} else {} end)
     + (if $priority != "" then {priority: ($priority | tonumber)} else {} end)')

  local resp
  resp=$(api_call POST "/api/teams/${team_id}/tasks" "$body")

  if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo "$resp"
  else
    local id subj status
    id=$(echo "$resp" | jq -r '.task.id')
    subj=$(echo "$resp" | jq -r '.task.subject')
    status=$(echo "$resp" | jq -r '.task.status')
    echo "Created task ${id}"
    echo "  subject: ${subj}"
    echo "  status:  ${status}"
  fi
}

# --- subcommand: update ------------------------------------------------------

cmd_update() {
  local team_id="${1:-}"; local task_id="${2:-}"; shift 2 || true
  [[ -z "$team_id" || -z "$task_id" ]] && die "Usage: meeting-task.sh update <team-id> <task-id> [--subject T] [--description T] [--status S] [--owner UUID] [--priority N]"

  local subject="" description="" status="" owner="" priority=""
  local have_any=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --subject)     subject="$2";     have_any=true; shift 2 ;;
      --description) description="$2"; have_any=true; shift 2 ;;
      --status)      status="$2";      have_any=true; shift 2 ;;
      --owner)       owner="$2";       have_any=true; shift 2 ;;
      --priority)    priority="$2";    have_any=true; shift 2 ;;
      --host)        HOST="$2"; shift 2 ;;
      --json)        JSON_OUTPUT=true; shift ;;
      *) die "Unknown flag: $1" ;;
    esac
  done

  [[ "$have_any" == "false" ]] && die "update requires at least one of --subject, --description, --status, --owner, --priority"
  if [[ -n "$status" ]] && ! valid_status "$status"; then
    die "Invalid --status '${status}'. Must be: backlog, pending, in_progress, review, completed"
  fi

  local body
  body=$(jq -n \
    --arg subject "$subject" \
    --arg description "$description" \
    --arg status "$status" \
    --arg owner "$owner" \
    --arg priority "$priority" \
    '{} + (if $subject != "" then {subject: $subject} else {} end)
        + (if $description != "" then {description: $description} else {} end)
        + (if $status != "" then {status: $status} else {} end)
        + (if $owner != "" then {assigneeAgentId: $owner} else {} end)
        + (if $priority != "" then {priority: ($priority | tonumber)} else {} end)')

  local resp
  resp=$(api_call PUT "/api/teams/${team_id}/tasks/${task_id}" "$body")

  if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo "$resp"
  else
    local id subj s
    id=$(echo "$resp" | jq -r '.task.id')
    subj=$(echo "$resp" | jq -r '.task.subject')
    s=$(echo "$resp" | jq -r '.task.status')
    echo "Updated task ${id}"
    echo "  subject: ${subj}"
    echo "  status:  ${s}"
  fi
}

# --- subcommand: move --------------------------------------------------------

cmd_move() {
  local team_id="${1:-}"; local task_id="${2:-}"; local status="${3:-}"
  shift 3 || true
  [[ -z "$team_id" || -z "$task_id" || -z "$status" ]] && die "Usage: meeting-task.sh move <team-id> <task-id> <status>"
  valid_status "$status" || die "Invalid status '${status}'. Must be: backlog, pending, in_progress, review, completed"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --host) HOST="$2"; shift 2 ;;
      --json) JSON_OUTPUT=true; shift ;;
      *) die "Unknown flag: $1" ;;
    esac
  done

  local body
  body=$(jq -n --arg status "$status" '{status: $status}')
  local resp
  resp=$(api_call PUT "/api/teams/${team_id}/tasks/${task_id}" "$body")

  if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo "$resp"
  else
    local subj
    subj=$(echo "$resp" | jq -r '.task.subject')
    echo "Moved task ${task_id} → ${status}"
    echo "  subject: ${subj}"
  fi
}

# --- subcommand: list --------------------------------------------------------

cmd_list() {
  local team_id="${1:-}"; shift || true
  [[ -z "$team_id" ]] && die "Usage: meeting-task.sh list <team-id> [--status S] [--owner UUID]"

  local filter_status="" filter_owner=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --status) filter_status="$2"; shift 2 ;;
      --owner)  filter_owner="$2"; shift 2 ;;
      --host)   HOST="$2"; shift 2 ;;
      --json)   JSON_OUTPUT=true; shift ;;
      *) die "Unknown flag: $1" ;;
    esac
  done
  if [[ -n "$filter_status" ]] && ! valid_status "$filter_status"; then
    die "Invalid --status '${filter_status}'. Must be: backlog, pending, in_progress, review, completed"
  fi

  local resp
  resp=$(api_call GET "/api/teams/${team_id}/tasks")

  local filtered
  filtered=$(echo "$resp" | jq --arg s "$filter_status" --arg o "$filter_owner" \
    '.tasks
     | map(select(($s == "" or .status == $s) and ($o == "" or .assigneeAgentId == $o)))')

  if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo "$filtered"
  else
    local count
    count=$(echo "$filtered" | jq 'length')
    echo "${count} task(s)${filter_status:+ in ${filter_status}}${filter_owner:+ owned by ${filter_owner}}"
    echo "$filtered" | jq -r '.[] | "  [\(.status)] \(.id[0:8])  \(.subject)"'
  fi
}

# --- subcommand: delete ------------------------------------------------------

cmd_delete() {
  local team_id="${1:-}"; local task_id="${2:-}"; shift 2 || true
  [[ -z "$team_id" || -z "$task_id" ]] && die "Usage: meeting-task.sh delete <team-id> <task-id>"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --host) HOST="$2"; shift 2 ;;
      --json) JSON_OUTPUT=true; shift ;;
      *) die "Unknown flag: $1" ;;
    esac
  done

  local resp
  resp=$(api_call DELETE "/api/teams/${team_id}/tasks/${task_id}")
  if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo "$resp"
  else
    echo "Deleted task ${task_id}"
  fi
}

# --- main --------------------------------------------------------------------

SUBCMD="${1:-}"
if [[ -z "$SUBCMD" || "$SUBCMD" == "-h" || "$SUBCMD" == "--help" ]]; then
  print_usage
  exit 0
fi
shift

case "$SUBCMD" in
  create) cmd_create "$@" ;;
  update) cmd_update "$@" ;;
  move)   cmd_move   "$@" ;;
  list)   cmd_list   "$@" ;;
  delete) cmd_delete "$@" ;;
  *) print_usage; die "Unknown subcommand: ${SUBCMD}" ;;
esac
