import { copyFile, mkdir, open } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const [, , sourceArg, projectArg, fileArg] = process.argv

if (!sourceArg || !projectArg) {
  console.error('Usage: node tools/install-project-model.mjs <source.glb> <project-slug> [filename.glb]')
  process.exit(1)
}

const source = path.resolve(sourceArg)
const project = String(projectArg).trim().toLowerCase()
const filename = fileArg || path.basename(source)

if (!/^[a-z0-9][a-z0-9-_]*$/.test(project)) {
  console.error(`Invalid project slug: ${projectArg}`)
  process.exit(1)
}

if (!filename.toLowerCase().endsWith('.glb')) {
  console.error('The destination filename must end in .glb')
  process.exit(1)
}

async function inspectGlb(filePath) {
  const handle = await open(filePath, 'r')
  try {
    const header = Buffer.alloc(12)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    if (bytesRead !== 12 || header.toString('ascii', 0, 4) !== 'glTF') {
      throw new Error('Invalid GLB header: expected glTF magic bytes')
    }

    const version = header.readUInt32LE(4)
    const declaredLength = header.readUInt32LE(8)
    if (version !== 2) throw new Error(`Unsupported GLB version: ${version}`)

    return { version, declaredLength }
  } finally {
    await handle.close()
  }
}

try {
  const info = await inspectGlb(source)
  const destinationDir = path.resolve('public', 'media', project)
  const destination = path.join(destinationDir, filename)

  await mkdir(destinationDir, { recursive: true })
  await copyFile(source, destination)

  console.log(`Installed ${destination}`)
  console.log(`GLB v${info.version} · ${info.declaredLength.toLocaleString()} bytes`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
