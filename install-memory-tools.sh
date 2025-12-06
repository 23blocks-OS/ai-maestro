#!/bin/bash
# AI Maestro Memory Tools Installer

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
SKILL_DIR="$HOME/.claude/skills/memory-search"

echo "AI Maestro Memory Tools Installer"
echo "=================================="

mkdir -p "$INSTALL_DIR"
mkdir -p "$SKILL_DIR"

echo "Installing memory scripts to $INSTALL_DIR..."
for script in "$SCRIPT_DIR/memory_scripts"/*.sh; do
    if [ -f "$script" ]; then
        script_name=$(basename "$script")
        cp "$script" "$INSTALL_DIR/$script_name"
        chmod +x "$INSTALL_DIR/$script_name"
        echo "  Installed: $script_name"
    fi
done

echo ""
echo "Installing memory-search skill to $SKILL_DIR..."
cp "$SCRIPT_DIR/skills/memory-search/SKILL.md" "$SKILL_DIR/SKILL.md"
echo "  Installed: SKILL.md"

echo ""
echo "Installation complete!"
echo ""
echo "Available commands:"
echo "  memory-search.sh \"<query>\"   - Search conversation history"
