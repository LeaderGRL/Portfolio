"""Prepare the supplied moulded desktop/mobile chassis without distortion."""
import json
import shutil
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "src" / "chassis-moulding-desktop.png"
FRAME_SOURCE = ROOT / "assets" / "src" / "chassis-frame-desktop.png"
MOBILE_SOURCE = ROOT / "assets" / "src" / "chassis-moulding-mobile.png"
MOBILE_FRAME_SOURCE = ROOT / "assets" / "src" / "chassis-frame-mobile.png"
EXPORT = ROOT / "assets" / "chassis"
BUILD = ROOT / "assets" / "build"

# The compact machine remains contain-fitted so no physical control can be
# cropped. These strips extend only the blank photographed chassis material
# beyond the authored 941x1672 render when the viewport has a different ratio.
MOBILE_FILL_SAMPLE_DEPTH = 128
MOBILE_FILL_EXTENT = 512


def aperture_from_mask(mask):
    ys, xs = np.nonzero(np.asarray(mask, dtype=np.float32) > 127)
    width, height = mask.size
    return [
        round(xs.min() / width, 6),
        round(ys.min() / height, 6),
        round((xs.max() + 1) / width, 6),
        round((ys.max() + 1) / height, 6),
    ]


def supplied_frame(path):
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


def reflected_indices(distance, depth):
    """Map outward distance onto a mirrored source band without hard repeats."""
    depth = max(2, int(depth))
    period = 2 * (depth - 1)
    phase = np.asarray(distance, dtype=np.int32) % period
    return np.where(phase < depth, phase, period - phase)


def compact_material_fills(image):
    """Create edge-continuous material strips for arbitrary compact viewports.

    Each strip's seam-facing row/column is exactly the corresponding outer row
    or column of the supplied mobile chassis. Moving away from the seam walks
    inward through a blank material band and mirrors it, preserving real grain
    and lighting without synthesising another UI or stretching one pixel line.
    """
    rgb = np.asarray(image.convert("RGB"))
    height, width = rgb.shape[:2]
    depth = min(MOBILE_FILL_SAMPLE_DEPTH, max(2, width // 3), max(2, height // 3))
    extent = MOBILE_FILL_EXTENT

    # Top image is stored far-edge -> seam, so its last row matches source y=0.
    top_distance = np.arange(extent - 1, -1, -1)
    top = rgb[reflected_indices(top_distance, depth), :, :]

    # Bottom image is stored seam -> far-edge, so its first row matches y=h-1.
    bottom_distance = np.arange(extent)
    bottom_rows = (height - 1) - reflected_indices(bottom_distance, depth)
    bottom = rgb[bottom_rows, :, :]

    # Left is far-edge -> seam; right is seam -> far-edge for the same reason.
    left_distance = np.arange(extent - 1, -1, -1)
    left = rgb[:, reflected_indices(left_distance, depth), :]
    right_distance = np.arange(extent)
    right_cols = (width - 1) - reflected_indices(right_distance, depth)
    right = rgb[:, right_cols, :]

    # A border-derived fallback colour covers sub-pixel gaps while images load.
    border = np.concatenate([
        rgb[:12].reshape(-1, 3),
        rgb[-12:].reshape(-1, 3),
        rgb[:, :12].reshape(-1, 3),
        rgb[:, -12:].reshape(-1, 3),
    ])
    mean = np.rint(border.mean(axis=0)).astype(np.uint8)
    material_color = "#" + "".join(f"{int(channel):02x}" for channel in mean)

    return {
        "top": Image.fromarray(top),
        "bottom": Image.fromarray(bottom),
        "left": Image.fromarray(left),
        "right": Image.fromarray(right),
    }, material_color


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

    desktop_frame = supplied_frame(FRAME_SOURCE)
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
    mobile_frame = supplied_frame(MOBILE_FRAME_SOURCE)
    if mobile_frame.size != mobile.size:
        raise ValueError(
            f"mobile frame must match source {mobile.size}, got {mobile_frame.size}"
        )
    mobile_hole = Image.fromarray(255 - np.asarray(mobile_frame)[:, :, 3])
    save_webp_atomic(mobile, EXPORT / "chassis-mobile.webp")
    save_webp_atomic(mobile_frame, BUILD / "chassis-frame-mobile.webp")

    fills, material_color = compact_material_fills(mobile)
    for edge, fill in fills.items():
        save_webp_atomic(fill, BUILD / f"mobile-fill-{edge}.webp")

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
        "frame_source": MOBILE_FRAME_SOURCE.name,
        "material_color": material_color,
        "fill_sample_depth": MOBILE_FILL_SAMPLE_DEPTH,
        "fill_extent": MOBILE_FILL_EXTENT,
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
    for path in sorted(BUILD.glob("mobile-fill-*.webp")):
        print(f"{path.name}: {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
