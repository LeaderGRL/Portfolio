import fs from 'node:fs'

const html = fs.readFileSync('dist/index.html', 'utf8')
const nginx = fs.readFileSync('dist/nginx.conf', 'utf8')

// Vite may normalize void-element markup or attribute order in the built HTML.
// Validate semantics instead of requiring the source template's exact string.
const hasRootCanonical = /<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']\/?["'])[^>]*>/i.test(html)

const checks = [
  ['base Open Graph title exists', html.includes('<meta property="og:title"')],
  ['base canonical exists', hasRootCanonical],
  ['original request path is normalized', nginx.includes('map $request_uri $seo_path')],
  ['SEO maps use stable deep-link path', nginx.includes('map $seo_path $seo_title') && nginx.includes('map $seo_path $seo_description')],
  ['project deep links are mapped', nginx.includes('"/projects/penw"')],
  ['article deep links are mapped', nginx.includes('"/articles/')],
  ['canonical is request-aware', nginx.includes('sub_filter \'<link rel="canonical" href="/">\' \'<link rel="canonical" href="$seo_url">\';')],
  ['canonical excludes query parameters', nginx.includes('set $seo_url "$scheme://$host$seo_path";')],
  ['Open Graph URL is request-aware', nginx.includes('content="$seo_url"')],
  ['social type can be article', nginx.includes('"article";')],
]

let failed = 0
for (const [name, pass] of checks) {
  console.log(`  ${name.padEnd(42)} ${pass ? 'ok' : 'FAILED'}`)
  if (!pass) failed++
}

if (nginx.includes('# SEO_MAPS_GENERATED_HERE') || nginx.includes('# SEO_SUB_FILTERS_GENERATED_HERE')) {
  console.error('  generated nginx config still contains unresolved SEO markers')
  failed++
}

process.exit(failed ? 1 : 0)
