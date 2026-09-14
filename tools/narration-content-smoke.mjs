import { collectionDocumentPaths, validateNarrationDocument } from './narration-validator.mjs'

let failed = 0
let checked = 0

for (const documentPath of [
  ...collectionDocumentPaths('content/projects'),
  ...collectionDocumentPaths('content/articles'),
]) {
  try {
    const narration = validateNarrationDocument(documentPath)
    if (narration) checked++
  } catch (error) {
    failed++
    console.error(`  ${error.message}`)
  }
}

if (failed) {
  console.error(`\n  ${failed} narration validation error(s)`)
  process.exit(1)
}

console.log(`  narration assets checked: ${checked}`)
