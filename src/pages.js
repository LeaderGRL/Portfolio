import { CONTENT } from './content.js'
import { CHAR_H, CHAR_W, PAD_X, PAD_Y, ROWS, SRC_W, wrap } from './core.js'
import { blit, getImage, getVideo } from './media.js'
import { SHADE, Terminal } from './terminal.js'
import { bitmapText, bitmapWidth } from './type.js'

/* ==========================================================================
 * 5. PAGES — each writes a Terminal buffer for the current state
 * ======================================================================== */
/* Every page respects the glass safe area: the picture mask is a bulged
 * superellipse, so the corners round in hard. Text near the top and bottom
 * rows stays centred, lists start at row 3, and full-width rules are allowed
 * to run into the curve — a line fading into glass reads as authentic, a
 * clipped word reads as a bug. */

export function chrome(t, label) {
  t.center(0, " " + label + " ", "mid", true);
  t.hr(1);
}
export function footer(t, str) {
  t.hr(t.rows - 3);
  t.center(t.rows - 2, str, "dim");
}

function ellipsize(value, width) {
  const text = String(value || "");
  const limit = Math.max(0, width | 0);
  if (!limit) return "";
  if (text.length <= limit) return text;
  if (limit === 1) return "…";
  return text.slice(0, limit - 1) + "…";
}

/* --------------------------------------------------------------------------
 * BLOCK RENDERER
 *
 * Every screen that shows authored content goes through this, so a block type
 * added for a project page works on the about page for free. Layout is a
 * single downward cursor and nothing caps at ROWS: the Terminal owns the
 * document/window split, and a renderer that had to know how much fits would
 * stop being a pure function of its content.
 * ----------------------------------------------------------------------- */
export function renderBlocks(t, blocks, y) {
  const W = t.cols - 8;
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        y++;
        t.put(4, y++, b.text.toUpperCase(), "bright");
        t.hr(y++, 4, Math.min(W, b.text.length + 4));
        break;

      case "prose":
        for (const line of wrap(b.text, W)) t.put(4, y++, line, "mid");
        y++;
        break;

      case "list":
        for (const it of b.items) {
          const lines = wrap(it, W - 3);
          t.put(4, y, "·", "bright");
          lines.forEach((l, k) => t.put(6, y + k, l, "mid"));
          y += lines.length;
        }
        y++;
        break;

      case "code": {
        const lines = (b.body || "").split("\n");
        t.box(3, y, t.cols - 6, Math.max(3, lines.length + 2), (b.language || "CODE").toUpperCase(), "dim");
        lines.forEach((line, k) => t.put(5, y + 1 + k, line.slice(0, W - 2), "bright"));
        y += Math.max(3, lines.length + 2) + 1;
        break;
      }

      case "figure": {
        const cols = String(b.cols || "").split(",").map(c => c.trim()).filter(Boolean);
        const rows = b.body.split("\n").map(r => r.split(",").map(c => c.trim()));
        const bw = Math.floor((t.cols - 6) / Math.max(cols.length, 1)) - 2;
        const tall = Math.max(...rows.map(r => r.length)) + 2;
        cols.forEach((c, gi) => {
          const x = 3 + gi * (bw + 2);
          t.put(x + Math.max(0, Math.round((bw - c.length) / 2)), y, c, "bright");
          t.box(x, y + 1, bw, tall, "", "dim");
          (rows[gi] || []).forEach((f, k) => t.put(x + 2, y + 2 + k, f.slice(0, bw - 3), "mid"));
        });
        y += tall + 2;
        break;
      }

      case "image":
      case "video": {
        const rows = Number(b.rows) || 9;
        const entry = b.type === "video"
          ? getVideo(b.src, b.loop !== undefined)
          : getImage(b.src);
        const row = y;
        t.opAt(row, (g, py) => {
          blit(g, entry, PAD_X + 4 * CHAR_W, py,
               (t.cols - 9) * CHAR_W, rows * CHAR_H, Number(b.gain) || 1.15);
        });
        t._reserve(row + rows);
        y += rows;
        if (b.alt) t.center(y++, b.alt.toUpperCase(), "dim");
        y++;
        break;
      }

      case "note":
        t.box(3, y, t.cols - 6, wrap(b.body, W - 2).length + 2, "NOTE", "dim");
        wrap(b.body, W - 2).forEach((l, k) => t.put(5, y + 1 + k, l, "dim"));
        y += wrap(b.body, W - 2).length + 3;
        break;

      case "embed":
        t.box(3, y, t.cols - 6, 4, "EMBED", "dim");
        t.put(5, y + 1, (b.label || b.title || "INTERACTIVE INTEGRATION").slice(0, W - 2), "bright");
        t.put(5, y + 2, (b.src || "").slice(0, W - 2), "dim");
        y += 5;
        break;
    }
  }

  return y;
}

export const PAGES = {
  /* ---------------------------------------------------------------- HOME */
  home(t, st) {
    chrome(t, "HOME");
    const s = 4;
    const w = bitmapWidth(CONTENT.identity.name, s);

    // The headline belongs to rows 2-4. It previously used an absolute y=52
    // inside op(0), which put its upper pixels on top of chrome()'s header rule.
    t.opAt(2, (g, py) => {
      const x = (SRC_W - w) / 2;
      const y = py + 2;
      g.save(); g.globalAlpha = 0.35;
      bitmapText(g, CONTENT.identity.name, x - 1, y - 1, s, SHADE.dim);
      g.restore();
      bitmapText(g, CONTENT.identity.name, x, y, s, SHADE.core);
    });
    t.center(6, CONTENT.identity.role, "mid");
    t.center(7, '"' + CONTENT.identity.tagline + '"', "dim");

    t.box(2, 9, 23, 7, "STATUS", "dim");
    t.put(5, 10, `STATE   ${CONTENT.identity.state || 'AVAILABLE'}`, "bright");
    t.put(5, 11, `BASE    ${CONTENT.identity.base || ''}`, "mid");
    t.put(5, 12, `STACK   ${(CONTENT.identity.stack || '').replace(/\s+/g, '')}`, "mid");
    t.put(5, 13, "UPTIME  " + st.uptime, "dim");
    t.put(5, 14, "TUBE    P1 OK", "dim");

    t.box(27, 9, 21, 7, "INDEX", "dim");
    [["1","ABOUT"],["2","RESUME"],["3","PROJECTS"],["4","ARTICLES"],["5","CONTACT"]]
      .forEach(([k, v], i) => {
        t.put(31, 10 + i, k, "amber");
        t.put(33, 10 + i, "· " + v, "mid");
      });

    footer(t, "PRESS 1-5 OR USE THE LEFT KEYS");
  },

  /* --------------------------------------------------------------- ABOUT */
  about(t, st) {
    chrome(t, "ABOUT");
    const page = CONTENT.pages.about;
    renderBlocks(t, page ? page.blocks : [], 3);
    t.scrollbar();
  },

  /* -------------------------------------------------------------- RESUME */
  resume(t, st) {
    chrome(t, "RESUME");
    const page = CONTENT.pages.resume;
    renderBlocks(t, page ? page.blocks : [], 3);
    t.scrollbar();
  },

  /* ------------------------------------------------------------ LISTINGS */
  projects(t, st) { list(t, st, "PROJECTS", CONTENT.projects); },
  articles(t, st) { list(t, st, "ARTICLES", CONTENT.articles); },

  /* ------------------------------------------------------------- CONTACT */
  contact(t, st) {
    chrome(t, "CONTACT");
    const s = 3, label = "SAY HELLO";
    // Keep the bitmap headline in its own rows. It previously started at
    // y=46, exactly where chrome() draws the header rule, so bloom made the
    // rule, CONTACT label and headline merge into one unreadable band.
    t.opAt(3, (g, py) => {
      bitmapText(g, label, (SRC_W - bitmapWidth(label, s)) / 2, py, s, SHADE.core);
    });
    t.center(6, "OPEN TO RUST / C# ENGINEERING ROLES", "mid");
    let y = 8;
    for (const [k, v] of CONTENT.contact) {
      t.put(8, y, k.padEnd(9, " "), "dim");
      t.put(18, y, v, "bright");
      y += 2;
    }
    // Row 18 belongs to footer(); reserve row 16 for the status so neither
    // text nor phosphor bloom can collide with the footer rule.
    t.center(16, "─ TRANSMISSION READY ─", "dim");
    footer(t, "ESC BACK");
  },

  /* -------------------------------------------------------------- DETAIL */
  /* ------------------------------------------------------------------ ITEM
   * Renders the typed blocks the content plugin produced. Adding a block type
   * is adding a case here and a name to KNOWN_DIRECTIVES in the plugin —
   * nothing else in the pipeline needs to know it exists.
   *
   * Layout is a single downward cursor, so the page is as tall as its content
   * and the Terminal handles the rest. Nothing here caps at ROWS.
   */
  detail(t, st) {
    const item = st.item;

    const s = item.label.length > 14 ? 2 : 4;
    const w = bitmapWidth(item.label, s);
    t.opAt(0, (g, py) => {
      const x = (SRC_W - w) / 2;
      g.save(); g.globalAlpha = 0.3;
      bitmapText(g, item.label, x - 1, py - 1, s, SHADE.dim);
      g.restore();
      bitmapText(g, item.label, x, py, s, SHADE.core);
    });

    let y = 3;
    if (item.sub) { t.center(y++, item.sub.toUpperCase(), "bright"); }
    y += 2;

    // A project's signature visual owns the first viewport. Long-form prose
    // begins below the fold, so the initial state matches the physical-screen
    // composition instead of becoming a dense article excerpt.
    const visual = item.blocks.find(b => b.type === "figure");
    const rest = visual ? item.blocks.filter(b => b !== visual) : item.blocks;
    if (visual) {
      renderBlocks(t, [visual], y);
      t.center(20, item.meta || "DETAIL", "bright");
      t.opAt(20, (g, py) => {
        g.fillStyle = SHADE.mid;
        g.fillRect(SRC_W / 2 - 18, py + CHAR_H + 16, 36, 1);
      });
      y = ROWS + 2;
    }
    y = renderBlocks(t, rest, y);
    if (item.link) { t.put(4, y + 1, "→ " + item.link, "amber"); y += 2; }
  },
};

/** Dense two-row listing with a live readout line for the selection. */
/* --------------------------------------------------------------------------
 * COLLECTION LIST
 *
 * Reads only fields the content adapter documents. It used to reach for
 * `it.tag` and `cur.status`, which the Markdown bundle does not produce — so
 * PROJECTS and ARTICLES threw on undefined.length and rendered nothing. An
 * empty collection is also survivable now: a directory with no files is a
 * legitimate state, not a crash.
 * ----------------------------------------------------------------------- */
export function list(t, st, label, items) {
  chrome(t, label);

  if (!items.length) {
    t.center(Math.floor(t.rows / 2) - 1, "NO ENTRIES", "dim");
    footer(t, "ESC HOME");
    return;
  }

  const cursor = Math.max(0, Math.min(st.cursor | 0, items.length - 1));
  items.forEach((it, i) => {
    const y = 3 + i * 2;
    const sel = i === cursor;
    const rawTag = it.meta || (it.stack && it.stack[0]) || "";
    const maxTagWidth = Math.max(10, Math.floor((t.cols - 8) * 0.38));
    const tag = ellipsize(rawTag, maxTagWidth);
    const tagX = tag ? t.cols - tag.length - 2 : t.cols - 2;
    const labelWidth = Math.max(4, tagX - 6);
    const subtitleWidth = Math.max(4, t.cols - 8);

    t.put(2, y, sel ? "\u25b6" : " ", "core");
    t.put(4, y, ellipsize(it.label, labelWidth), sel ? "core" : "bright");
    if (it.sub) t.put(6, y + 1, ellipsize(it.sub.toUpperCase(), subtitleWidth), "dim");
    if (tag) t.put(tagX, y, tag, sel ? "amber" : "dim");
    if (sel) {
      t.opAt(y, (g, py) => {
        g.fillStyle = "rgba(107,243,154,0.10)";
        g.fillRect(PAD_X - 4, py - 2, SRC_W - PAD_X * 2 + 8, CHAR_H * 2 + 2);
        g.fillStyle = SHADE.bright;
        g.fillRect(PAD_X - 4, py - 2, 2, CHAR_H * 2 + 2);
      });
    }
  });

  const cur = items[cursor];
  const meta = [cur.meta, (cursor + 1) + "/" + items.length].filter(Boolean).join(" \u00b7 ");
  t.center(t.rows - 5, "\u25b8 " + meta, "amber");
  footer(t, "ENTER OPEN \u00b7 \u2191\u2193 SELECT \u00b7 ESC HOME");
}
