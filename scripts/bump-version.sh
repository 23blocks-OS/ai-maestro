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

# Early exit if version is already at target (v0.21.25 fix).
# Without this guard, running `bump-version.sh 0.21.25` when already at 0.21.25
# would proceed to sed replacements where pattern == replacement, which on some
# BSD sed versions causes confusing errors.
if [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
    echo -e "${YELLOW}Version is already ${NEW_VERSION}, nothing to do${NC}"
    exit 0
fi

# Files to update
FILES_UPDATED=0

# Portable in-place sed — works on both macOS (BSD) and Linux (GNU).
# The old `sed -i '' ...` syntax is BSD-specific and breaks on Linux.
# Using `sed -i.bak` creates a temporary backup file (works everywhere),
# then we remove the .bak file immediately after.
_sed_inplace() {
    local file="$1"
    shift
    sed -i.bak "$@" "$file" && rm -f "${file}.bak"
}

# Files that were present but could not be updated. A non-empty list fails the
# run — see the note at the bottom of this function.
FILES_MISSED=()

update_file() {
    local file="$1"
    local pattern="$2"
    local replacement="$3"
    local description="$4"

    # A file that is not in this checkout is not a failure — docs/ are optional
    # in some clones. A file that IS here and does not contain the version we
    # expected IS a failure, and used to be silent.
    if [ ! -f "$file" ]; then
        return 0
    fi

    if ! grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "  ${YELLOW}!${NC} $description — expected version not found, NOT updated"
        FILES_MISSED+=("$description")
        return 0
    fi

    _sed_inplace "$file" "s|$pattern|$replacement|g"

    # Verify rather than assume. sed can match the grep pattern and still fail to
    # substitute (an unescaped delimiter in the replacement, for instance), and
    # a bump that reports success it did not earn is exactly how package.json sat
    # at 0.29.16 for fifteen releases while every run printed a tick.
    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "  ${YELLOW}!${NC} $description — substitution did not take, NOT updated"
        FILES_MISSED+=("$description")
        return 0
    fi

    echo -e "  ${GREEN}✓${NC} $description"
    FILES_UPDATED=$((FILES_UPDATED + 1))
}

echo "Updating files..."
echo ""

# 1. version.json — the source of truth, so update it STRUCTURALLY.
#
# This used an unchecked sed keyed on `"version": "x"` with a space after the
# colon, and printed a tick unconditionally. Reformat the file (jq, a merge, an
# editor) and the pattern stops matching: the version would freeze at whatever
# it was, every subsequent bump would read that same stale value as
# CURRENT_VERSION, and every release would still report success. That is the
# package.json failure again, on the one file everything else is derived from.
node -e "
  const fs = require('fs');
  const f = process.argv[1];
  const v = JSON.parse(fs.readFileSync(f, 'utf8'));
  v.version = process.argv[2];
  v.releaseDate = process.argv[3];
  fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n');
" "$VERSION_FILE" "$NEW_VERSION" "$(date -u +%Y-%m-%d)"

# Read it back. Claiming a bump that did not land is how the drift starts.
WROTE_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version)" "$VERSION_FILE" 2>/dev/null || echo "")
if [ "$WROTE_VERSION" != "$NEW_VERSION" ]; then
    echo -e "  ${RED}✗${NC} version.json — wrote $NEW_VERSION but file reads '$WROTE_VERSION'"
    echo ""
    echo -e "${RED}Aborting: the source of truth was not updated.${NC}"
    exit 1
fi
echo -e "  ${GREEN}✓${NC} version.json"
FILES_UPDATED=$((FILES_UPDATED + 1))

# 2. package.json — set the ROOT version regardless of its prior value.
# (The old string-match approach keyed on CURRENT_VERSION, so once package.json
# drifted from version.json it was silently skipped on every subsequent bump —
# it sat at 0.29.16 for many releases. node preserves structure + only touches
# the top-level version field, never dependency versions.)
if [ -f "$PROJECT_ROOT/package.json" ]; then
    node -e "const f=process.argv[1];const fs=require('fs');const p=JSON.parse(fs.readFileSync(f,'utf8'));p.version=process.argv[2];fs.writeFileSync(f,JSON.stringify(p,null,2)+'\n');" \
        "$PROJECT_ROOT/package.json" "$NEW_VERSION"
    echo -e "  ${GREEN}✓${NC} package.json"
    FILES_UPDATED=$((FILES_UPDATED + 1))
fi

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
#
# This ran sed unconditionally and printed a tick whether or not anything
# changed — not a silent skip but an outright false claim, and the reason the
# header had to be corrected by hand after every release.
update_file "$PROJECT_ROOT/docs/BACKLOG.md" \
    "\*\*Current Version:\*\* v$CURRENT_VERSION" \
    "**Current Version:** v$NEW_VERSION" \
    "docs/BACKLOG.md (header)"

echo ""
echo -e "${GREEN}Updated $FILES_UPDATED files${NC}"

# Fail loudly on anything we were supposed to update and did not.
#
# The whole point: a bump that half-applies is worse than one that refuses,
# because the drift compounds silently over every subsequent release. This is
# what let package.json sit at 0.29.16 for fifteen releases while the script
# reported success each time.
if [ ${#FILES_MISSED[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}${#FILES_MISSED[@]} file(s) were NOT updated:${NC}"
    for missed in "${FILES_MISSED[@]}"; do
        echo -e "  ${RED}✗${NC} $missed"
    done
    echo ""
    echo "These files did not contain version $CURRENT_VERSION, so they had already"
    echo "drifted. Fix them by hand, then re-run — version.json now says $NEW_VERSION."
    exit 1
fi

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
