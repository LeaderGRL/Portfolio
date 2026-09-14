import fs from 'node:fs'
import path from 'node:path'
import { validateNarrationDocument } from './narration-validator.mjs'

let failed = 0
let checked = 0

function visit(root) {
  if (!fs.existsSync(root)) return
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      visit(fullPath)
      continue
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue

    try {
      const narration = validateNarrationDocument(fullPath)
      if (narration) checked++
    } catch (error) {
      failed++
      console.error(`  ${error.message}`)
    }
  }
}

visit('content/projects')
visit('content/articles')

if (failed) {
  console.error(`\n  ${failed} narration validation error(s)`)
  process.exit(1)
}

console.log(`  narration assets checked: ${checked}`)
