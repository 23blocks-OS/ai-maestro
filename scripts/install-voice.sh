#!/bin/bash
# Installs local speech (Kokoro) and hearing (faster-whisper) in ~/.aimaestro/voice, for agents with a local voice
# and devices with hold to talk, and voiceprints. Optional: about 630 MB on disk, and no memory until an agent speaks. Run it again to repair.
set -euo pipefail

DIR="$HOME/.aimaestro/voice"
BASE=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
MODEL_SHA=6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb
VOICES_SHA=bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d
# Voiceprints (#78): WeSpeaker ResNet34 trained on VoxCeleb, Apache-2.0, 26 MB
SPEAKER_URL=https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34.onnx
SPEAKER_SHA=5ef208a9da1453335308a6b6f4e6dfbd7e183a38b604de0a57664f45d257fe94

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

fetch() { # url file expected-sha
  if [ -f "$DIR/$2" ] && [ "$(sha "$DIR/$2")" = "$3" ]; then return; fi
  curl -fsSL -o "$DIR/$2.part" "$1"
  [ "$(sha "$DIR/$2.part")" = "$3" ] || { rm -f "$DIR/$2.part"; echo "Error: $2 does not match its checksum" >&2; exit 1; }
  mv "$DIR/$2.part" "$DIR/$2"
}

mkdir -p "$DIR"
# uv's installer puts it in ~/.local/bin (older ones ~/.cargo/bin), which a new shell may not have on PATH yet
export PATH="$PATH:$HOME/.local/bin:$HOME/.cargo/bin"
# kokoro-onnx 0.6.1 supports Python 3.10 to 3.13. Ubuntu 26.04 ships only 3.14, so uv is asked for 3.12 and brings
# its own copy when the system has none. A venv made earlier with an unsupported Python is made again.
supported() { "$1" -c 'import sys; sys.exit(not ((3, 10) <= sys.version_info[:2] <= (3, 13)))' 2>/dev/null; }
[ -x "$DIR/.venv/bin/python" ] && ! supported "$DIR/.venv/bin/python" && rm -rf "$DIR/.venv"
if command -v uv >/dev/null; then
  [ -x "$DIR/.venv/bin/python" ] || uv venv -q --python 3.12 "$DIR/.venv"
  uv pip install -q --python "$DIR/.venv/bin/python" kokoro-onnx==0.6.1 soundfile==0.14.0 faster-whisper==1.2.1 kaldi-native-fbank==1.23.1
else
  # macOS ships Python 3.9, and Kokoro needs 3.10 or newer
  if [ ! -x "$DIR/.venv/bin/python" ]; then
    PY=""
    for candidate in python3.13 python3.12 python3.11 python3.10 python3 "$HOME"/.pyenv/versions/3.1[0-3]*/bin/python; do
      if command -v "$candidate" >/dev/null && supported "$candidate"; then PY="$candidate"; break; fi
    done
    [ -n "$PY" ] || { echo "Error: local speech needs Python 3.10 to 3.13 (this system has $(python3 --version 2>&1)). Install uv (it brings its own Python), then run this again." >&2; exit 1; }
    "$PY" -m venv "$DIR/.venv"
  fi
  "$DIR/.venv/bin/python" -m pip install -q kokoro-onnx==0.6.1 soundfile==0.14.0 faster-whisper==1.2.1 kaldi-native-fbank==1.23.1
fi
fetch "$BASE/kokoro-v1.0.int8.onnx" kokoro.onnx "$MODEL_SHA"
fetch "$BASE/voices-v1.0.bin" voices.bin "$VOICES_SHA"
fetch "$SPEAKER_URL" speaker.onnx "$SPEAKER_SHA"
"$DIR/.venv/bin/python" -c "import kokoro_onnx, soundfile, faster_whisper, kaldi_native_fbank"
# Downloads the speech-to-text model now, not the first time a person talks
HF_HOME="$DIR/models" "$DIR/.venv/bin/python" -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"
echo "Local speech is ready in $DIR"
