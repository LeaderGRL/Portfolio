import { CHAR_H, CHAR_W, PAD_X, PAD_Y, SRC_H, SRC_W } from './core.js'
import { GlyphAtlas } from './type.js'

/* ==========================================================================
 * 4. TERMINAL — a cell buffer plus a small display list
 * ======================================================================== */
export const SHADE = {
  dim:    "#167f45",
  mid:    "#2fd06d",
  bright: "#6bf39a",
  core:   "#b9ffc9",
  amber:  "#ffb347",
};

export class Terminal {
  /**
   * A page writes into a document that may be taller than the tube. `rows` is
   * the window; `docRows` grows to whatever was written. The rasteriser only
   * ever draws the window, and `scroll` chooses which slice of the document
   * that is.
   *
   * Keeping the document and the window separate is what lets a page renderer
   * stay a pure function of its content: it lays out everything it has and
   * never has to know how much of it fits.
   */
  constructor(cols, rows) {
    this.cols = cols; this.rows = rows;
    this.cells = new Array(cols * rows);
    this.ops = [];                 // custom draw ops (headlines, bars, media)
    this.scroll = 0;
    this.docRows = rows;
    this.clear();
  }

  clear() {
    this.cells.length = this.cols * this.rows;
    this.cells.fill(null);
    this.ops.length = 0;
    this.glyphCount = 0;
    this.docRows = this.rows;
  }

  /** Grow the buffer so row `y` exists. */
  _reserve(y) {
    if (y < this.docRows) return;
    this.docRows = y + 1;
    const want = this.cols * this.docRows;
    while (this.cells.length < want) this.cells.push(null);
  }

  /** Rows beyond the window, i.e. how far this page can scroll. */
  get maxScroll() { return Math.max(0, this.docRows - this.rows); }

  scrollBy(d) {
    const before = this.scroll;
    this.scroll = Math.max(0, Math.min(this.maxScroll, this.scroll + d));
    return this.scroll !== before;
  }

  put(x, y, str, shade = "mid", invert = false) {
    if (y < 0) return;
    this._reserve(y);
    for (let i = 0; i < str.length; i++) {
      const cx = x + i;
      if (cx < 0 || cx >= this.cols) continue;
      const ch = str[i];
      this.cells[y * this.cols + cx] = { ch, shade, invert };
    }
  }

  /** Centred text on a row. */
  center(y, str, shade, invert) {
    this.put(Math.max(0, Math.round((this.cols - str.length) / 2)), y, str, shade, invert);
  }

  /** Single-line box with an optional inline caption. */
  box(x, y, w, h, title = "", shade = "dim") {
    const top = "┌" + "─".repeat(w - 2) + "┐";
    const bot = "└" + "─".repeat(w - 2) + "┘";
    this.put(x, y, top, shade);
    for (let i = 1; i < h - 1; i++) {
      this.put(x, y + i, "│", shade);
      this.put(x + w - 1, y + i, "│", shade);
    }
    this.put(x, y + h - 1, bot, shade);
    if (title) this.put(x + 2, y, " " + title + " ", "bright");
  }

  hr(y, x = 0, w = this.cols, shade = "dim") {
    this.put(x, y, "─".repeat(w), shade);
  }

  /** Queue a custom draw. `row` is in document space, like everything else. */
  opAt(row, fn) { this._reserve(row); this.ops.push({ row, fn }); }

  /**
   * Classic terminal scroll indicator in the right-hand column: a trough of
   * light rule characters with a proportional thumb. Drawn as cells rather
   * than as DOM furniture, because it belongs to the picture — a browser
   * scrollbar floating over a CRT would give the whole thing away.
   */
  scrollbar(shade = "dim") {
    if (this.maxScroll <= 0) return;
    const x = this.cols - 1;
    const track = this.rows;
    const thumb = Math.max(1, Math.round(track * this.rows / this.docRows));
    const top = Math.round((track - thumb) * this.scroll / this.maxScroll);
    for (let i = 0; i < track; i++) {
      const on = i >= top && i < top + thumb;
      this.cells[(this.scroll + i) * this.cols + x] =
        { ch: on ? "█" : "│", shade: on ? "bright" : shade, invert: false };
    }
  }

  /** Queue a raw canvas draw op, gated on the reveal cursor. */
  op(afterGlyph, fn) { this.ops.push({ after: afterGlyph, fn }); }

  /** Number of non-blank glyphs currently in the buffer. */
  countGlyphs() {
    let n = 0;
    for (const c of this.cells) if (c && c.ch !== " ") n++;
    return n;
  }
}

/** Rasterises a Terminal into the 480x360 source canvas. */
export class Rasteriser {
  constructor(canvas) {
    this.canvas = canvas;
    this.canvas.width = SRC_W;
    this.canvas.height = SRC_H;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.atlas = new GlyphAtlas(CHAR_W, CHAR_H, 12, "500");
    this.fullscreen = null;
  }

  setViewport(layout) {
    const width = layout?.pixelWidth || SRC_W;
    const height = layout?.pixelHeight || SRC_H;
    this.fullscreen = layout;
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    const density = layout ? Math.min(4, Math.max(1, Math.ceil(layout.terminal.width / SRC_W * width / layout.width))) : 1;
    this.atlas = new GlyphAtlas(CHAR_W, CHAR_H, 12, "500", density);
    this.ctx.imageSmoothingEnabled = Boolean(layout);
  }

  paint(term, reveal, cursorOn) {
    const g = this.ctx;
    const fs = this.fullscreen;
    const width = fs ? fs.width : SRC_W;
    const height = fs ? fs.height : SRC_H;
    g.save();
    g.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);

    // tube background: not black, a very dark charged phosphor with vignette
    g.fillStyle = "#031009";
    g.fillRect(0, 0, width, height);
    const grad = g.createRadialGradient(width / 2, height / 2, 30, width / 2, height / 2, fs ? Math.max(width, height) * 0.7 : SRC_W * 0.62);
    grad.addColorStop(0, "rgba(16,64,36,0.30)");
    grad.addColorStop(1, "rgba(2,10,5,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, width, height);
    if (fs) {
      g.translate(fs.terminal.x, fs.terminal.y);
      g.scale(fs.terminal.width / SRC_W, fs.terminal.height / SRC_H);
    }

    let shown = 0, lastX = PAD_X, lastY = PAD_Y;

    // Draw the window, not the document. `top` is the first document row that
    // is currently visible; everything below is addressed relative to it, so
    // page renderers never deal in screen coordinates.
    const top = term.scroll | 0;

    for (let y = top; y < top + term.rows; y++) {
      const sy = y - top;
      for (let x = 0; x < term.cols; x++) {
        const cell = term.cells[y * term.cols + x];
        if (!cell) continue;
        if (cell.ch !== " ") {
          if (shown >= reveal) { y = top + term.rows; break; }
          shown++;
          lastX = PAD_X + x * CHAR_W; lastY = PAD_Y + sy * CHAR_H;
        }
        const px = PAD_X + x * CHAR_W, py = PAD_Y + sy * CHAR_H;
        if (cell.invert) {
          g.fillStyle = SHADE[cell.shade] || SHADE.mid;
          g.fillRect(px, py, CHAR_W, CHAR_H);
          this.atlas.blit(g, "#031009", cell.ch, px, py);
        } else {
          this.atlas.blit(g, SHADE[cell.shade] || SHADE.mid, cell.ch, px, py);
        }
      }
    }

    // Row-anchored ops scroll with the document and are clipped to the tube;
    // reveal-gated ops (the boot typing) are absolute.
    for (const o of term.ops) {
      if (o.row !== undefined) {
        const sy = o.row - (term.scroll | 0);
        if (sy < -4 || sy > term.rows + 4) continue;
        g.save();
        g.beginPath();
        g.rect(0, PAD_Y - 2, SRC_W, term.rows * CHAR_H + 4);
        g.clip();
        o.fn(g, PAD_Y + sy * CHAR_H);
        g.restore();
      } else if (reveal >= o.after) {
        o.fn(g);
      }
    }

    if (cursorOn && reveal < 1e8) {
      g.fillStyle = SHADE.core;
      g.fillRect(lastX + CHAR_W, lastY + 2, CHAR_W - 1, CHAR_H - 4);
    }
    g.restore();
  }
}
