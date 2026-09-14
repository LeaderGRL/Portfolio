import json
import sys

import miniaudio


def decode(path):
    try:
        sound = miniaudio.decode_file(path)
        return sound.num_frames > 0 and len(sound.samples) > 0
    except Exception:
        return False


paths = json.load(sys.stdin)
json.dump({path: decode(path) for path in paths}, sys.stdout)
