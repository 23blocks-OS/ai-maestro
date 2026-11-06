#!/usr/bin/env python3
"""A WAV file to text, on stdout. Started per use, like speak.py: an idle host keeps no model in memory.
The audio is decoded here: faster-whisper's own decoder fails with some PyAV versions."""
import sys
import wave

import numpy as np
from faster_whisper import WhisperModel

with wave.open(sys.argv[1]) as audio:
    samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

segments, _ = WhisperModel('base', device='cpu', compute_type='int8').transcribe(samples, beam_size=5)
print(' '.join(segment.text.strip() for segment in segments))
