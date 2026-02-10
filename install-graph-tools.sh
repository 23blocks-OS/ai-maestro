#!/bin/bash
# AI Maestro Graph Tools Installer
# Installs graph query shell scripts to ~/.local/bin and skill to ~/.claude/skills

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
SKILL_DIR="$HOME/.claude/skills/graph-query"
SHARE_DIR="$HOME/.local/share/aimaestro/shell-helpers"

# Parse arguments (v0.21.26: added -y for consistency with other installers)
NON_INTERACTIVE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--non-interactive) NON_INTERACTIVE=true; shift ;;
        -h|--help) echo "Usage: ./install-graph-tools.sh [-y]"; exit 0 ;;
        *) shift ;;
    esac
done

echo "AI Maestro Graph Tools Installer"
echo "================================="
echo ""

# Create directories if needed
mkdir -p "$INSTALL_DIR"
mkdir -p "$SKILL_DIR"
mkdir -p "$SHARE_DIR"

# Install common shell helpers first
echo "Installing common shell helpers to $SHARE_DIR..."
cp "$SCRIPT_DIR/scripts/shell-helpers/common.sh" "$SHARE_DIR/common.sh"
chmod +x "$SHARE_DIR/common.sh"
echo "  Installed: common.sh"

echo ""
# Install graph scripts
echo "Installing graph scripts to $INSTALL_DIR..."
# Scripts are in plugin/plugins/ai-maestro/scripts/
for script in "$SCRIPT_DIR/plugin/plugins/ai-maestro/scripts"/graph-*.sh "$SCRIPT_DIR/plugin/scripts"/graph-*.sh; do
    if [ -f "$script" ]; then
        script_name=$(basename "$script")
        cp "$script" "$INSTALL_DIR/$script_name"
        chmod +x "$INSTALL_DIR/$script_name"
        echo "  Installed: $script_name"
    fi
done

# Install skill
echo ""
echo "Installing graph-query skill to $SKILL_DIR..."
if [ -f "$SCRIPT_DIR/plugin/plugins/ai-maestro/skills/graph-query/SKILL.md" ]; then
    cp "$SCRIPT_DIR/plugin/plugins/ai-maestro/skills/graph-query/SKILL.md" "$SKILL_DIR/SKILL.md"
elif [ -f "$SCRIPT_DIR/plugin/skills/graph-query/SKILL.md" ]; then
    cp "$SCRIPT_DIR/plugin/skills/graph-query/SKILL.md" "$SKILL_DIR/SKILL.md"
fi
echo "  Installed: SKILL.md"

# Verify jq is available
echo ""
if command -v jq &> /dev/null; then
    echo "✅ jq is installed"
else
    echo "⚠️  jq is not installed (required for graph scripts)"
    echo "   Install with: brew install jq (macOS) or apt install jq (Linux)"
fi

# Setup PATH
echo ""
echo "Configuring PATH..."
source "$SCRIPT_DIR/scripts/shell-helpers/common.sh"
setup_local_bin_path

echo ""
echo "Installation complete!"

# Verify installation
echo ""
if command -v graph-describe.sh &> /dev/null; then
    echo "✅ Scripts are accessible in PATH"
else
    echo "⚠️  Restart terminal or run: source ~/.bashrc (or ~/.zshrc)"
fi
echo ""
echo "Available commands:"
echo "  graph-describe.sh <name>          - Describe a component/function"
echo "  graph-find-callers.sh <function>  - Find who calls a function"
echo "  graph-find-callees.sh <function>  - Find what a function calls"
echo "  graph-find-related.sh <component> - Find related components"
echo "  graph-find-by-type.sh <type>      - Find components by type"
echo "  graph-find-serializers.sh <model> - Find serializers for a model"
echo "  graph-find-associations.sh <model>- Find model associations"
echo "  graph-find-path.sh <from> <to>    - Find call path between functions"
echo ""
echo "Example:"
echo "  graph-describe.sh User"
echo "  graph-find-callers.sh authenticate"

# Standalone hint
echo ""
echo "ℹ️  For a full update (server + all tools), run: ./update-aimaestro.sh"
