"""Prepare the supplied moulded desktop/mobile chassis without distortion."""
import json
import re
import shutil
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "src" / "chassis-moulding-desktop.png"
FRAME_SOURCE = ROOT / "assets" / "src" / "chassis-frame-desktop.png"
MOBILE_SOURCE = ROOT / "assets" / "src" / "chassis-moulding-mobile.png"
MOBILE_FRAME_SOURCE = ROOT / "assets" / "src" / "chassis-frame-mobile.png"
PORTRAIT_SOURCE_DIR = ROOT / "assets" / "src" / "portrait-chassis"
PORTRAIT_REFERENCE_GEOMETRY = ROOT / "assets" / "src" / "portrait-reference-geometry.json"
LANDSCAPE_SOURCES = {
    variant: ROOT / "assets" / "src" / f"chassis-frame-landscape-{variant}.webp"
    for variant in ("5x4", "4x3", "3x2", "16x10", "16x9", "20x9", "21x9", "3x1")
}
EXPORT = ROOT / "assets" / "chassis"
BUILD = ROOT / "assets" / "build"

# The compact machine remains contain-fitted so no physical control can be
# cropped. The continuation strips are sampled from the exact rendered frame
# used by the browser, not from a related moulding source. This keeps the seam
# colour, grain and lighting identical at the machine boundary.
MOBILE_FILL_SAMPLE_DEPTH = 128
MOBILE_FILL_EXTENT = 512
PORTRAIT_PROFILE_RE = re.compile(r"^(\d+)x(\d+)$")


def aperture_from_mask(mask):
    ys, xs = np.nonzero(np.asarray(mask, dtype=np.float32) > 127)
    width, height = mask.size
    return [
        round(xs.min() / width, 6),
        round(ys.min() / height, 6),
        round((xs.max() + 1) / width, 6),
        round((ys.max() + 1) / height, 6),
    ]


def enclosed_aperture_from_alpha(rgba):
    """Measure the largest transparent region that does not touch the plate edge.

    Landscape artwork can have transparent antialiased outer corners as well as
    the intentional CRT cutout. Measuring every transparent pixel makes those
    corners expand the aperture to the full canvas. Connected-component
    labelling lets the asset pipeline keep the authored glass opening while
    ignoring exterior transparency, without any viewport-specific coordinates.
    """
    transparent = rgba[:, :, 3] < 128
    labels, count = ndimage.label(transparent)
    if count == 0:
        raise ValueError("landscape chassis has no transparent CRT aperture")

    border_labels = np.unique(np.concatenate([
        labels[0, :],
        labels[-1, :],
        labels[:, 0],
        labels[:, -1],
    ]))
    areas = np.bincount(labels.ravel(), minlength=count + 1)
    areas[0] = 0
    areas[border_labels] = 0
    aperture_label = int(np.argmax(areas))
    if aperture_label == 0 or areas[aperture_label] == 0:
        raise ValueError("landscape chassis has no enclosed transparent CRT aperture")

    return normalized_bounds(labels == aperture_label)


def normalized_bounds(mask):
    """Return the normalized bounding box of a boolean pixel mask."""
    ys, xs = np.nonzero(mask)
    if not len(xs) or not len(ys):
        raise ValueError("cannot measure an empty chassis feature mask")
    height, width = mask.shape
    return [
        round(xs.min() / width, 6),
        round(ys.min() / height, 6),
        round((xs.max() + 1) / width, 6),
        round((ys.max() + 1) / height, 6),
    ]


def moulding_bounds(rgba):
    """Measure the complete black CRT moulding, excluding transparent glass.

    The supplied landscape plates use a stable near-black moulding and a
    transparent screen aperture. Measuring the opaque low-luminance pixels
    gives layout code the outside edge it actually has to avoid; the aperture
    alone is not a sufficient collision boundary for the control deck.
    """
    alpha = rgba[:, :, 3]
    rgb = rgba[:, :, :3].astype(np.float32)
    luminance = rgb[:, :, 0] * .2126 + rgb[:, :, 1] * .7152 + rgb[:, :, 2] * .0722
    return normalized_bounds((alpha > 127) & (luminance < 130))


def screen_surround_right(rgba, moulding):
    """Measure the right edge of the cream CRT recess around the black moulding.

    Control hardware must clear the complete screen assembly, not only the
    near-black moulding. The outer cream recess is a softer edge, so detect the
    strongest smoothed vertical luminance transition immediately to the right
    of the measured moulding. Keeping this measurement in the asset pipeline
    makes replacement landscape artwork update the control safe-zone as well.
    """
    rgb = rgba[:, :, :3].astype(np.float32)
    luminance = rgb[:, :, 0] * .2126 + rgb[:, :, 1] * .7152 + rgb[:, :, 2] * .0722
    smooth = np.asarray(
        Image.fromarray(np.clip(luminance, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5)),
        dtype=np.float32,
    )
    gradient_x = np.abs(np.diff(smooth, axis=1))
    height, width = luminance.shape
    y0 = int(height * .08)
    y1 = int(height * .92)
    score = np.percentile(gradient_x[y0:y1], 90, axis=0)

    moulding_right = int(round(moulding[2] * width))
    search_start = max(0, moulding_right + int(round(width * .01)))
    search_end = min(len(score), moulding_right + int(round(width * .05)))
    if search_end <= search_start:
        return moulding[2]

    edge = search_start + int(np.argmax(score[search_start:search_end]))
    return round((edge + 1) / width, 6)


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


def material_mask(rgb):
    """Return the warm, light moulded-plastic region without touching bezel black."""
    values = rgb.astype(np.int16)
    red, green, blue = values[:, :, 0], values[:, :, 1], values[:, :, 2]
    luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    chroma = np.maximum.reduce([red, green, blue]) - np.minimum.reduce([red, green, blue])
    return (
        (luma >= 108)
        & (red >= green - 14)
        & (green >= blue - 20)
        & (red >= blue + 4)
        & (chroma <= 105)
    )


def material_median(rgb):
    mask = material_mask(rgb)
    pixels = rgb[mask]
    if len(pixels) < 1024:
        raise ValueError("not enough moulded material pixels to normalize portrait chassis")
    return np.rint(np.median(pixels, axis=0)).astype(np.int16)


def normalize_portrait_material(image, target):
    """Shift only cream plastic toward the desktop material reference."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3]
    before = material_median(rgb)
    delta = target.astype(np.float32) - before.astype(np.float32)

    values = rgb.astype(np.float32)
    luma = 0.2126 * values[:, :, 0] + 0.7152 * values[:, :, 1] + 0.0722 * values[:, :, 2]
    feather = np.clip((luma - 92.0) / 72.0, 0.0, 1.0) * material_mask(rgb).astype(np.float32)
    adjusted = values + feather[:, :, None] * delta[None, None, :]
    rgba[:, :, :3] = np.clip(np.rint(adjusted), 0, 255).astype(np.uint8)
    normalized = Image.fromarray(rgba)
    after = material_median(np.asarray(normalized)[:, :, :3])
    return normalized, before, after


def portrait_opening(image):
    """Detect the dominant central black glass opening from a portrait plate."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    height, width = rgb.shape[:2]
    luma = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    labels, count = ndimage.label(luma < 28)
    if count == 0:
        raise ValueError("portrait chassis has no detectable CRT opening")

    focus = np.zeros((height, width), dtype=bool)
    focus[int(height * .06):int(height * .56), int(width * .07):int(width * .93)] = True
    areas = np.bincount(labels[focus].ravel(), minlength=count + 1)
    areas[0] = 0
    aperture_label = int(np.argmax(areas))
    if aperture_label == 0 or areas[aperture_label] < width * height * .04:
        raise ValueError("portrait CRT opening component is too small")

    opening = labels == aperture_label
    opening = ndimage.binary_closing(opening, iterations=2)
    opening = ndimage.binary_fill_holes(opening)
    opening = ndimage.binary_erosion(opening, iterations=1)
    soft = ndimage.gaussian_filter(opening.astype(np.float32), sigma=1.0)
    return Image.fromarray(np.rint(np.clip(soft, 0.0, 1.0) * 255).astype(np.uint8), mode="L")


def portrait_frame(image, opening):
    rgba = np.asarray(image.convert("RGBA")).copy()
    original_alpha = rgba[:, :, 3].astype(np.float32) / 255.0
    hole = np.asarray(opening, dtype=np.float32) / 255.0
    rgba[:, :, 3] = np.rint(original_alpha * (1.0 - hole) * 255).astype(np.uint8)
    return Image.fromarray(rgba)


def build_portrait_profiles(target_material):
    profiles = []
    if not PORTRAIT_SOURCE_DIR.exists():
        return profiles
    reference_geometry = json.loads(PORTRAIT_REFERENCE_GEOMETRY.read_text(encoding="utf-8"))

    for source_path in sorted(PORTRAIT_SOURCE_DIR.glob("*.png")):
        match = PORTRAIT_PROFILE_RE.fullmatch(source_path.stem)
        if not match:
            raise ValueError(f"portrait chassis source must be named WIDTHxHEIGHT.png: {source_path.name}")
        viewport_width, viewport_height = (int(value) for value in match.groups())
        source = Image.open(source_path).convert("RGBA")
        normalized, before, after = normalize_portrait_material(source, target_material)
        opening = portrait_opening(normalized)
        source_aperture = aperture_from_mask(opening)
        reference = reference_geometry.get(source_path.stem)
        if not reference:
            raise ValueError(f"missing portrait reference geometry for {source_path.stem}")
        reference_aperture = reference["aperture"]
        source_width = source_aperture[2] - source_aperture[0]
        source_height = source_aperture[3] - source_aperture[1]
        target_width = reference_aperture[2] - reference_aperture[0]
        target_height = reference_aperture[3] - reference_aperture[1]
        frame_scale_x = target_width / source_width
        frame_scale_y = target_height / source_height
        frame_offset_x = reference_aperture[0] - frame_scale_x * source_aperture[0]
        frame_offset_y = reference_aperture[1] - frame_scale_y * source_aperture[1]
        frame = portrait_frame(normalized, opening)
        output_name = f"chassis-frame-portrait-{source_path.stem}.webp"
        save_webp_atomic(frame, BUILD / output_name)

        profiles.append({
            "id": source_path.stem,
            "viewport": [viewport_width, viewport_height],
            "source_size": [source.width, source.height],
            "source_aspect": round(source.width / source.height, 6),
            "aperture": source_aperture,
            "reference_aperture": reference_aperture,
            "frame_transform": [
                round(frame_offset_x, 6),
                round(frame_offset_y, 6),
                round(frame_scale_x, 6),
                round(frame_scale_y, 6),
            ],
            "asset": output_name.removesuffix(".webp"),
            "cream_before": [int(value) for value in before],
            "cream_after": [int(value) for value in after],
        })

    return profiles


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
    or column of the browser-visible mobile frame. Moving away from the seam
    walks inward through a blank material band and mirrors it, preserving real
    grain and lighting without synthesising another UI or stretching one line.
    """
    rgba = np.asarray(image.convert("RGBA"))
    rgb = rgba[:, :, :3].copy()
    alpha = rgba[:, :, 3:4].astype(np.float32) / 255.0

    # The sampled border is opaque in the supplied frame. Compositing any
    # antialiased edge pixels onto their own border mean avoids black RGB from
    # transparent pixels ever leaking into WebP resampling.
    border_rgb = np.concatenate([
        rgb[:12].reshape(-1, 3),
        rgb[-12:].reshape(-1, 3),
        rgb[:, :12].reshape(-1, 3),
        rgb[:, -12:].reshape(-1, 3),
    ])
    border_alpha = np.concatenate([
        alpha[:12].reshape(-1, 1),
        alpha[-12:].reshape(-1, 1),
        alpha[:, :12].reshape(-1, 1),
        alpha[:, -12:].reshape(-1, 1),
    ])
    opaque_border = border_rgb[border_alpha[:, 0] > 0.95]
    mean = np.rint((opaque_border if len(opaque_border) else border_rgb).mean(axis=0)).astype(np.uint8)
    rgb = np.rint(rgb * alpha + mean.reshape(1, 1, 3) * (1.0 - alpha)).astype(np.uint8)

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
    desktop_material = material_median(np.asarray(source))
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

    # Responsive continuation must come from the exact frame displayed by CSS.
    # Sampling MOBILE_SOURCE here creates visible tone changes because the
    # artist-cut frame and the moulding reference are not pixel-identical.
    fills, material_color = compact_material_fills(mobile_frame)
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
    metadata["portrait_chassis"] = {
        "cream_reference": [int(value) for value in desktop_material],
        "profiles": build_portrait_profiles(desktop_material),
    }
    # The user-supplied landscape WebPs carry the exact alpha of the three
    # September 8 PNGs. Measure the files the browser actually displays; never
    # reuse coordinates or material colours from an earlier chassis revision.
    metadata["landscape_chassis"] = {}
    for variant, path in LANDSCAPE_SOURCES.items():
        frame = Image.open(path).convert("RGBA")
        rgba = np.asarray(frame)
        edge_samples = {
            "top": rgba[:4, :, :3].mean(axis=0),
            "bottom": rgba[-4:, :, :3].mean(axis=0),
            "left": rgba[:, :4, :3].mean(axis=1),
            "right": rgba[:, -4:, :3].mean(axis=1),
        }
        edges = {}
        for edge, samples in edge_samples.items():
            stops = []
            for fraction in (0, .25, .5, .75, 1):
                index = round(fraction * (len(samples) - 1))
                rgb = np.rint(samples[max(0, index - 4):index + 5].mean(axis=0))
                colour = "#" + "".join(f"{int(channel):02x}" for channel in rgb)
                stops.append(f"{colour} {fraction * 100:g}%")
            angle = "90deg" if edge in ("top", "bottom") else "180deg"
            edges[edge] = f"linear-gradient({angle},{','.join(stops)})"
        moulding = moulding_bounds(rgba)
        metadata["landscape_chassis"][variant] = {
            "width": frame.width,
            "height": frame.height,
            "aperture": enclosed_aperture_from_alpha(rgba),
            "moulding": moulding,
            "screen_surround_right": screen_surround_right(rgba, moulding),
            "edges": edges,
        }
    metadata_tmp = metadata_path.with_name(metadata_path.name + ".tmp")
    metadata_tmp.write_text(json.dumps(metadata, indent=1), encoding="utf-8")
    replace_with_retry(metadata_tmp, metadata_path)
    print(json.dumps(metadata["chassis"], indent=2))
    print(json.dumps(metadata["mobile_chassis"], indent=2))
    print(json.dumps(metadata["portrait_chassis"], indent=2))
    for path in sorted(EXPORT.glob("chassis-*.webp")):
        print(f"{path.name}: {path.stat().st_size / 1024:.1f} KB")
    for path in sorted(BUILD.glob("chassis-frame-*.webp")):
        print(f"{path.name}: {path.stat().st_size / 1024:.1f} KB")
    for path in sorted(BUILD.glob("mobile-fill-*.webp")):
        print(f"{path.name}: {path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
