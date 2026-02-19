#!/bin/bash
# EPCP Merge Reports — Combines findings from all 3 review phases into one final report.
#
# Usage:
#   epcp-merge-reports.sh <output_dir> [report_glob_pattern]
#
# Arguments:
#   output_dir           Directory containing phase reports and where final report goes
#   report_glob_pattern  Optional glob pattern (default: "epcp-*.md")
#
# Expects reports named:
#   epcp-correctness-*.md  (Phase 1 — code correctness, may be multiple)
#   epcp-claims.md         (Phase 2 — claim verification)
#   epcp-review.md         (Phase 3 — skeptical review)
#
# Output:
#   pr-review-YYYY-MM-DD-HHMMSS.md  (merged final report)
#
# Exit codes:
#   0 — No MUST-FIX issues found
#   1 — MUST-FIX issues found (PR needs changes before merge)
#   2 — Error (missing reports, invalid input)

set -eo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

OUTPUT_DIR="${1:-.}"
PATTERN="${2:-epcp-*.md}"
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
FINAL_REPORT="${OUTPUT_DIR}/pr-review-${TIMESTAMP}.md"

# ── Validate input ────────────────────────────────────────────────────────────
if [ ! -d "$OUTPUT_DIR" ]; then
    echo -e "${RED}Error: Output directory '${OUTPUT_DIR}' does not exist${NC}"
    exit 2
fi

# Find all phase reports
REPORTS=()
while IFS= read -r -d '' file; do
    REPORTS+=("$file")
done < <(find "$OUTPUT_DIR" -maxdepth 1 -name "$PATTERN" -print0 | sort -z)

if [ ${#REPORTS[@]} -eq 0 ]; then
    echo -e "${RED}Error: No reports matching '${PATTERN}' found in '${OUTPUT_DIR}'${NC}"
    exit 2
fi

echo -e "${CYAN}EPCP Report Merger${NC}"
echo -e "Found ${#REPORTS[@]} reports to merge"
echo ""

# ── Count findings by severity ─────────────────────────────────────────────────
MUST_FIX_COUNT=0
SHOULD_FIX_COUNT=0
NIT_COUNT=0
TOTAL_FINDINGS=0

# Track unique finding IDs to deduplicate
declare -A SEEN_FINDINGS

# Temporary files for categorized findings
MUST_FIX_FINDINGS=$(mktemp)
SHOULD_FIX_FINDINGS=$(mktemp)
NIT_FINDINGS=$(mktemp)
CLEAN_FILES=$(mktemp)
VERIFIED_CLAIMS=$(mktemp)

trap 'rm -f "$MUST_FIX_FINDINGS" "$SHOULD_FIX_FINDINGS" "$NIT_FINDINGS" "$CLEAN_FILES" "$VERIFIED_CLAIMS"' EXIT

# ── Process each report ────────────────────────────────────────────────────────
for report in "${REPORTS[@]}"; do
    report_name=$(basename "$report")
    echo -e "  Processing: ${report_name}"

    # Extract MUST-FIX sections
    in_section=""
    finding_id=""

    while IFS= read -r line; do
        # Detect section headers
        if echo "$line" | grep -qiE '^#{1,3}\s*(MUST.FIX|FAILED CLAIMS)'; then
            in_section="must-fix"
            continue
        elif echo "$line" | grep -qiE '^#{1,3}\s*SHOULD.FIX|^#{1,3}\s*PARTIALLY IMPLEMENTED'; then
            in_section="should-fix"
            continue
        elif echo "$line" | grep -qiE '^#{1,3}\s*NIT|^#{1,3}\s*CONSISTENCY ISSUES'; then
            in_section="nit"
            continue
        elif echo "$line" | grep -qiE '^#{1,3}\s*CLEAN|^#{1,3}\s*VERIFIED'; then
            in_section="clean"
            continue
        elif echo "$line" | grep -qiE '^#{1,2}\s*[0-9]|^#{1,2}\s*[A-Z]' && [ "$in_section" != "" ]; then
            # New top-level section, exit current parsing
            in_section=""
            continue
        fi

        # Extract finding IDs like [CC-001], [CV-001], [SR-001]
        if echo "$line" | grep -qE '^\#{2,5}\s*\['; then
            finding_id=$(echo "$line" | grep -oE '\[[A-Z]{2}-[0-9]+\]' | head -1)
        fi

        # Route content to appropriate category
        case "$in_section" in
            must-fix)
                echo "$line" >> "$MUST_FIX_FINDINGS"
                if [ -n "$finding_id" ] && [ -z "${SEEN_FINDINGS[$finding_id]+x}" ]; then
                    SEEN_FINDINGS[$finding_id]=1
                    MUST_FIX_COUNT=$((MUST_FIX_COUNT + 1))
                    TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
                    finding_id=""
                fi
                ;;
            should-fix)
                echo "$line" >> "$SHOULD_FIX_FINDINGS"
                if [ -n "$finding_id" ] && [ -z "${SEEN_FINDINGS[$finding_id]+x}" ]; then
                    SEEN_FINDINGS[$finding_id]=1
                    SHOULD_FIX_COUNT=$((SHOULD_FIX_COUNT + 1))
                    TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
                    finding_id=""
                fi
                ;;
            nit)
                echo "$line" >> "$NIT_FINDINGS"
                if [ -n "$finding_id" ] && [ -z "${SEEN_FINDINGS[$finding_id]+x}" ]; then
                    SEEN_FINDINGS[$finding_id]=1
                    NIT_COUNT=$((NIT_COUNT + 1))
                    TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
                    finding_id=""
                fi
                ;;
            clean)
                echo "$line" >> "$CLEAN_FILES"
                ;;
        esac
    done < "$report"
done

# ── Generate final report ──────────────────────────────────────────────────────
cat > "$FINAL_REPORT" << HEADER
# EPCP Final PR Review Report

**Generated:** ${TIMESTAMP}
**Reports merged:** ${#REPORTS[@]}
**Pipeline:** Code Correctness → Claim Verification → Skeptical Review

---

## Summary

| Severity | Count |
|----------|-------|
| **MUST-FIX** | ${MUST_FIX_COUNT} |
| **SHOULD-FIX** | ${SHOULD_FIX_COUNT} |
| **NIT** | ${NIT_COUNT} |
| **Total findings** | ${TOTAL_FINDINGS} |

HEADER

# Add verdict based on findings
if [ "$MUST_FIX_COUNT" -gt 0 ]; then
    echo "**Verdict: REQUEST CHANGES** — ${MUST_FIX_COUNT} must-fix issue(s) found." >> "$FINAL_REPORT"
elif [ "$SHOULD_FIX_COUNT" -gt 0 ]; then
    echo "**Verdict: APPROVE WITH CHANGES** — No blocking issues, but ${SHOULD_FIX_COUNT} recommended fix(es)." >> "$FINAL_REPORT"
else
    echo "**Verdict: APPROVE** — No significant issues found." >> "$FINAL_REPORT"
fi

{
    echo ""
    echo "---"
    echo ""
} >> "$FINAL_REPORT"

# MUST-FIX section
if [ "$MUST_FIX_COUNT" -gt 0 ]; then
    {
        echo "## MUST-FIX Issues"
        echo ""
        cat "$MUST_FIX_FINDINGS"
        echo ""
        echo "---"
        echo ""
    } >> "$FINAL_REPORT"
fi

# SHOULD-FIX section
if [ "$SHOULD_FIX_COUNT" -gt 0 ]; then
    {
        echo "## SHOULD-FIX Issues"
        echo ""
        cat "$SHOULD_FIX_FINDINGS"
        echo ""
        echo "---"
        echo ""
    } >> "$FINAL_REPORT"
fi

# NIT section
if [ "$NIT_COUNT" -gt 0 ]; then
    {
        echo "## Nits & Suggestions"
        echo ""
        cat "$NIT_FINDINGS"
        echo ""
        echo "---"
        echo ""
    } >> "$FINAL_REPORT"
fi

# Source reports
{
    echo "## Source Reports"
    echo ""
    for report in "${REPORTS[@]}"; do
        echo "- \`$(basename "$report")\`"
    done
    echo ""
} >> "$FINAL_REPORT"

# ── Print summary to stdout ───────────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}  EPCP Final Report: ${FINAL_REPORT}${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""

if [ "$MUST_FIX_COUNT" -gt 0 ]; then
    echo -e "  ${RED}MUST-FIX:    ${MUST_FIX_COUNT}${NC}"
else
    echo -e "  ${GREEN}MUST-FIX:    0${NC}"
fi

if [ "$SHOULD_FIX_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}SHOULD-FIX:  ${SHOULD_FIX_COUNT}${NC}"
else
    echo -e "  ${GREEN}SHOULD-FIX:  0${NC}"
fi

echo -e "  NIT:         ${NIT_COUNT}"
echo -e "  Total:       ${TOTAL_FINDINGS}"
echo ""

if [ "$MUST_FIX_COUNT" -gt 0 ]; then
    echo -e "${RED}PR needs changes before merge.${NC}"
    exit 1
else
    echo -e "${GREEN}No blocking issues found.${NC}"
    exit 0
fi
