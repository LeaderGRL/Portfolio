"""Prepare the supplied moulded desktop/mobile chassis without distortion."""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "src" / "chassis-moulding-desktop.png"
MOBILE_SOURCE = ROOT / "assets" / "src" / "chassis-moulding-mobile.png"
EXPORT = ROOT / "assets" / "chassis"
BUILD = ROOT / "assets" / "build"

# Measured at the bright inner lip of the supplied black moulding. The plate
# remains fully photographic; this mask only decides which central pixels are
# replaced by the live raster and therefore preserves the entire black rim.
DESKTOP_APERTURE = (581, 295, 1092, 686)
MOBILE_APERTURE = (246, 298, 694, 779)


def opening_mask(size, box, exponent=5.2, supersample=4):
    """Antialiased superellipse matching the CRT glass inside the moulding."""
    width, height = size
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) * .5, (y0 + y1) * .5
    rx, ry = (x1 - x0) * .5, (y1 - y0) * .5
    points = []
    for step in range(720):
        angle = step / 720 * math.tau
        c, s = math.cos(angle), math.sin(angle)
        x = cx + rx * math.copysign(abs(c) ** (2 / exponent), c)
        y = cy + ry * math.copysign(abs(s) ** (2 / exponent), s)
        points.append((round(x * supersample), round(y * supersample)))
    mask = Image.new("L", (width * supersample, height * supersample), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask.resize((width, height), Image.Resampling.LANCZOS)


def aperture_from_mask(mask):
    ys, xs = np.nonzero(np.asarray(mask, dtype=np.float32) > 127)
    width, height = mask.size
    return [
        round(xs.min() / width, 6),
        round(ys.min() / height, 6),
        round((xs.max() + 1) / width, 6),
        round((ys.max() + 1) / height, 6),
    ]


def transparent_frame(plate, hole):
    hole_array = np.asarray(hole, dtype=np.float32) / 255
    frame = plate.convert("RGBA")
    frame.putalpha(Image.fromarray(np.clip((1 - hole_array) * 255, 0, 255).astype(np.uint8)))
    return frame


def main():
    EXPORT.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGB")
    width, height = source.size
    crop_width = height * 16 / 9
    if width >= crop_width:
        crop_box = ((width - crop_width) / 2, 0, (width + crop_width) / 2, height)
    else:
        crop_height = width * 9 / 16
        crop_box = (0, (height - crop_height) / 2, width, (height + crop_height) / 2)

    opening = opening_mask(source.size, DESKTOP_APERTURE)

    aperture = None
    for suffix, size in (("1920", (1920, 1080)), ("4k", (3840, 2160))):
        plate = source.resize(size, Image.Resampling.LANCZOS, box=crop_box)
        hole = opening.resize(size, Image.Resampling.LANCZOS, box=crop_box)
        frame = transparent_frame(plate, hole)

        plate.save(EXPORT / f"chassis-{suffix}.webp", "WEBP", quality=92, method=6)
        frame.save(BUILD / f"chassis-frame-{suffix}.webp", "WEBP", quality=92, method=6)

        if suffix == "1920":
            aperture = aperture_from_mask(hole)

    mobile = Image.open(MOBILE_SOURCE).convert("RGB")
    mobile_hole = opening_mask(mobile.size, MOBILE_APERTURE, exponent=4.8)
    mobile_frame = transparent_frame(mobile, mobile_hole)
    mobile.save(EXPORT / "chassis-mobile.webp", "WEBP", quality=92, method=6)
    mobile_frame.save(BUILD / "chassis-frame-mobile.webp", "WEBP", quality=92, method=6)

    metadata_path = BUILD / "meta.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["chassis"] = {
        "aspect": round(16 / 9, 6),
        "aperture": aperture,
        "source_size": [width, height],
        "crop_box": [round(float(value), 4) for value in crop_box],
    }
    metadata["mobile_chassis"] = {
        "aspect": round(mobile.width / mobile.height, 6),
        "aperture": aperture_from_mask(mobile_hole),
        "source_size": [mobile.width, mobile.height],
    }
    metadata_path.write_text(json.dumps(metadata, indent=1), encoding="utf-8")
    print(json.dumps(metadata["chassis"], indent=2))
    print(json.dumps(metadata["mobile_chassis"], indent=2))
    for path in sorted(EXPORT.glob("chassis-*.webp")):
        print(f"{path.name}: {path.stat().st_size / 1024:.1f} KB")
    for path in sorted(BUILD.glob("chassis-frame-*.webp")):
        print(f"{path.name}: {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
