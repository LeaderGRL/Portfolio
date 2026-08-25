"""Prepare the supplied moulded desktop/mobile chassis without distortion."""
import json
import math
import shutil
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "src" / "chassis-moulding-desktop.png"
FRAME_SOURCE = ROOT / "assets" / "src" / "chassis-frame-desktop.png"
MOBILE_SOURCE = ROOT / "assets" / "src" / "chassis-moulding-mobile.png"
EXPORT = ROOT / "assets" / "chassis"
BUILD = ROOT / "assets" / "build"

MOBILE_APERTURE = (246, 298, 694, 779)
MOBILE_APERTURE_EXPONENT = 4.8


def opening_mask(size, box, exponent, supersample=4):
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


def supplied_desktop_frame(path):
    """Use the artist-cut alpha aperture verbatim, normalising only opacity.

    The supplied PNG carries alpha 253 rather than 255 over most of the cream
    plate. Promoting those near-opaque pixels prevents a faint full-page
    transparency while preserving every antialiased pixel around the aperture.
    """
    frame = Image.open(path).convert("RGBA")
    rgba = np.asarray(frame).copy()
    alpha = rgba[:, :, 3]
    rgba[:, :, 3] = np.where(alpha >= 240, 255, alpha)
    return Image.fromarray(rgba)


def save_webp_atomic(image, path):
    """Encode off-path, then publish the complete staged WebP for Vite HMR."""
    temporary = path.with_name(path.name + ".tmp")
    image.save(temporary, "WEBP", quality=92, method=6)
    publish_staged(temporary, path)


def replace_with_retry(source, destination, attempts=24):
    """Atomically replace files even while Vite briefly reads them on Windows."""
    for attempt in range(attempts):
        try:
            source.replace(destination)
            return
        except PermissionError:
            if attempt + 1 == attempts:
                raise
            time.sleep(0.025 * (attempt + 1))


def publish_staged(source, destination):
    try:
        replace_with_retry(source, destination, attempts=3)
    except PermissionError:
        shutil.copyfile(source, destination)
        source.unlink()


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

    desktop_frame = supplied_desktop_frame(FRAME_SOURCE)
    if desktop_frame.size != source.size:
        raise ValueError(
            f"desktop frame must match source {source.size}, got {desktop_frame.size}"
        )
    opening = Image.fromarray(255 - np.asarray(desktop_frame)[:, :, 3])

    aperture = None
    for suffix, size in (("1920", (1920, 1080)), ("4k", (3840, 2160))):
        plate = source.resize(size, Image.Resampling.LANCZOS, box=crop_box)
        hole = opening.resize(size, Image.Resampling.LANCZOS, box=crop_box)
        frame = desktop_frame.resize(size, Image.Resampling.LANCZOS, box=crop_box)

        save_webp_atomic(plate, EXPORT / f"chassis-{suffix}.webp")
        save_webp_atomic(frame, BUILD / f"chassis-frame-{suffix}.webp")

        if suffix == "1920":
            aperture = aperture_from_mask(hole)

    mobile = Image.open(MOBILE_SOURCE).convert("RGB")
    mobile_hole = opening_mask(
        mobile.size, MOBILE_APERTURE, MOBILE_APERTURE_EXPONENT
    )
    mobile_frame = transparent_frame(mobile, mobile_hole)
    save_webp_atomic(mobile, EXPORT / "chassis-mobile.webp")
    save_webp_atomic(mobile_frame, BUILD / "chassis-frame-mobile.webp")

    metadata_path = BUILD / "meta.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    metadata["chassis"] = {
        "aspect": round(16 / 9, 6),
        "aperture": aperture,
        "source_size": [width, height],
        "frame_source": FRAME_SOURCE.name,
        "crop_box": [round(float(value), 4) for value in crop_box],
    }
    metadata["mobile_chassis"] = {
        "aspect": round(mobile.width / mobile.height, 6),
        "aperture": aperture_from_mask(mobile_hole),
        "source_size": [mobile.width, mobile.height],
    }
    metadata_tmp = metadata_path.with_name(metadata_path.name + ".tmp")
    metadata_tmp.write_text(json.dumps(metadata, indent=1), encoding="utf-8")
    replace_with_retry(metadata_tmp, metadata_path)
    print(json.dumps(metadata["chassis"], indent=2))
    print(json.dumps(metadata["mobile_chassis"], indent=2))
    for path in sorted(EXPORT.glob("chassis-*.webp")):
        print(f"{path.name}: {path.stat().st_size / 1024:.1f} KB")
    for path in sorted(BUILD.glob("chassis-frame-*.webp")):
        print(f"{path.name}: {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
