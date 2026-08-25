/* ==========================================================================
 * 1. CORE
 * ======================================================================== */
export const SRC_W = 480, SRC_H = 360;          // tube native resolution
export const CHAR_W = 8, CHAR_H = 14;           // cell metrics
// Sized against the glass, not the tube. The picture mask is a superellipse
// of exponent 3.1, so a raster laid out to the full frame loses its corners:
// at the previous 26/24 the first row was clipped 19 cells deep at each end.
// At 40/32 every middle row is fully inside and only the outermost rows give
// up their corners, which the layouts below already keep clear.
export const PAD_X = 40, PAD_Y = 32;
export const COLS = Math.floor((SRC_W - PAD_X * 2) / CHAR_W);   // 50
export const ROWS = Math.floor((SRC_H - PAD_Y * 2) / CHAR_H);   // 21

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp  = (a, b, t) => a + (b - a) * t;
export const now   = () => performance.now() / 1000;
export const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Word-wrap a string into lines of at most `w` characters. */
export function wrap(text, w) {
  const out = [];
  for (const para of text.split("\n")) {
    if (!para) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(" ")) {
      if (!line.length) line = word;
      else if (line.length + 1 + word.length <= w) line += " " + word;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}
