/* Entry point.
 *
 * Boot once the fonts have settled: both the terminal glyph atlas and the
 * article raster source depend on the final font metrics. App owns the single
 * physical CRT pipeline; content providers only supply pixels to it.
 */
import './style.css'
import './display.css'
import { start } from './app.js'

if (document.fonts && document.fonts.ready) document.fonts.ready.then(start)
else addEventListener('load', start)
