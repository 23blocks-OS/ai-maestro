#!/bin/bash
# Copy AI Maestro's skills into an agent's own Claude folder (CLAUDE_CONFIG_DIR reads <folder>/skills, not
# ~/.claude/skills). aim-launch.sh runs this at each start of a config-dir agent.
#
#   sync-agent-skills.sh <folder>
#
# Only the plugin's skills, from the copies install-plugin.sh put in ~/.claude/skills. A copy made here carries
# .aimaestro-managed and is refreshed when the source changes; a skill of the same name without that file is the
# agent's own and is never touched. Quiet; exits 0 unless the folder is missing.
set -u
dir="${1:-}"
[ -n "$dir" ] && [ -d "$dir" ] || { echo "sync-agent-skills: no folder ${dir}" >&2; exit 2; }
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_skills="$repo/plugin/plugins/ai-maestro/skills"
src_root="${AIM_SKILLS_SOURCE:-$HOME/.claude/skills}"
[ -d "$plugin_skills" ] || exit 0
mkdir -p "$dir/skills"
MARK=.aimaestro-managed
for s in "$plugin_skills"/*/; do
  name=$(basename "$s")
  src="$src_root/$name"; dst="$dir/skills/$name"
  [ -f "$src/SKILL.md" ] || continue
  if [ -e "$dst" ] && [ ! -f "$dst/$MARK" ]; then continue; fi # the agent's own skill
  if [ -f "$dst/$MARK" ] && diff -rq -x "$MARK" "$src" "$dst" >/dev/null 2>&1; then continue; fi # current
  tmp=$(mktemp -d "$dir/skills/.$name.XXXXXX") || continue
  if cp -R "$src/." "$tmp/" && touch "$tmp/$MARK"; then
    rm -rf "$dst" && mv "$tmp" "$dst"
  else
    rm -rf "$tmp"
  fi
done
exit 0
