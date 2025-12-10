#!/bin/bash
# AI Maestro Doc Tools Installer

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/bin"
SKILL_DIR="$HOME/.claude/skills/docs-search"

echo "AI Maestro Doc Tools Installer"
echo "==============================="

mkdir -p "$INSTALL_DIR"
mkdir -p "$SKILL_DIR"

echo "Installing doc scripts to $INSTALL_DIR..."
for script in "$SCRIPT_DIR/doc_scripts"/*.sh; do
    if [ -f "$script" ]; then
        script_name=$(basename "$script")
        cp "$script" "$INSTALL_DIR/$script_name"
        chmod +x "$INSTALL_DIR/$script_name"
        echo "  Installed: $script_name"
    fi
done

echo ""
echo "Installing docs-search skill to $SKILL_DIR..."
cp "$SCRIPT_DIR/skills/docs-search/SKILL.md" "$SKILL_DIR/SKILL.md"
echo "  Installed: SKILL.md"

echo ""
echo "Installation complete!"
echo ""
echo "Available commands:"
echo "  doc-search.sh \"<query>\"      - Search documentation"
echo "  doc-find-type.sh <type>      - Find docs by type"
echo "  doc-stats.sh                 - Show doc statistics"
echo "  doc-index.sh                 - Index documentation"
