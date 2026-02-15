#!/bin/bash
# AI Maestro Doc Tools Installer

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
HELPER_DIR="$HOME/.local/share/aimaestro/shell-helpers"
SKILL_DIR="$HOME/.claude/skills/docs-search"

# Parse arguments (v0.21.26: added -y for consistency with other installers)
NON_INTERACTIVE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--non-interactive) NON_INTERACTIVE=true; shift ;;
        -h|--help) echo "Usage: ./install-doc-tools.sh [-y]"; exit 0 ;;
        *) shift ;;
    esac
done

echo "AI Maestro Doc Tools Installer"
echo "==============================="

mkdir -p "$INSTALL_DIR"
mkdir -p "$HELPER_DIR"
mkdir -p "$SKILL_DIR"

# Install common shell helpers
echo "Installing shell helpers to $HELPER_DIR..."
cp "$SCRIPT_DIR/scripts/shell-helpers/common.sh" "$HELPER_DIR/common.sh"
chmod +x "$HELPER_DIR/common.sh"
echo "  Installed: common.sh"

# Install docs helper (needs to reference installed common.sh)
cat > "$HELPER_DIR/docs-helper.sh" << 'HELPER_EOF'
#!/bin/bash
# AI Maestro Documentation Helper Functions

# Source common helpers from installed location
source "${HOME}/.local/share/aimaestro/shell-helpers/common.sh"

# Make a docs query API call
docs_query() {
    local agent_id="$1"
    local action="$2"
    shift 2
    local params="$@"
    api_query "GET" "/api/agents/${agent_id}/docs?action=${action}${params}"
}

# Index documentation
docs_index() {
    local agent_id="$1"
    local project_path="$2"
    local body="{}"
    if [ -n "$project_path" ]; then
        body=$(jq -n --arg path "$project_path" '{"projectPath": $path}')
    fi
    api_query "POST" "/api/agents/${agent_id}/docs" -H "Content-Type: application/json" -d "$body"
}

# Search documentation
docs_search() {
    local agent_id="$1"
    local query="$2"
    local limit="${3:-10}"
    local keyword_mode="${4:-false}"
    local encoded_query
    encoded_query=$(printf '%s' "$query" | jq -sRr @uri 2>/dev/null || echo "$query")
    if [ "$keyword_mode" = "true" ]; then
        api_query "GET" "/api/agents/${agent_id}/docs?action=search&keyword=${encoded_query}&limit=${limit}"
    else
        api_query "GET" "/api/agents/${agent_id}/docs?action=search&q=${encoded_query}&limit=${limit}"
    fi
}

# Get documentation stats
docs_stats() {
    local agent_id="$1"
    docs_query "$agent_id" "stats"
}

# List documentation
docs_list() {
    local agent_id="$1"
    local doc_type="${2:-}"
    if [ -n "$doc_type" ]; then
        docs_query "$agent_id" "list" "&type=${doc_type}"
    else
        docs_query "$agent_id" "list"
    fi
}

# Get specific document
docs_get() {
    local agent_id="$1"
    local doc_id="$2"
    docs_query "$agent_id" "get" "&id=${doc_id}"
}

# Find by type
docs_find_by_type() {
    local agent_id="$1"
    local doc_type="$2"
    docs_query "$agent_id" "find" "&type=${doc_type}"
}

# Initialize docs
init_docs() {
    init_common || return 1
}
HELPER_EOF
chmod +x "$HELPER_DIR/docs-helper.sh"
echo "  Installed: docs-helper.sh"

# Install doc scripts (modified to use installed helper)
echo ""
echo "Installing doc scripts to $INSTALL_DIR..."
# Scripts are in plugin/plugins/ai-maestro/scripts/
for script in "$SCRIPT_DIR/plugin/plugins/ai-maestro/scripts"/docs-*.sh "$SCRIPT_DIR/plugin/scripts"/docs-*.sh; do
    if [ -f "$script" ]; then
        script_name=$(basename "$script")
        # Skip the helper (already installed separately)
        if [ "$script_name" = "docs-helper.sh" ]; then
            continue
        fi
        # Modify script to use installed helper location
        # Pattern handles: source or dot-source, with or without braces around SCRIPT_DIR
        sed -E 's#(source|\.) +"?\$\{?SCRIPT_DIR\}?/docs-helper\.sh"?#source "${HOME}/.local/share/aimaestro/shell-helpers/docs-helper.sh"#g' "$script" > "$INSTALL_DIR/$script_name"
        # Verify the substitution succeeded (installed script should NOT still reference SCRIPT_DIR/docs-helper.sh)
        if grep -q 'SCRIPT_DIR.*/docs-helper\.sh' "$INSTALL_DIR/$script_name"; then
            echo "  WARNING: sed substitution may have failed for $script_name - source path was not rewritten"
        fi
        chmod +x "$INSTALL_DIR/$script_name"
        echo "  Installed: $script_name"
    fi
done

# Install skill
echo ""
echo "Installing docs-search skill to $SKILL_DIR..."
if [ -f "$SCRIPT_DIR/plugin/plugins/ai-maestro/skills/docs-search/SKILL.md" ]; then
    cp "$SCRIPT_DIR/plugin/plugins/ai-maestro/skills/docs-search/SKILL.md" "$SKILL_DIR/SKILL.md"
    echo "  Installed: SKILL.md"
elif [ -f "$SCRIPT_DIR/plugin/skills/docs-search/SKILL.md" ]; then
    cp "$SCRIPT_DIR/plugin/skills/docs-search/SKILL.md" "$SKILL_DIR/SKILL.md"
    echo "  Installed: SKILL.md"
else
    echo "  Warning: SKILL.md not found, skipping"
fi

# Verify jq is available
echo ""
if command -v jq &> /dev/null; then
    echo "✅ jq is installed"
else
    echo "⚠️  jq is not installed (required for docs scripts)"
    echo "   Install with: brew install jq (macOS) or apt install jq (Linux)"
fi

# Setup PATH
echo ""
echo "Configuring PATH..."
source "$SCRIPT_DIR/scripts/shell-helpers/common.sh"
setup_local_bin_path

echo ""
echo "Installation complete!"
echo ""
echo "Available commands:"
echo "  docs-search.sh \"<query>\"      - Search documentation"
echo "  docs-find-by-type.sh <type>   - Find docs by type"
echo "  docs-stats.sh                 - Show doc statistics"
echo "  docs-index.sh                 - Index documentation"
echo "  docs-index-delta.sh           - Delta index (changed files only)"
echo "  docs-list.sh                  - List indexed documents"
echo "  docs-get.sh <doc-id>          - Get specific document"
echo ""

# Verify installation
if command -v docs-search.sh &> /dev/null; then
    echo "✅ Scripts are accessible in PATH"
else
    echo "⚠️  Restart terminal or run: source ~/.bashrc (or ~/.zshrc)"
fi

# Standalone hint
echo ""
echo "ℹ️  For a full update (server + all tools), run: ./update-aimaestro.sh"
