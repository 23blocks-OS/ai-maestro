#!/bin/bash
# Installs local speech (Kokoro) and hearing (faster-whisper) in ~/.aimaestro/voice, for agents with a local voice
# and devices with hold to talk. Optional: about 600 MB on disk, and no memory until an agent speaks. Run it again to repair.
set -euo pipefail

DIR="$HOME/.aimaestro/voice"
BASE=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
MODEL_SHA=6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb
VOICES_SHA=bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

fetch() { # url file expected-sha
  if [ -f "$DIR/$2" ] && [ "$(sha "$DIR/$2")" = "$3" ]; then return; fi
  curl -fsSL -o "$DIR/$2.part" "$1"
  [ "$(sha "$DIR/$2.part")" = "$3" ] || { rm -f "$DIR/$2.part"; echo "Error: $2 does not match its checksum" >&2; exit 1; }
  mv "$DIR/$2.part" "$DIR/$2"
}

mkdir -p "$DIR"
if command -v uv >/dev/null; then
  [ -x "$DIR/.venv/bin/python" ] || uv venv -q "$DIR/.venv"
  uv pip install -q --python "$DIR/.venv/bin/python" kokoro-onnx==0.6.1 soundfile==0.14.0 faster-whisper==1.2.1
else
  [ -x "$DIR/.venv/bin/python" ] || python3 -m venv "$DIR/.venv"
  "$DIR/.venv/bin/python" -m pip install -q kokoro-onnx==0.6.1 soundfile==0.14.0 faster-whisper==1.2.1
fi
fetch "$BASE/kokoro-v1.0.int8.onnx" kokoro.onnx "$MODEL_SHA"
fetch "$BASE/voices-v1.0.bin" voices.bin "$VOICES_SHA"
"$DIR/.venv/bin/python" -c "import kokoro_onnx, soundfile, faster_whisper"
# Downloads the speech-to-text model now, not the first time a person talks
HF_HOME="$DIR/models" "$DIR/.venv/bin/python" -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"
echo "Local speech is ready in $DIR"
