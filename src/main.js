/* Entry point.
 *
 * Boot once the fonts have settled: the glyph atlas rasterises each character
 * into a texture at construction time, and doing that before the final face
 * loads bakes the fallback into the tube for the rest of the session.
 */
import './style.css'
import { start } from './app.js'

if (document.fonts && document.fonts.ready) document.fonts.ready.then(start)
else addEventListener('load', start)
