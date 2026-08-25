"""Turn the supplied component renders into the sprites the page needs.

These assets are 3D renders. Reproducing them with CSS gradients was always
going to lose, because a gradient cannot express a compound-curved moulded
surface lit from a single source. So they get used directly — but they arrive
as whole objects, and an interface needs parts that move independently. This
splits them:

    bezel   -> kept whole; its transparent aperture masks the live picture
    glass   -> decomposed into a shade map (multiply) and a gloss map (screen)
               so real glass optics can sit over a live canvas
    keys    -> kept whole, two states
    sliders -> track and thumb separated so the thumb can travel
    rocker  -> housing and paddle separated so the paddle can flip
"""
import glob, os, shutil, time
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'assets', 'src')
OUT = os.path.join(ROOT, 'assets', 'build')
os.makedirs(OUT, exist_ok=True)

SRC = {os.path.splitext(os.path.basename(f))[0]: f
       for f in glob.glob(os.path.join(SRC_DIR, '*.png'))}


def load(key, pad=0.03):
    """Crop to the object plus a margin for its contact shadow.

    getbbox() alone keeps the render's full soft shadow, which on these files
    is large enough to triple the reported aspect ratio and would make every
    sprite impossible to size against the layout.
    """
    im = Image.open(SRC[key]).convert('RGBA')
    al = np.array(im)[:, :, 3]
    ys, xs = np.nonzero(al > 10)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    px, py = int((x1 - x0) * pad), int((y1 - y0) * pad)
    return im.crop((max(0, x0 - px), max(0, y0 - py),
                    min(im.width, x1 + px), min(im.height, y1 + py)))


def save(im, name, w=None, q=90):
    if w and im.width != w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    p = f'{OUT}/{name}.webp'
    # Encode off-path first. On Unix the complete file is then renamed in one
    # operation; on Windows Vite may keep the destination open, so the staged
    # bytes are copied in one short write instead of exposing the much longer
    # image-encoding phase.
    tmp = p + '.tmp'
    im.save(tmp, 'WEBP', quality=q, method=6)
    publish_staged(tmp, p)
    print(f'  {name:16s} {im.width:5d}x{im.height:<5d} {os.path.getsize(p)/1024:7.1f} KB')
    return im


def replace_with_retry(source, destination, attempts=24):
    """Atomically replace files even while Vite briefly reads them on Windows."""
    for attempt in range(attempts):
        try:
            os.replace(source, destination)
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
        os.remove(source)


def split_by_components(im, min_frac=0.02):
    """Separate objects that share one canvas, largest first."""
    a = np.array(im)
    lab, n = ndimage.label(a[:, :, 3] > 12)
    sizes = ndimage.sum(a[:, :, 3] > 12, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1]
    out = []
    for i in order:
        if sizes[i] < sizes[order[0]] * min_frac:
            continue
        m = (lab == i + 1)
        b = np.zeros_like(a)
        b[m] = a[m]
        piece = Image.fromarray(b)
        out.append(piece.crop(piece.getbbox()))
    return out


def aperture_rect(im):
    """Normalised bounds of the hole a bezel leaves for the picture."""
    al = np.array(im)[:, :, 3]
    solid = al > 8
    holes = ndimage.binary_fill_holes(solid) & ~solid
    lab, n = ndimage.label(holes)
    big = int(np.argmax(ndimage.sum(holes, lab, range(1, n + 1)))) + 1
    ys, xs = np.nonzero(lab == big)
    W, H = im.size
    return (xs.min() / W, ys.min() / H, (xs.max() + 1) / W, (ys.max() + 1) / H)


def glass_maps(im, size, spec_gain=1.48, spec_shift=(-0.030, -0.022), spec_blur=0.009):
    """Decompose a rendered glass face into multiply and screen layers.

    A render of glass is ambient tint times shading, plus specular. Separating
    those by spatial frequency gives a shade map that can darken a live picture
    and a gloss map that can add highlights to it, so the optics come from the
    render instead of being re-invented.

    The crop matters as much as the decomposition. This render includes the
    tube's own black rim, and the bezel sitting on top of it already supplies
    one — overlaying both drew a second frame inside the first, plainly visible
    as a rounded outline floating in the black. So only the face inside that
    rim is taken, and the bezel is left to do all the framing.
    """
    a0 = np.array(im).astype(float)
    lum0 = a0[:, :, :3].mean(2)
    face = (a0[:, :, 3] > 10) & (lum0 > 18)
    lab, n = ndimage.label(face)
    big = int(np.argmax(ndimage.sum(face, lab, range(1, n + 1)))) + 1
    face = ndimage.binary_fill_holes(lab == big)
    ys, xs = np.nonzero(face)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

    im = im.resize(size, Image.LANCZOS)
    a = np.array(im).astype(float)
    lum = a[:, :, :3].mean(2)
    alpha = np.clip(a[:, :, 3] / 255., 0, 1)

    shading = ndimage.gaussian_filter(lum * alpha, sigma=size[0] * 0.035)
    norm = ndimage.gaussian_filter(alpha, sigma=size[0] * 0.035) + 1e-6
    shading = shading / norm

    # Subtract slightly more than the shading so only true specular survives;
    # a plain difference also lifts broad low-frequency brightness and washes
    # the whole upper half instead of leaving a defined streak.
    spec = np.clip(lum - shading * 1.15, 0, None)
    spec = spec / max(spec.max(), 1e-6)
    # Preserve the long, low-energy shoulder of the real softbox reflection.
    # A gamma above 1 kept only the tiny white core and made the lighting look
    # like a pin highlight; the lower gamma retains the photographic taper
    # down the left-hand curvature without inventing a CSS light source.
    spec = np.clip(spec * spec_gain, 0, 1) ** 0.72

    # The reflection of a softbox has no hard edge. Extracting it by frequency
    # leaves one, because the subtraction clips: blurring puts it back.
    spec = ndimage.gaussian_filter(spec, sigma=size[0] * spec_blur)

    # Nudge it into the upper-left corner. The glass render's face is cropped
    # to its own rim, so the specular needs to travel left after extraction;
    # a positive x shift moved the brightest shoulder toward the content and
    # made it read as a floating spot instead of light grazing the glass edge.
    dx = int(round(spec_shift[0] * size[0]))
    dy = int(round(spec_shift[1] * size[1]))
    spec = np.roll(np.roll(spec, dx, axis=1), dy, axis=0)
    if dy < 0:
        spec[dy:, :] = 0
    elif dy > 0:
        spec[:dy, :] = 0
    if dx > 0:
        spec[:, :dx] = 0
    elif dx < 0:
        spec[:, dx:] = 0

    # Symmetrise left-to-right. The render's own falloff is 35% of the width
    # on the left against 16% on the right — a lighting artefact of the 3D
    # scene, not tube physics: a deflection yoke is symmetric, and the eye
    # reads the difference as the picture failing to reach the frame on one
    # side. The gloss below stays asymmetric, because the reflection genuinely
    # is off one shoulder.
    shading = (shading + shading[:, ::-1]) * 0.5

    ref = np.percentile(shading[alpha > 0.5], 90)
    shade = np.clip(shading / max(ref, 1e-6), 0, 1) ** 0.42
    shade = np.clip(shade * 0.63 + 0.37, 0, 1)   # floor: the bezel darkens too
    shade = shade * alpha + (1 - alpha)

    shade_img = Image.fromarray(
        (np.dstack([shade, shade, shade]) * 255).astype(np.uint8)).convert('RGB')
    gloss_img = Image.fromarray(np.dstack([
        np.full(size[::-1], 255, np.uint8), np.full(size[::-1], 253, np.uint8),
        np.full(size[::-1], 246, np.uint8), (spec * alpha * 255).astype(np.uint8)]))
    return shade_img, gloss_img


def split_paddle(im, box=(0.20, 0.155, 0.80, 0.805), radius=0.11):
    """Separate a rocker's paddle from its housing so it can genuinely pivot.

    Mirroring the paddle reversed its shading and its taper, which is what a
    throw does, but it also mirrored the cavity around it and the moulded dome
    on its face — so the control read as a different object each time rather
    than one object tilted. Cutting the paddle out lets CSS rotate it in three
    dimensions instead, which is what the part actually does.
    """
    W, H = im.size
    x0, y0, x1, y1 = (int(box[0] * W), int(box[1] * H),
                      int(box[2] * W), int(box[3] * H))
    pw, ph = x1 - x0, y1 - y0
    mask = Image.new('L', (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, pw - 1, ph - 1], int(min(pw, ph) * radius), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    paddle = im.crop((x0, y0, x1, y1)).copy()
    pa = np.array(paddle)
    pa[:, :, 3] = (pa[:, :, 3] * (np.array(mask) / 255.)).astype(np.uint8)
    paddle = Image.fromarray(pa)

    # Housing keeps the cavity; the paddle's footprint becomes its floor.
    a = np.array(im).astype(float)
    ring = np.concatenate([a[max(0, y0 - 8):y0, x0:x1].reshape(-1, 4),
                           a[y0:y1, max(0, x0 - 8):x0].reshape(-1, 4)])
    floor = np.median(ring, axis=0) * np.array([0.55, 0.55, 0.55, 1.0])
    grad = np.linspace(0.55, 1.25, ph)[:, None, None]
    patch = np.clip(floor[None, None, :] * grad, 0, 255)
    patch[:, :, 3] = 255
    sel = (np.array(mask) > 8)[:, :, None]
    a[y0:y1, x0:x1] = np.where(sel, patch, a[y0:y1, x0:x1])
    housing = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    rect = [round(x0 / W, 4), round(y0 / H, 4), round(pw / W, 4), round(ph / H, 4)]
    return housing, paddle, rect


def split_slider(im, thumb_ratio=1.28):
    """Separate a slider's thumb from its track.

    The thumb is simply the part of the run that is taller than the track, so
    it can be found from the alpha column heights rather than hard-coded.
    """
    a = np.array(im)
    col_h = (a[:, :, 3] > 12).sum(0)
    base = np.median(col_h[col_h > 0])
    thick = col_h > base * thumb_ratio
    xs = np.nonzero(thick)[0]
    x0, x1 = xs.min(), xs.max() + 1
    thumb = im.crop((x0, 0, x1, im.height))
    thumb = thumb.crop(thumb.getbbox())

    # Rebuild the track from scratch rather than patching over the thumb.
    # Patching failed because the thumb's soft shadow reaches well past the
    # thickness test that finds it, so every donor region still carried a
    # ghost of it. These tracks are uniform along their length and symmetric
    # end to end, so a clean column repeated between one end cap and its
    # mirror reproduces the run exactly, with nothing left to ghost.
    a = np.array(im)
    W, H = im.size
    cap = int(W * 0.13)
    col_at = int(W * 0.22)
    if col_at > x0 - 4:                      # thumb sits left: sample right
        col_at = min(W - 1, int(W * 0.78))
        if col_at < x1 + 4:
            col_at = max(cap + 2, x0 - int((x1 - x0) * 0.4))
    left = a[:, :cap, :]
    mid = np.repeat(a[:, col_at:col_at + 1, :], W - 2 * cap, axis=1)
    right = left[:, ::-1, :]
    track = np.concatenate([left, mid, right], axis=1)
    return (Image.fromarray(track), thumb, (x0 / W, x1 / W))


def rocker_states(im, box=(0.205, 0.175, 0.795, 0.845)):
    """Produce both throws of a rocker from a render of one.

    Only one state was supplied. Mirroring the whole sprite would carry the
    housing's lit chamfer to the wrong corner, so just the paddle inside the
    cavity is flipped: its bright edge moves from the raised end to the other,
    which is exactly what the throw does, while the housing stays lit from
    where the key light actually is.
    """
    W, H = im.size
    x0, y0, x1, y1 = (int(box[0] * W), int(box[1] * H),
                      int(box[2] * W), int(box[3] * H))
    flipped = im.copy()
    paddle = im.crop((x0, y0, x1, y1)).transpose(Image.FLIP_TOP_BOTTOM)
    flipped.paste(paddle, (x0, y0))
    return im, flipped


def find_marking(im, box=(0.25, 0.30, 0.80, 0.80)):
    """Locate the moulded mark on a rocker paddle.

    It is the one bright, wide-and-short blob on an otherwise dark plate, so
    it is found by shape rather than by brightness alone — a plain percentile
    also catches the paddle's own lit top edge.
    """
    a = np.array(im).astype(float)
    H, W = a.shape[:2]
    lum = a[:, :, :3].mean(2)
    x0, y0, x1, y1 = (int(box[0] * W), int(box[1] * H),
                      int(box[2] * W), int(box[3] * H))
    win = lum[y0:y1, x0:x1]
    mask = win > np.percentile(win, 97.0)
    lab, n = ndimage.label(mask)
    best, score = None, -1
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        if h == 0 or w < 6:
            continue
        ar = w / h
        s = len(ys) * (1.0 if 1.6 < ar < 12 else 0.05)
        if s > score:
            score, best = s, (xs.min() + x0, ys.min() + y0,
                              xs.max() + x0 + 1, ys.max() + y0 + 1)
    return best


def inpaint_box(im, box, grow=4):
    """Fill a small rectangle from the ring of pixels around it."""
    a = np.array(im).astype(float)
    x0, y0, x1, y1 = box
    ring = np.concatenate([
        a[max(0, y0 - grow):y0, x0:x1].reshape(-1, 4),
        a[y1:y1 + grow, x0:x1].reshape(-1, 4),
        a[y0:y1, max(0, x0 - grow):x0].reshape(-1, 4),
        a[y0:y1, x1:x1 + grow].reshape(-1, 4)])
    a[y0:y1, x0:x1] = np.median(ring, axis=0)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def rocker_pair(im, box=(0.205, 0.175, 0.795, 0.845)):
    """Both throws of a rocker, with the moulded mark held still.

    Mirroring the paddle reverses the shading and the perspective taper, which
    is what a throw actually does. It also carried the moulded mark to the
    other end of the plate — a mark cannot move, it is in the plastic, and
    watching it teleport is what made the control read as flipping over
    rather than rocking. So the mark is erased first, the clean plate is
    mirrored, and the mark is put back where it belongs in both states.
    """
    W, H = im.size
    x0, y0, x1, y1 = (int(box[0] * W), int(box[1] * H),
                      int(box[2] * W), int(box[3] * H))
    mark_box = find_marking(im)
    # Pad the erase: the mark has a soft edge, and a tight box leaves a halo
    # that the mirror then carries to the far end of the plate as a ghost.
    pad = 6
    wide = (mark_box[0] - pad, mark_box[1] - pad,
            mark_box[2] + pad, mark_box[3] + pad) if mark_box else None
    clean = inpaint_box(im, wide, grow=6) if mark_box else im
    mark = im.crop(mark_box) if mark_box else None

    on = clean.copy()
    off = clean.copy()
    off.paste(clean.crop((x0, y0, x1, y1)).transpose(Image.FLIP_TOP_BOTTOM), (x0, y0))
    if mark:
        on.paste(mark, mark_box[:2], mark)
        off.paste(mark, mark_box[:2], mark)
    return on, off, mark_box


def split_key(off_im, on_im):
    """Separate a keycap from its frame.

    Segmenting by the difference between the two states looked elegant and was
    wrong: the supplied renders are 1964x568 and 1885x550, so they do not
    register and the difference lights up everywhere.

    What does hold is the moulding itself. Frame and cap are both bright cream
    and the groove between them is a sharp luminance minimum — about 150
    against 215 — so thresholding above the groove leaves two bright regions,
    and the cap is simply the one that does not touch the outline.
    """
    a = np.array(off_im).astype(float)
    lum = a[:, :, :3].mean(2)
    solid = a[:, :, 3] > 200
    bright = solid & (lum > 172)
    lab, n = ndimage.label(bright)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    edge = ndimage.binary_dilation(~solid, np.ones((9, 9)))
    border |= set(np.unique(lab[edge]))
    cand = [i for i in range(1, n + 1) if i not in border]
    assert cand, "no enclosed region found - groove threshold is wrong"
    cap = ndimage.binary_fill_holes(
        lab == max(cand, key=lambda i: (lab == i).sum()))
    cap = ndimage.binary_closing(cap, np.ones((7, 7)))
    ys, xs = np.nonzero(cap)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1

    def cut(src, mask):
        src = src.resize(off_im.size, Image.LANCZOS)
        b = np.array(src).copy()
        soft = ndimage.gaussian_filter(mask.astype(float), 1.1)
        b[:, :, 3] = (b[:, :, 3] * soft).astype(np.uint8)
        return Image.fromarray(b).crop((x0, y0, x1, y1))

    # Fill the cap's footprint with the recess tone. Only a few pixels of it
    # are ever seen: the dark sliver that opens along the top as the cap sinks.
    frame = a.copy()
    ring = np.concatenate([
        frame[max(0, y0 - 8):y0, x0:x1].reshape(-1, 4),
        frame[y0:y1, max(0, x0 - 8):x0].reshape(-1, 4)])
    recess = np.median(ring, axis=0) * np.array([0.42, 0.43, 0.45, 1.0])
    grad = np.linspace(0.80, 1.55, y1 - y0)[:, None, None]   # lit lip at the bottom
    patch = np.clip(recess[None, None, :] * grad, 0, 255)
    patch[:, :, 3] = 255
    sel = cap[y0:y1, x0:x1][:, :, None]
    frame[y0:y1, x0:x1] = np.where(sel, patch, frame[y0:y1, x0:x1])

    W, H = off_im.size
    rect = [round(float(x0) / W, 4), round(float(y0) / H, 4),
            round(float(x1 - x0) / W, 4), round(float(y1 - y0) / H, 4)]
    return (Image.fromarray(np.clip(frame, 0, 255).astype(np.uint8)),
            cut(off_im, cap), cut(on_im, cap), rect)


# ===========================================================================
# ENTRY POINT
#
# Run this whenever a file in assets/src changes. It writes assets/build/*.webp
# plus a meta.json of the measurements the layout depends on — aspect ratios,
# the bezel's aperture, the keycap's footprint, the rocker paddle's footprint.
# Publishing those instead of hard-coding them is what keeps the stylesheet in
# register with artwork it has never seen.
# ===========================================================================
def main():
    import json
    meta_path = os.path.join(OUT, 'meta.json')
    try:
        with open(meta_path, encoding='utf-8') as previous_file:
            previous = json.load(previous_file)
    except (FileNotFoundError, json.JSONDecodeError):
        previous = {}

    # Preserve the last complete chassis geometry until build_chassis.py
    # atomically replaces it later in the same pipeline. This keeps HMR valid
    # throughout a live asset rebuild.
    meta = {name: previous[name] for name in ('chassis', 'mobile_chassis')
            if name in previous}

    # Chassis plates and their measured alpha apertures are generated once by
    # build_chassis.py. Keeping that geometry in a single pipeline prevents a
    # later generator from silently overwriting the mask with a different
    # corner profile.

    def rec(name, im):
        meta[name] = {'aspect': round(im.width / im.height, 4)}

    bez = load('bezel')
    rec('bezel', bez)
    meta['bezel']['aperture'] = [round(float(v), 4) for v in aperture_rect(bez)]
    save(bez, 'bezel', 1500, 92)

    ap = meta['bezel']['aperture']
    apw = int(1500 * (ap[2] - ap[0]))
    aph = int(round(1500 / meta['bezel']['aspect'] * (ap[3] - ap[1])))
    shade, gloss = glass_maps(load('glass'), (apw, aph))
    save(shade, 'glass-shade', apw, 86)
    save(gloss, 'glass-gloss', apw, 92)

    frame, cap_off, cap_on, cap_rect = split_key(load('key-off'), load('key-on'))
    save(frame, 'key-frame', 700, 92)
    save(cap_off, 'cap-off', 660, 92)
    save(cap_on, 'cap-on', 660, 92)
    rec('key', load('key-off'))
    meta['key']['cap_rect'] = cap_rect
    rec('cap', cap_off)
    a = np.array(cap_off.convert('RGBA')).astype(float)
    h, w = a.shape[:2]
    sub = a[int(h * 0.3):int(h * 0.7), int(w * 0.02):int(w * 0.30)]
    meta['cap']['led_x'] = round((int(np.argmin(sub[:, :, :3].mean(2).mean(0)))
                                  + int(w * 0.02)) / w, 4)

    for name, width in [('nameplate', 1300), ('grille', 560)]:
        im = load(name)
        rec(name, im)
        save(im, name, width, 92)

    for name, tw, hw in [('switch', 560, 190), ('slider', 760, 120)]:
        im = load(name)
        rec(name, im)
        track, thumb, span = split_slider(im)
        meta[name]['thumb_span'] = [round(float(v), 4) for v in span]
        save(track, name + '-track', tw, 92)
        save(thumb, name + '-thumb', hw, 92)

    parts = split_by_components(load('power'))
    rocker, led = (parts[0], parts[1]) if parts[0].width > parts[1].width else (parts[1], parts[0])
    housing, paddle, prect = split_paddle(rocker)
    rec('rocker', rocker)
    meta['rocker']['paddle_rect'] = prect
    rec('paddle', paddle)
    rec('led', led)
    save(housing, 'rocker-housing', 420, 92)
    save(paddle, 'rocker-paddle', 300, 92)
    save(led, 'led', 150, 92)

    meta_tmp = meta_path + '.tmp'
    with open(meta_tmp, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=1)
    replace_with_retry(meta_tmp, meta_path)
    total = sum(os.path.getsize(os.path.join(OUT, f))
                for f in os.listdir(OUT) if f.endswith('.webp'))
    print(f'\n{total/1024:.0f} KB of sprites -> {OUT}')


if __name__ == '__main__':
    main()
