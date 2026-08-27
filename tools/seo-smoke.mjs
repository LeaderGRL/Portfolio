import fs from 'node:fs'

const html = fs.readFileSync('dist/index.html', 'utf8')
const nginx = fs.readFileSync('dist/nginx.conf', 'utf8')

const BASE_TITLE = 'Jordan Grilly — Systems / Performance / Architecture'
const BASE_DESCRIPTION = 'Portfolio of Jordan Grilly, systems and performance engineer.'

const checks = [
  ['base title anchor is normalized', html.includes(`<title>${BASE_TITLE}</title>`)],
  ['base description anchor is normalized', html.includes(`<meta name="description" content="${BASE_DESCRIPTION}">`)],
  ['base Open Graph title is normalized', html.includes(`<meta property="og:title" content="${BASE_TITLE}">`)],
  ['base Open Graph URL is normalized', html.includes('<meta property="og:url" content="/">')],
  ['base Twitter title is normalized', html.includes(`<meta name="twitter:title" content="${BASE_TITLE}">`)],
  ['base canonical is normalized', html.includes('<link rel="canonical" href="/">')],
  ['original request path is normalized', nginx.includes('map $request_uri $seo_path')],
  ['SEO maps use stable deep-link path', nginx.includes('map $seo_path $seo_title') && nginx.includes('map $seo_path $seo_description')],
  ['project deep links are mapped', nginx.includes('"/projects/penw"')],
  ['article deep links are mapped', nginx.includes('"/articles/')],
  ['canonical is request-aware', nginx.includes('sub_filter \'<link rel="canonical" href="/">\' \'<link rel="canonical" href="$seo_url">\';')],
  ['Twitter title is request-aware', nginx.includes(`sub_filter '<meta name="twitter:title" content="${BASE_TITLE}">' '<meta name="twitter:title" content="$seo_title">';`)],
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
