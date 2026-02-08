#!/bin/bash
# AI Maestro Memory Tools Installer

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
SKILL_DIR="$HOME/.claude/skills/memory-search"
SHARE_DIR="$HOME/.local/share/aimaestro/shell-helpers"

# Parse arguments (v0.21.26: added -y for consistency with other installers)
NON_INTERACTIVE=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -y|--yes|--non-interactive) NON_INTERACTIVE=true; shift ;;
        -h|--help) echo "Usage: ./install-memory-tools.sh [-y]"; exit 0 ;;
        *) shift ;;
    esac
done

echo "AI Maestro Memory Tools Installer"
echo "=================================="
echo ""

# Check for jq dependency
echo "Checking dependencies..."
if command -v jq &> /dev/null; then
    echo "  ✅ jq is installed"
else
    echo "  ⚠️  jq is not installed (required for memory scripts)"
    echo "     Install with: brew install jq (macOS) or apt install jq (Linux)"
fi
echo ""

mkdir -p "$INSTALL_DIR"
mkdir -p "$SKILL_DIR"
mkdir -p "$SHARE_DIR"

# Install common shell helpers first
echo "Installing common shell helpers to $SHARE_DIR..."
cp "$SCRIPT_DIR/scripts/shell-helpers/common.sh" "$SHARE_DIR/common.sh"
chmod +x "$SHARE_DIR/common.sh"
echo "  Installed: common.sh"

echo ""
echo "Installing memory scripts to $INSTALL_DIR..."
# v0.21.26 fix: memory_scripts/ never existed; actual scripts are in plugin/scripts/
for script in "$SCRIPT_DIR/plugin/scripts"/memory-*.sh; do
    if [ -f "$script" ]; then
        script_name=$(basename "$script")
        cp "$script" "$INSTALL_DIR/$script_name"
        chmod +x "$INSTALL_DIR/$script_name"
        echo "  Installed: $script_name"
    fi
done

echo ""
echo "Installing memory-search skill to $SKILL_DIR..."
cp "$SCRIPT_DIR/plugin/skills/memory-search/SKILL.md" "$SKILL_DIR/SKILL.md"
echo "  Installed: SKILL.md"

# Setup PATH
echo ""
echo "Configuring PATH..."
source "$SCRIPT_DIR/scripts/shell-helpers/common.sh"
setup_local_bin_path

echo ""
echo "Installation complete!"
echo ""
echo "Available commands:"
echo "  memory-search.sh \"<query>\"   - Search conversation history"
echo ""

# Verify installation
if command -v memory-search.sh &> /dev/null; then
    echo "✅ Scripts are accessible in PATH"
else
    echo "⚠️  Restart terminal or run: source ~/.bashrc (or ~/.zshrc)"
fi

# Standalone hint
echo ""
echo "ℹ️  For a full update (server + all tools), run: ./update-aimaestro.sh"
