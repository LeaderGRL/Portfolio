import json
import os
import sys

from PIL import Image


EXPECTED_FORMATS = {
    ".gif": "GIF",
    ".jpeg": "JPEG",
    ".jpg": "JPEG",
    ".png": "PNG",
    ".webp": "WEBP",
}


def decode(path):
    try:
        expected_format = EXPECTED_FORMATS.get(os.path.splitext(path)[1].lower())
        with Image.open(path) as image:
            if image.format != expected_format:
                return None
            width, height = image.size
            image.verify()

        with Image.open(path) as image:
            for frame_index in range(getattr(image, "n_frames", 1)):
                image.seek(frame_index)
                image.load()
        return {"width": width, "height": height}
    except Exception:
        return None


paths = json.load(sys.stdin)
json.dump({path: decode(path) for path in paths}, sys.stdout)
