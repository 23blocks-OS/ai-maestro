#!/usr/bin/env python3
"""Speech and hearing that stay loaded while a person is talking. One JSON request per line on stdin, JSON lines back.
Loading takes seconds on a small host, and each model is loaded only when first needed. AI Maestro ends this
program after a quiet spell, and it ends by itself when stdin closes, so an idle host keeps nothing in memory."""
import argparse
import json
import os
import re
import sys
import wave

parser = argparse.ArgumentParser()
parser.add_argument('--dir', required=True)
args = parser.parse_args()

# The first letter of a Kokoro voice is its language
LANGUAGES = {'a': 'en-us', 'b': 'en-gb', 'e': 'es', 'f': 'fr-fr', 'h': 'hi', 'i': 'it', 'j': 'ja', 'p': 'pt-br', 'z': 'cmn'}
MAX_SECONDS = 8  # speaker.play takes 384 KiB: 8 s of 16-bit mono at 24 kHz

kokoro = None
whisper = None
speaker = None


def answer(**fields):
    print(json.dumps(fields), flush=True)


def say(request):
    global kokoro
    import soundfile as sf
    if kokoro is None:
        from kokoro_onnx import Kokoro
        kokoro = Kokoro(os.path.join(args.dir, 'kokoro.onnx'), os.path.join(args.dir, 'voices.bin'))
    voice = request['voice']
    if voice not in kokoro.get_voices():
        raise ValueError(f'Unknown voice: {voice}')
    number = 0
    for sentence in re.split(r'(?<=[.!?…])\s+', request['text'].strip()):
        if not sentence.strip():
            continue
        samples, rate = kokoro.create(sentence, voice=voice, speed=1.0, lang=LANGUAGES.get(voice[0], 'en-us'))
        # shortcut: a sentence over 8 s is cut mid-audio, with a small gap; split at commas if people notice
        for start in range(0, len(samples), MAX_SECONDS * rate):
            number += 1
            path = os.path.join(request['out'], f'{number:03}.wav')
            sf.write(path, samples[start:start + MAX_SECONDS * rate], rate, subtype='PCM_16')
            answer(file=path)
    answer(done=True)


def hear(request):
    global whisper
    import numpy as np
    if whisper is None:
        from faster_whisper import WhisperModel
        whisper = WhisperModel('base', device='cpu', compute_type='int8')
    # Decoded here: faster-whisper's own decoder fails with some PyAV versions
    with wave.open(request['file']) as audio:
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    # Told, never guessed: guessing wrote English speech as Russian (B036)
    segments, _ = whisper.transcribe(samples, beam_size=5, language=request.get('language') or 'en')
    answer(text=' '.join(segment.text.strip() for segment in segments), done=True)


def embed(request):
    """A voiceprint (#78): WeSpeaker ResNet34 on 16 kHz mono, as in its recipe. `speech` is the seconds that are
    louder than a quiet room, so the caller can refuse a clip where nobody spoke."""
    global speaker
    import numpy as np
    import kaldi_native_fbank as knf
    import onnxruntime as ort
    if speaker is None:
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1  # small hosts: one core, about 140 MB
        speaker = ort.InferenceSession(os.path.join(args.dir, 'speaker.onnx'), options, providers=['CPUExecutionProvider'])
    with wave.open(request['file']) as audio:
        if audio.getframerate() != 16000 or audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise ValueError('A voiceprint needs 16 kHz mono 16-bit audio')
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype=np.int16).astype(np.float32)
    frames = samples[: len(samples) // 160 * 160].reshape(-1, 160) / 32768.0
    speech = float(np.sum(np.sqrt(np.mean(frames ** 2, axis=1)) > 0.01) * 0.01) if len(frames) else 0.0
    options = knf.FbankOptions()
    options.frame_opts.dither = 0
    options.frame_opts.samp_freq = 16000
    options.frame_opts.window_type = 'hamming'
    options.mel_opts.num_bins = 80
    bank = knf.OnlineFbank(options)
    bank.accept_waveform(16000, samples.tolist())  # int16 scale, as the model was trained
    bank.input_finished()
    if bank.num_frames_ready < 100:
        raise ValueError('The recording is shorter than one second')
    feats = np.stack([bank.get_frame(i) for i in range(bank.num_frames_ready)])
    feats = feats - feats.mean(0)
    vector = speaker.run(None, {'feats': feats[None].astype(np.float32)})[0][0]
    answer(embedding=[round(float(v), 6) for v in vector / np.linalg.norm(vector)], speech=speech, done=True)


OPS = {'say': say, 'hear': hear, 'embed': embed}

for line in sys.stdin:
    try:
        request = json.loads(line)
        OPS[request['op']](request)
    except Exception as error:  # one bad request must not end the program
        answer(error=str(error))
