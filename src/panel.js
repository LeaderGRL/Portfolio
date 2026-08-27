import { ASSETS, ASSET_META } from './assets.js'
import { foley } from './audio.js'
import { REDUCED, clamp, lerp } from './core.js'
import { ICONS } from './icons.js'

/* ==========================================================================
 * 7. PANEL — sprite-backed DOM controls
 * ======================================================================== */
export const ROUTES = [
  { id: "home",     label: "HOME",     icon: ICONS.home },
  { id: "about",    label: "ABOUT",    icon: ICONS.about },
  { id: "resume",   label: "RESUME",   icon: ICONS.resume },
  { id: "projects", label: "PROJECTS", icon: ICONS.projects },
  { id: "articles", label: "ARTICLES", icon: ICONS.articles },
  { id: "contact",  label: "CONTACT",  icon: ICONS.contact },
];

/* Every <img data-asset="..."> is filled from the embedded sprite table, and
 * each part's aspect ratio is published as a custom property. Sizing boxes off
 * the sprites' own proportions rather than hand-typed numbers means the
 * layout cannot drift out of register with the artwork. */
export function bindAssets() {
  const s = document.documentElement.style;
  for (const [name, meta] of Object.entries(ASSET_META)) {
    if (meta.aspect) s.setProperty(`--ar-${name}`, String(meta.aspect));
  }
  const ap = ASSET_META.bezel.aperture;          // l, t, r, b — normalised
  s.setProperty("--ap-l", ap[0]);
  s.setProperty("--ap-t", ap[1]);
  s.setProperty("--ap-r", ap[2]);
  s.setProperty("--ap-b", ap[3]);
  const chassisAp = ASSET_META.chassis.aperture;
  s.setProperty("--chassis-ap-l", chassisAp[0]);
  s.setProperty("--chassis-ap-t", chassisAp[1]);
  s.setProperty("--chassis-ap-r", chassisAp[2]);
  s.setProperty("--chassis-ap-b", chassisAp[3]);
  const mobileAp = ASSET_META.mobile_chassis.aperture;
  s.setProperty("--mobile-ap-l", mobileAp[0]);
  s.setProperty("--mobile-ap-t", mobileAp[1]);
  s.setProperty("--mobile-ap-r", mobileAp[2]);
  s.setProperty("--mobile-ap-b", mobileAp[3]);
  s.setProperty("--ar-key", String(ASSET_META.key.aspect));
  const cr = ASSET_META.key.cap_rect;          // l, t, w, h within the key
  s.setProperty("--cap-l", cr[0]);
  s.setProperty("--cap-t", cr[1]);
  s.setProperty("--cap-w", cr[2]);
  s.setProperty("--cap-h", cr[3]);
  s.setProperty("--led-x", String(ASSET_META.cap.led_x));
  const pr = ASSET_META.rocker.paddle_rect;    // l, t, w, h within the housing
  s.setProperty("--pad-l", pr[0]);
  s.setProperty("--pad-t", pr[1]);
  s.setProperty("--pad-w", pr[2]);
  s.setProperty("--pad-h", pr[3]);

  for (const img of document.querySelectorAll("img[data-asset]")) {
    const src = ASSETS[img.dataset.asset];
    if (src) img.src = src;
  }
  for (const source of document.querySelectorAll("source[data-asset-srcset]")) {
    const src = ASSETS[source.dataset.assetSrcset];
    if (src) source.srcset = src;
  }
}

export function makeKey(label, cls, icon = '') {
  const b = document.createElement("button");
  b.className = "key" + (cls ? " " + cls : "");
  b.type = "button";
  b.innerHTML =
    '<span class="key__button">' +
      '<span class="key__face">' +
        (icon ? `<span class="key__icon" aria-hidden="true">${icon}</span>` : '') +
        `<span class="key__legend">${label}</span>` +
      '</span>' +
      '<span class="key__led" aria-hidden="true"></span>' +
    '</span>';
  // Press feedback is driven manually so keyboard activation feels identical
  // to a pointer press rather than relying on :active.
  const down = () => { b.classList.add("is-down"); foley.ensure(); foley.key(true); };
  const up   = () => { if (b.classList.contains("is-down")) { b.classList.remove("is-down"); foley.key(false); } };
  b.addEventListener("pointerdown", down);
  b.addEventListener("pointerup", up);
  b.addEventListener("pointerleave", up);
  b.addEventListener("pointercancel", up);
  b.tap = () => { down(); setTimeout(up, 90); };
  return b;
}

/* Parallax only. App owns the only persistent RAF and calls frame() here. The
 * key light is baked into every sprite at a fixed angle, so nothing here may
 * move a highlight — tilt only changes the panel's subtle spatial response. */
export function bindTilt() {
  if (REDUCED) return null;
  const root = document.documentElement.style;
  let tx = 0, ty = 0, cx = 0, cy = 0;
  const onPointerMove = e => {
    tx = clamp((e.clientX / innerWidth) * 2 - 1, -1, 1);
    ty = clamp((e.clientY / innerHeight) * 2 - 1, -1, 1);
  };
  addEventListener("pointermove", onPointerMove);

  return {
    frame() {
      cx = lerp(cx, tx, 0.06); cy = lerp(cy, ty, 0.06);
      root.setProperty("--px", cx.toFixed(3));
      root.setProperty("--py", cy.toFixed(3));
    },
    destroy() {
      removeEventListener("pointermove", onPointerMove);
    },
  };
}
