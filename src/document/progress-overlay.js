import { SRC_H, SRC_W } from '../core.js'

/* ========================================================================== *
 * DocumentProgressOverlay
 *
 * Long-form project pages should feel navigable without requiring every project
 * author to hand-build a table of contents. This overlay derives chapter state
 * from the document's existing Markdown headings and paints directly into the
 * raster source, so the progress UI receives the same CRT shader as the content.
 * ========================================================================== */
export class DocumentProgressOverlay {
  constructor() {
    this.minChapters = 2
  }

  _chapters(rasteriser) {
    const headings = (rasteriser?.item?.blocks || []).filter(block => block.type === 'heading')
    const entries = (rasteriser?.layout || []).filter(entry => entry.type === 'heading')
    return headings.slice(0, entries.length).map((block, index) => ({
      block,
      entry: entries[index],
    }))
  }

  _activeIndex(chapters, scroll) {
    const probe = scroll + 92
    let active = 0
    for (let index = 0; index < chapters.length; index++) {
      if (chapters[index].entry.y <= probe) active = index
      else break
    }
    return active
  }

  paint(rasteriser) {
    const chapters = this._chapters(rasteriser)
    if (chapters.length < this.minChapters) return false

    const g = rasteriser.ctx
    const scroll = rasteriser.scroll || 0
    const maxScroll = Math.max(1, rasteriser.maxScroll || 1)
    const progress = Math.max(0, Math.min(1, scroll / maxScroll))
    const active = this._activeIndex(chapters, scroll)

    const railX = SRC_W - 29.5
    const top = 35
    const bottom = SRC_H - 34
    const railH = bottom - top

    g.save()

    // Keep the rail peripheral: it should provide orientation without competing
    // with project media or prose for the center of the CRT.
    g.strokeStyle = 'rgba(47,208,109,.20)'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(railX, top)
    g.lineTo(railX, bottom)
    g.stroke()

    g.strokeStyle = 'rgba(107,243,154,.70)'
    g.beginPath()
    g.moveTo(railX, top)
    g.lineTo(railX, top + railH * progress)
    g.stroke()

    chapters.forEach((chapter, index) => {
      const denominator = Math.max(1, rasteriser.documentHeight || 1)
      const chapterProgress = Math.max(0, Math.min(1, chapter.entry.y / denominator))
      const y = top + railH * chapterProgress
      const isActive = index === active
      g.fillStyle = isActive ? '#b9ffc9' : 'rgba(47,208,109,.46)'
      g.fillRect(railX - (isActive ? 3 : 2), y - 1, isActive ? 7 : 5, isActive ? 3 : 2)
    })

    const counter = `${String(active + 1).padStart(2, '0')}/${String(chapters.length).padStart(2, '0')}`
    g.font = '700 7px ui-monospace, "SFMono-Regular", Consolas, monospace'
    g.textAlign = 'right'
    g.fillStyle = '#ffb347'
    g.fillText(counter, SRC_W - 35, SRC_H - 17)

    const label = String(chapters[active]?.block?.text || '').toUpperCase()
    const compact = label.length > 26 ? `${label.slice(0, 25)}…` : label
    g.fillStyle = 'rgba(107,243,154,.74)'
    g.fillText(compact, SRC_W - 69, SRC_H - 17)

    g.restore()
    return true
  }
}
