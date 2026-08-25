/* ==========================================================================
 * ASSETS
 *
 * Generated sprites, pulled in as real files rather than a pasted base64
 * blob. In dev Vite serves them individually, so a change to a component
 * render shows up on reload; in the production build the singlefile plugin
 * inlines them. `?inline` forces data URIs either way, which keeps the
 * runtime lookup identical in both modes.
 *
 * Regenerate with:  npm run assets
 * ======================================================================== */
const metaGlob = import.meta.glob('../assets/build/meta.json',
  { eager: true, import: 'default' })

const files = import.meta.glob('../assets/build/*.webp',
  { eager: true, query: '?inline', import: 'default' })

// A glob rather than a static import on purpose. assets/build/ is generated
// and gitignored, so a fresh clone has nothing there — and a static import of
// a missing file is a hard resolve error whose message says nothing about the
// step that was skipped.
const metaEntry = Object.values(metaGlob)[0]
if (!metaEntry || !Object.keys(files).length) {
  throw new Error(
    'assets/build is empty — run "npm run assets" once before "npm run dev". ' +
    'It generates the sprites from assets/src and is only needed again when ' +
    'one of those renders changes.')
}

export const ASSETS = Object.fromEntries(
  Object.entries(files).map(([path, url]) =>
    [path.split('/').pop().replace('.webp', ''), url]))

export const ASSET_META = metaEntry
