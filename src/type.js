/* ==========================================================================
 * 3. TYPE
 * ======================================================================== */

/** Monospace glyph atlas, pre-tinted per phosphor shade so painting is
 *  a flat sequence of drawImage calls with zero state changes. */
export const CHARSET =
  " !\"#$%&'()*+,-./0123456789:;<=>?@" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`" +
  "abcdefghijklmnopqrstuvwxyz{|}~" +
  "ÀÂÇÉÈÊËÎÏÔÙÛÜàâçéèêëîïôùûüŒœ²³«»" +
  "─│┌┐└┘├┤┬┴┼█▓▒░•▸▶←→↑↓·▪—…";

export class GlyphAtlas {
  constructor(cw, ch, fontPx, weight) {
    this.cw = cw; this.ch = ch;
    this.index = new Map();
    const cols = CHARSET.length;
    const c = document.createElement("canvas");
    c.width = cols * cw; c.height = ch;
    const g = c.getContext("2d");
    g.font = `${weight} ${fontPx}px ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff";
    for (let i = 0; i < cols; i++) {
      const ch2 = CHARSET[i];
      this.index.set(ch2, i);
      g.fillText(ch2, i * cw + cw / 2, ch / 2 + 0.5);
    }
    this.white = c;
    this.tints = new Map();
  }

  /** Returns (and memoises) a copy of the atlas filled with `color`. */
  tint(color) {
    let t = this.tints.get(color);
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = this.white.width; c.height = this.white.height;
    const g = c.getContext("2d");
    g.drawImage(this.white, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    this.tints.set(color, c);
    return c;
  }

  blit(ctx, color, ch, x, y) {
    const i = this.index.get(ch);
    if (i === undefined) return;
    ctx.drawImage(this.tint(color), i * this.cw, 0, this.cw, this.ch, x, y, this.cw, this.ch);
  }
}

/** 5x7 bitmap face for headlines. Hand-plotted: real pixels, no antialiasing,
 *  so the big type stays crisp when the tube shader magnifies it. */
export const BITMAP_5x7 = {
  A:"01110100011000111111100011000110001", B:"11110100011000111110100011000111110",
  C:"01110100011000010000100001000101110", D:"11110100011000110001100011000111110",
  E:"11111100001000011110100001000011111", F:"11111100001000011110100001000010000",
  G:"01110100011000010111100011000101110", H:"10001100011000111111100011000110001",
  I:"11111001000010000100001000010011111", J:"00111000100001000010000101001001100",
  K:"10001100101010011000101001001010001", L:"10000100001000010000100001000011111",
  M:"10001110111010110001100011000110001", N:"10001110011010110011100011000110001",
  O:"01110100011000110001100011000101110", P:"11110100011000111110100001000010000",
  Q:"01110100011000110001101011001001101", R:"11110100011000111110101001001010001",
  S:"01111100001000001110000010000111110", T:"11111001000010000100001000010000100",
  U:"10001100011000110001100011000101110", V:"10001100011000110001100010101000100",
  W:"10001100011000110001101011101110001", X:"10001100010101000100010101000110001",
  Y:"10001100010101000100001000010000100", Z:"11111000010001000100010001000011111",
  0:"01110100011001110101110011000101110", 1:"00100011000010000100001000010001110",
  2:"01110100010000100010001000100011111", 3:"11111000100010000010000011000101110",
  4:"00010001100101010010111110001000010", 5:"11111100001111000001000011000101110",
  6:"00110010001000011110100011000101110", 7:"11111000010001000100010000100001000",
  8:"01110100011000101110100011000101110", 9:"01110100011000101111000010001001100",
  " ":"00000000000000000000000000000000000",
  ".":"00000000000000000000000000110001100",
  "-":"00000000000000011111000000000000000",
  "_":"00000000000000000000000000000011111",
  "/":"00001000010001000100010001000010000",
  ":":"00000011000110000000011000110000000",
  "!":"00100001000010000100001000000000100",
  "?":"01110100010000100010001000000000100",
  "·":"00000000000000000100000000000000000",
  "(":"00010001000100001000010000010000010",
  ")":"01000001000001000010000100010001000",
  "+":"00000001000010011111001000010000000",
  "=":"00000000001111100000111110000000000",
  ">":"10000010000010000010001000100010000",
  "<":"00001000100010001000100000100000100",
};

/** Draw a headline into `ctx` with the bitmap face. Returns pixel width. */
export function bitmapText(ctx, text, x, y, scale, color, gap = 1) {
  const glyphW = 5 * scale, glyphH = 7 * scale, adv = glyphW + gap * scale;
  ctx.fillStyle = color;
  let cx = x;
  for (const raw of text.toUpperCase()) {
    const bits = BITMAP_5x7[raw];
    if (bits) {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 5; c++) {
          if (bits[r * 5 + c] === "1") {
            ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
          }
        }
      }
    }
    cx += adv;
  }
  return cx - x - gap * scale;
}
export function bitmapWidth(text, scale, gap = 1) {
  return text.length * (5 * scale + gap * scale) - gap * scale;
}
