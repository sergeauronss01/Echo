#!/usr/bin/env python3
import json
import sys
import argparse
import hashlib
from pathlib import Path

LIBROSA_AVAILABLE = False

try:
    import librosa
    import numpy as np
    LIBROSA_AVAILABLE = True
except ImportError:
    pass

def generate_fingerprint_librosa(audio_path):
    """Generate acoustic fingerprint using librosa as fallback"""
    try:
        y, sr = librosa.load(audio_path, sr=22050)

        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=40)
        mfcc_mean = np.mean(mfcc, axis=1).tolist()

        centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0][0]

        duration = int(librosa.get_duration(y=y, sr=sr) * 1000)

        fingerprint_hash = hashlib.sha256(
            str(mfcc_mean + [float(centroid)]).encode()
        ).hexdigest()

        return {
            'fingerprint_vector': mfcc_mean,
            'spectral_centroid': float(centroid),
            'fingerprint_hash': fingerprint_hash,
            'duration': duration,
            'method': 'librosa',
            'version': '1.0'
        }
    except Exception as e:
        raise Exception(f"Librosa fingerprinting failed: {str(e)}")

def generate_fallback_fingerprint(audio_path):
    """Generate simple fingerprint from file hash when libraries unavailable"""
    try:
        hasher = hashlib.sha256()
        with open(audio_path, 'rb') as f:
            buf = f.read()
            hasher.update(buf)

        file_hash = hasher.hexdigest()
        file_size = Path(audio_path).stat().st_size

        return {
            'fingerprint_vector': [float(ord(c)) for c in file_hash[:40]],
            'spectral_centroid': float(file_size),
            'fingerprint_hash': file_hash,
            'duration': 0,
            'method': 'file_hash',
            'version': '1.0'
        }
    except Exception as e:
        raise Exception(f"Fallback fingerprinting failed: {str(e)}")

def generate_fingerprint(audio_path):
    """Generate acoustic fingerprint using available libraries"""
    audio_path = Path(audio_path)

    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    if LIBROSA_AVAILABLE:
        return generate_fingerprint_librosa(str(audio_path))
    else:
        return generate_fallback_fingerprint(str(audio_path))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate acoustic fingerprint for audio files')
    parser.add_argument('--input', required=True, help='Path to audio file')
    parser.add_argument('--output', default='json', help='Output format (json)')

    args = parser.parse_args()

    try:
        fingerprint = generate_fingerprint(args.input)
        print(json.dumps(fingerprint))
    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)
