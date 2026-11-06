#!/usr/bin/env python3
"""Text on stdin to speech: one WAV per sentence, its path printed as soon as it is ready, so the first can
play while the next is made. Started per use: an idle host keeps no model in memory (mini-lola has 4 GB)."""
import argparse
import os
import re
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

# The first letter of a Kokoro voice is its language
LANGUAGES = {'a': 'en-us', 'b': 'en-gb', 'e': 'es', 'f': 'fr-fr', 'h': 'hi', 'i': 'it', 'j': 'ja', 'p': 'pt-br', 'z': 'cmn'}
MAX_SECONDS = 8  # speaker.play takes 384 KiB: 8 s of 16-bit mono at 24 kHz

parser = argparse.ArgumentParser()
parser.add_argument('--dir', required=True)
parser.add_argument('--voice', required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args()

text = sys.stdin.read().strip()
kokoro = Kokoro(os.path.join(args.dir, 'kokoro.onnx'), os.path.join(args.dir, 'voices.bin'))
if args.voice not in kokoro.get_voices():
    sys.exit(f'Unknown voice: {args.voice}')

number = 0
for sentence in re.split(r'(?<=[.!?…])\s+', text):
    if not sentence.strip():
        continue
    samples, rate = kokoro.create(sentence, voice=args.voice, speed=1.0, lang=LANGUAGES.get(args.voice[0], 'en-us'))
    # shortcut: a sentence over 8 s is cut mid-audio, with a small gap; split at commas if people notice
    for start in range(0, len(samples), MAX_SECONDS * rate):
        number += 1
        path = os.path.join(args.out, f'{number:03}.wav')
        sf.write(path, samples[start:start + MAX_SECONDS * rate], rate, subtype='PCM_16')
        print(path, flush=True)
