#!/bin/bash
# Living-avatar loops for one agent, locally and free, with LivePortrait
# (https://github.com/KlingTeam/LivePortrait). See backlog F012.
#
# Usage:
#   LIVEPORTRAIT_DIR=~/LivePortrait scripts/avatars/liveportrait-loops.sh <agent-id> <portrait.png> [out-dir]
#
# LIVEPORTRAIT_DIR: a LivePortrait checkout with its .venv (Python 3.10,
# requirements_macOS.txt) and pretrained_weights (hf download KlingTeam/LivePortrait).
# Writes idle/working/waiting .mp4 (384px, 8 s, forward+reverse so each loops
# seamlessly) to out-dir, default ~/.aimaestro/agents/<id>/avatar/.
#
# Drivers are LivePortrait's own samples: idle = d19 (calm micro-motion),
# working = d9 head pose only (the full driver also moved the mouth, which read
# as talking), waiting = d0 (attentive glance and smile).
#
# Licence note: LivePortrait's face detection uses InsightFace models that are
# licensed for non-commercial use. Fine for your own agents; do not bundle the
# models or generated clips in a product without checking.
set -euo pipefail
ID=${1:?agent id}; SRC=${2:?portrait image}
OUT=${3:-$HOME/.aimaestro/agents/$ID/avatar}
LP=${LIVEPORTRAIT_DIR:?set LIVEPORTRAIT_DIR}
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"
cd "$LP" && . .venv/bin/activate
DRV=assets/examples/driving
ffmpeg -y -loglevel error -ss 0 -t 4 -i $DRV/d19.mp4 "$TMP/idle.mp4"
ffmpeg -y -loglevel error -ss 2 -t 4 -i $DRV/d9.mp4 "$TMP/working.mp4"
cp $DRV/d0.mp4 "$TMP/waiting.mp4"
cp "$SRC" "$TMP/face.png"
for state in idle working waiting; do
  args=(--driving_multiplier 0.8)
  [ $state = working ] && args=(--animation_region pose --driving_multiplier 1.0)
  PYTORCH_ENABLE_MPS_FALLBACK=1 python inference.py -s "$TMP/face.png" -d "$TMP/$state.mp4" -o "$TMP/raw" "${args[@]}" >/dev/null 2>&1
  ffmpeg -y -loglevel error -i "$TMP/raw/face--$state.mp4" \
    -filter_complex "[0]scale=384:384,split[f][r];[r]reverse[b];[f][b]concat=n=2:v=1" \
    -an -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart "$OUT/$state.mp4"
  echo "$state -> $OUT/$state.mp4"
done
