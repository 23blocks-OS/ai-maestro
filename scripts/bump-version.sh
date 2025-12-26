#!/bin/bash
# AI Maestro - Version Bump Script
# Centralizes version management across all files
#
# Usage:
#   ./scripts/bump-version.sh patch    # 0.17.12 -> 0.17.13
#   ./scripts/bump-version.sh minor    # 0.17.12 -> 0.18.0
#   ./scripts/bump-version.sh major    # 0.17.12 -> 1.0.0
#   ./scripts/bump-version.sh 0.18.0   # Set specific version

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Read current version from version.json
VERSION_FILE="$PROJECT_ROOT/version.json"
if [ ! -f "$VERSION_FILE" ]; then
    echo -e "${RED}Error: version.json not found${NC}"
    exit 1
fi

CURRENT_VERSION=$(grep -o '"version": *"[^"]*"' "$VERSION_FILE" | cut -d'"' -f4)
echo -e "${CYAN}Current version: ${CURRENT_VERSION}${NC}"

# Parse current version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Determine new version
case "$1" in
    patch)
        PATCH=$((PATCH + 1))
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
        ;;
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
        ;;
    "")
        echo ""
        echo "Usage: $0 <patch|minor|major|version>"
        echo ""
        echo "Examples:"
        echo "  $0 patch    # ${CURRENT_VERSION} -> ${MAJOR}.${MINOR}.$((PATCH + 1))"
        echo "  $0 minor    # ${CURRENT_VERSION} -> ${MAJOR}.$((MINOR + 1)).0"
        echo "  $0 major    # ${CURRENT_VERSION} -> $((MAJOR + 1)).0.0"
        echo "  $0 1.0.0    # ${CURRENT_VERSION} -> 1.0.0"
        exit 0
        ;;
    *)
        # Validate version format
        if [[ ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo -e "${RED}Error: Invalid version format. Use X.Y.Z${NC}"
            exit 1
        fi
        NEW_VERSION="$1"
        ;;
esac

echo -e "${GREEN}New version: ${NEW_VERSION}${NC}"
echo ""

# Files to update
FILES_UPDATED=0

update_file() {
    local file="$1"
    local pattern="$2"
    local replacement="$3"
    local description="$4"

    if [ -f "$file" ]; then
        if grep -q "$pattern" "$file" 2>/dev/null; then
            sed -i '' "s|$pattern|$replacement|g" "$file"
            echo -e "  ${GREEN}✓${NC} $description"
            FILES_UPDATED=$((FILES_UPDATED + 1))
        fi
    fi
}

echo "Updating files..."
echo ""

# 1. version.json
sed -i '' "s|\"version\": \"$CURRENT_VERSION\"|\"version\": \"$NEW_VERSION\"|g" "$VERSION_FILE"
sed -i '' "s|\"releaseDate\": \"[^\"]*\"|\"releaseDate\": \"$(date +%Y-%m-%d)\"|g" "$VERSION_FILE"
echo -e "  ${GREEN}✓${NC} version.json"
FILES_UPDATED=$((FILES_UPDATED + 1))

# 2. package.json
update_file "$PROJECT_ROOT/package.json" \
    "\"version\": \"$CURRENT_VERSION\"" \
    "\"version\": \"$NEW_VERSION\"" \
    "package.json"

# 3. remote-install.sh
update_file "$PROJECT_ROOT/scripts/remote-install.sh" \
    "VERSION=\"$CURRENT_VERSION\"" \
    "VERSION=\"$NEW_VERSION\"" \
    "scripts/remote-install.sh"

# 4. README.md (version badge)
update_file "$PROJECT_ROOT/README.md" \
    "version-$CURRENT_VERSION-" \
    "version-$NEW_VERSION-" \
    "README.md (badge)"

# 5. docs/index.html (softwareVersion in schema)
update_file "$PROJECT_ROOT/docs/index.html" \
    "\"softwareVersion\": \"$CURRENT_VERSION\"" \
    "\"softwareVersion\": \"$NEW_VERSION\"" \
    "docs/index.html (schema)"

# 6. docs/index.html (display version)
update_file "$PROJECT_ROOT/docs/index.html" \
    "<span>v$CURRENT_VERSION</span>" \
    "<span>v$NEW_VERSION</span>" \
    "docs/index.html (display)"

# 7. docs/ai-index.html
update_file "$PROJECT_ROOT/docs/ai-index.html" \
    "\"softwareVersion\": \"$CURRENT_VERSION\"" \
    "\"softwareVersion\": \"$NEW_VERSION\"" \
    "docs/ai-index.html"

# 8. docs/BACKLOG.md (current version header)
if [ -f "$PROJECT_ROOT/docs/BACKLOG.md" ]; then
    sed -i '' "s|\*\*Current Version:\*\* v$CURRENT_VERSION|\*\*Current Version:\*\* v$NEW_VERSION|g" "$PROJECT_ROOT/docs/BACKLOG.md"
    echo -e "  ${GREEN}✓${NC} docs/BACKLOG.md (header)"
    FILES_UPDATED=$((FILES_UPDATED + 1))
fi

echo ""
echo -e "${GREEN}Updated $FILES_UPDATED files${NC}"
echo ""

# Show what changed
echo "Changes:"
git diff --stat 2>/dev/null || true
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Review changes: git diff"
echo "  2. Commit: git add -A && git commit -m \"chore: bump version to $NEW_VERSION\""
echo "  3. Push: git push"
echo ""
