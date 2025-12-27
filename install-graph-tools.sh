#!/bin/bash
# AI Maestro Graph Tools Installer
# Installs graph query shell scripts to ~/.local/bin and skill to ~/.claude/skills

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
SKILL_DIR="$HOME/.claude/skills/graph-query"
SHARE_DIR="$HOME/.local/share/aimaestro/shell-helpers"

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
for script in "$SCRIPT_DIR/graph_scripts"/*.sh; do
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
cp "$SCRIPT_DIR/skills/graph-query/SKILL.md" "$SKILL_DIR/SKILL.md"
echo "  Installed: SKILL.md"

# Check if ~/.local/bin is in PATH
echo ""
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo "NOTE: $INSTALL_DIR is not in your PATH."
    echo ""
    echo "Add this to your ~/.bashrc or ~/.zshrc:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
else
    echo "PATH already includes $INSTALL_DIR"
fi

# Verify jq is available
echo ""
if command -v jq &> /dev/null; then
    echo "jq is installed."
else
    echo "WARNING: jq is not installed. Graph scripts require jq."
    echo "Install with: brew install jq"
fi

echo ""
echo "Installation complete!"
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
