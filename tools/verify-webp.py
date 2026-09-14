import json
import sys

from PIL import Image


def decode(path):
    try:
        with Image.open(path) as image:
            if image.format != "WEBP":
                return None
            width, height = image.size
            for frame_index in range(getattr(image, "n_frames", 1)):
                image.seek(frame_index)
                image.load()
            return {"width": width, "height": height}
    except Exception:
        return None


paths = json.load(sys.stdin)
json.dump({path: decode(path) for path in paths}, sys.stdout)
