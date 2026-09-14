import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = process.cwd()
const REPORT_PATH = path.join(ROOT, 'tmp', 'media-audit.json')
const MEDIA_ROOTS = [
  path.join(ROOT, 'public', 'media'),
  path.join(ROOT, 'content', 'media'),
  path.join(ROOT, 'content', 'projects'),
]
const TEXT_ROOTS = ['content', 'src', 'plugins']
const MEDIA_EXTENSIONS = new Set([
  '.aac', '.avif', '.flac', '.gif', '.glb', '.jpeg', '.jpg', '.m4a', '.m4v',
  '.mov', '.mp3', '.mp4', '.ogg', '.opus', '.png', '.svg', '.wav', '.webm', '.webp',
])
const IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'])
const VIDEO_EXTENSIONS = new Set(['.m4v', '.mov', '.mp4', '.webm'])
const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav'])
const PARSED_VIDEO_EXTENSIONS = new Set(['.m4v', '.mov', '.mp4'])
const PARSED_AUDIO_EXTENSIONS = new Set(['.mp3'])

function walk(root) {
  if (!fs.existsSync(root)) return []
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function classify(ext) {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (ext === '.glb') return 'model'
  return 'other'
}

function parsePng(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), codec: 'png' }
}

function parseGif(buffer) {
  if (buffer.length < 10 || !/^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return null
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), codec: 'gif' }
}

function parseJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset++; continue }
    const marker = buffer[offset + 1]
    offset += 2
    if (marker === 0xd8 || marker === 0xd9) continue
    if (marker === 0xda) break
    if (offset + 2 > buffer.length) break
    const size = buffer.readUInt16BE(offset)
    if (size < 2 || offset + size > buffer.length) break
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
        codec: marker === 0xc2 ? 'jpeg-progressive' : 'jpeg',
      }
    }
    offset += size
  }
  return null
}

function parseWebp(buffer) {
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const data = offset + 8
    if (data + size > buffer.length) break
    if (type === 'VP8X' && size >= 10) {
      const width = 1 + buffer.readUIntLE(data + 4, 3)
      const height = 1 + buffer.readUIntLE(data + 7, 3)
      return { width, height, codec: 'webp-vp8x' }
    }
    if (type === 'VP8 ' && size >= 10 && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
        codec: 'webp-vp8',
      }
    }
    if (type === 'VP8L' && size >= 5 && buffer[data] === 0x2f) {
      const b1 = buffer[data + 1]
      const b2 = buffer[data + 2]
      const b3 = buffer[data + 3]
      const b4 = buffer[data + 4]
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
        codec: 'webp-vp8l',
      }
    }
    offset = data + size + (size % 2)
  }
  return null
}

function readBoxes(buffer, start = 0, end = buffer.length) {
  const boxes = []
  let offset = start
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    let headerSize = 8
    if (size === 1) {
      if (offset + 16 > end) break
      size = Number(buffer.readBigUInt64BE(offset + 8))
      headerSize = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (!Number.isSafeInteger(size) || size < headerSize || offset + size > end) break
    boxes.push({ type, offset, size, headerSize, dataOffset: offset + headerSize, end: offset + size })
    offset += size
  }
  return boxes
}

function childBoxes(buffer, box) {
  return readBoxes(buffer, box.dataOffset, box.end)
}

function child(buffer, box, type) {
  return childBoxes(buffer, box).find(entry => entry.type === type) || null
}

function parseMp4(buffer) {
  const top = readBoxes(buffer)
  const moov = top.find(box => box.type === 'moov')
  const mdat = top.find(box => box.type === 'mdat')
  if (!moov) return null

  let durationSeconds = null
  const mvhd = child(buffer, moov, 'mvhd')
  if (mvhd) {
    const version = buffer[mvhd.dataOffset]
    if (version === 0 && mvhd.dataOffset + 20 <= mvhd.end) {
      const timescale = buffer.readUInt32BE(mvhd.dataOffset + 12)
      const duration = buffer.readUInt32BE(mvhd.dataOffset + 16)
      if (timescale) durationSeconds = duration / timescale
    } else if (version === 1 && mvhd.dataOffset + 32 <= mvhd.end) {
      const timescale = buffer.readUInt32BE(mvhd.dataOffset + 20)
      const duration = Number(buffer.readBigUInt64BE(mvhd.dataOffset + 24))
      if (timescale) durationSeconds = duration / timescale
    }
  }

  let width = null
  let height = null
  let videoCodec = null
  let audioCodec = null
  for (const trak of childBoxes(buffer, moov).filter(box => box.type === 'trak')) {
    const mdia = child(buffer, trak, 'mdia')
    if (!mdia) continue
    const hdlr = child(buffer, mdia, 'hdlr')
    if (!hdlr || hdlr.dataOffset + 12 > hdlr.end) continue
    const handler = buffer.toString('ascii', hdlr.dataOffset + 8, hdlr.dataOffset + 12)
    const minf = child(buffer, mdia, 'minf')
    const stbl = minf && child(buffer, minf, 'stbl')
    const stsd = stbl && child(buffer, stbl, 'stsd')
    if (!stsd || stsd.dataOffset + 16 > stsd.end) continue
    const entryOffset = stsd.dataOffset + 8
    if (entryOffset + 8 > stsd.end) continue
    const codec = buffer.toString('ascii', entryOffset + 4, entryOffset + 8)
    if (handler === 'vide') {
      videoCodec = codec
      if (entryOffset + 36 <= stsd.end) {
        width = buffer.readUInt16BE(entryOffset + 32)
        height = buffer.readUInt16BE(entryOffset + 34)
      }
    } else if (handler === 'soun') {
      audioCodec = codec
    }
  }

  const codecs = [videoCodec, audioCodec].filter(Boolean)
  return {
    width,
    height,
    durationSeconds,
    codec: codecs.join('+') || 'mp4',
    fastStart: Boolean(moov && mdat && moov.offset < mdat.offset),
  }
}

const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
const MPEG2_LAYER3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
const MPEG_SAMPLE_RATES = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
}

function synchsafe(value) {
  return ((value[0] & 0x7f) << 21) | ((value[1] & 0x7f) << 14) | ((value[2] & 0x7f) << 7) | (value[3] & 0x7f)
}

function parseMp3FrameHeader(buffer, offset) {
  if (offset + 4 > buffer.length || buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) return null
  const versionBits = (buffer[offset + 1] >> 3) & 0x03
  const layerBits = (buffer[offset + 1] >> 1) & 0x03
  const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f
  const sampleRateIndex = (buffer[offset + 2] >> 2) & 0x03
  const padding = (buffer[offset + 2] >> 1) & 0x01
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) return null
  const rates = MPEG_SAMPLE_RATES[versionBits]
  if (!rates) return null
  const bitrateKbps = (versionBits === 3 ? MPEG1_LAYER3_BITRATES : MPEG2_LAYER3_BITRATES)[bitrateIndex]
  const sampleRate = rates[sampleRateIndex]
  const samplesPerFrame = versionBits === 3 ? 1152 : 576
  const coefficient = versionBits === 3 ? 144 : 72
  const frameSize = Math.floor((coefficient * bitrateKbps * 1000) / sampleRate) + padding
  if (frameSize < 4 || offset + frameSize > buffer.length) return null
  return { bitrateKbps, sampleRate, samplesPerFrame, frameSize }
}

function parseMp3(buffer) {
  let offset = 0
  if (buffer.length >= 10 && buffer.toString('ascii', 0, 3) === 'ID3') {
    const tagSize = synchsafe(buffer.subarray(6, 10))
    offset = 10 + tagSize + ((buffer[5] & 0x10) ? 10 : 0)
  }

  let frames = 0
  let durationSeconds = 0
  let bitrateTotal = 0
  let firstFrameOffset = null
  while (offset + 4 <= buffer.length) {
    const frame = parseMp3FrameHeader(buffer, offset)
    if (!frame) {
      if (frames > 0) break
      offset++
      continue
    }
    firstFrameOffset ??= offset
    frames++
    durationSeconds += frame.samplesPerFrame / frame.sampleRate
    bitrateTotal += frame.bitrateKbps
    offset += frame.frameSize
  }
  if (!frames) return null
  return {
    codec: 'mp3',
    durationSeconds,
    bitrateKbps: Math.round(bitrateTotal / frames),
    audioDataOffset: firstFrameOffset,
  }
}

function metadata(buffer, ext) {
  if (ext === '.png') return parsePng(buffer)
  if (ext === '.gif') return parseGif(buffer)
  if (ext === '.jpg' || ext === '.jpeg') return parseJpeg(buffer)
  if (ext === '.webp') return parseWebp(buffer)
  if (ext === '.mp4' || ext === '.m4v' || ext === '.mov') return parseMp4(buffer)
  if (ext === '.mp3') return parseMp3(buffer)
  if (ext === '.glb') return { codec: 'glb' }
  return { codec: ext.replace(/^\./, '') || 'unknown' }
}

function textFiles() {
  return TEXT_ROOTS.flatMap(root => walk(path.join(ROOT, root)))
    .filter(file => /\.(?:css|html|js|json|md|mjs|py)$/i.test(file))
    .filter(file => path.basename(file).toLowerCase() !== 'readme.md')
    .map(file => ({ path: rel(file), text: fs.readFileSync(file, 'utf8') }))
}

function referenceTokens(file) {
  const repoPath = rel(file)
  if (repoPath.startsWith('public/')) {
    const webPath = '/' + repoPath.slice('public/'.length)
    return [webPath, encodeURI(webPath)]
  }
  if (repoPath.startsWith('content/media/')) {
    return [repoPath.slice('content/media/'.length)]
  }
  if (repoPath.startsWith('content/projects/')) {
    return [path.posix.basename(repoPath)]
  }
  return [repoPath]
}

function findReferences(file, texts) {
  const repoPath = rel(file)
  const tokens = referenceTokens(file)
  let candidates = texts
  if (repoPath.startsWith('content/projects/')) {
    const parts = repoPath.split('/')
    const projectDir = parts.length > 3 ? parts.slice(0, 3).join('/') : 'content/projects'
    candidates = texts.filter(entry => entry.path.startsWith(projectDir + '/') || entry.path === `${projectDir}.md`)
  } else if (repoPath.startsWith('content/media/')) {
    candidates = texts.filter(entry => (
      entry.path.startsWith('content/articles/')
      || entry.path.startsWith('content/pages/')
      || entry.path.startsWith('content/projects/')
    ))
  }
  return candidates.filter(entry => tokens.some(token => entry.text.includes(token))).map(entry => entry.path)
}

function auditFile(file, texts) {
  const buffer = fs.readFileSync(file)
  const ext = path.extname(file).toLowerCase()
  const info = metadata(buffer, ext) || {}
  if (info.durationSeconds && !info.bitrateKbps) {
    info.bitrateKbps = Math.round((buffer.length * 8) / info.durationSeconds / 1000)
  }
  const references = findReferences(file, texts)
  return {
    path: rel(file),
    kind: classify(ext),
    bytes: buffer.length,
    sha256: sha256(buffer),
    referenced: references.length > 0,
    references,
    ...info,
  }
}

function validate(items) {
  const failures = []
  for (const item of items) {
    if (!item.referenced) continue
    const ext = path.extname(item.path).toLowerCase()
    if (item.kind === 'image' && /\.(?:gif|jpe?g|png|webp)$/i.test(item.path)) {
      if (!item.width || !item.height) failures.push(`${item.path}: missing image dimensions`)
    }
    if (item.kind === 'video' && !PARSED_VIDEO_EXTENSIONS.has(ext)) {
      failures.push(`${item.path}: unsupported video metadata format (${ext})`)
      continue
    }
    if (item.kind === 'audio' && !PARSED_AUDIO_EXTENSIONS.has(ext)) {
      failures.push(`${item.path}: unsupported audio metadata format (${ext})`)
      continue
    }
    if (item.kind === 'video') {
      if (!item.durationSeconds) failures.push(`${item.path}: missing video duration`)
      if (!item.codec || item.codec === 'mp4') failures.push(`${item.path}: missing video codec`)
      if (!item.width || !item.height) failures.push(`${item.path}: missing video dimensions`)
      if (!item.bitrateKbps) failures.push(`${item.path}: missing video bitrate`)
    }
    if (item.kind === 'audio') {
      if (!item.durationSeconds) failures.push(`${item.path}: missing audio duration`)
      if (!item.bitrateKbps) failures.push(`${item.path}: missing audio bitrate`)
    }
  }
  return failures
}

const texts = textFiles()
const files = [...new Set(MEDIA_ROOTS.flatMap(walk))]
  .filter(file => MEDIA_EXTENSIONS.has(path.extname(file).toLowerCase()))
  .sort((a, b) => rel(a).localeCompare(rel(b)))
const media = files.map(file => auditFile(file, texts))

const byKind = Object.fromEntries(['image', 'video', 'audio', 'model', 'other'].map(kind => {
  const items = media.filter(item => item.kind === kind)
  return [kind, { files: items.length, bytes: items.reduce((sum, item) => sum + item.bytes, 0) }]
}))
const byHash = new Map()
for (const item of media) {
  if (!byHash.has(item.sha256)) byHash.set(item.sha256, [])
  byHash.get(item.sha256).push(item.path)
}
const duplicateGroups = [...byHash.entries()]
  .filter(([, paths]) => paths.length > 1)
  .map(([hash, paths]) => ({ hash, paths }))
const failures = validate(media)
const incompleteMetadata = media.filter(item => {
  const ext = path.extname(item.path).toLowerCase()
  if (item.kind === 'image' && /\.(?:gif|jpe?g|png|webp)$/i.test(item.path)) return !item.width || !item.height
  if (item.kind === 'video') {
    return !PARSED_VIDEO_EXTENSIONS.has(ext)
      || !item.durationSeconds
      || !item.width
      || !item.height
      || !item.bitrateKbps
  }
  if (item.kind === 'audio') {
    return !PARSED_AUDIO_EXTENSIONS.has(ext) || !item.durationSeconds || !item.bitrateKbps
  }
  return false
}).map(item => ({ path: item.path, referenced: item.referenced }))
const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    files: media.length,
    bytes: media.reduce((sum, item) => sum + item.bytes, 0),
    byKind,
  },
  duplicateGroups,
  incompleteMetadata,
  unreferenced: media.filter(item => !item.referenced).map(item => ({ path: item.path, bytes: item.bytes, sha256: item.sha256 })),
  largest: [...media].sort((a, b) => b.bytes - a.bytes).slice(0, 20).map(({ path, kind, bytes, durationSeconds, bitrateKbps, width, height, codec }) => ({
    path, kind, bytes, durationSeconds, bitrateKbps, width, height, codec,
  })),
  media,
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n')

const mib = value => (value / 1024 / 1024).toFixed(2)
console.log(`media: ${report.totals.files} files / ${mib(report.totals.bytes)} MiB`)
for (const [kind, total] of Object.entries(report.totals.byKind)) {
  if (total.files) console.log(`  ${kind.padEnd(6)} ${String(total.files).padStart(3)} files / ${mib(total.bytes).padStart(6)} MiB`)
}
console.log(`unreferenced candidates: ${report.unreferenced.length}`)
console.log(`exact duplicate groups : ${report.duplicateGroups.length}`)
console.log(`metadata review items  : ${report.incompleteMetadata.length}`)
console.log('\nlargest media:')
for (const item of report.largest.slice(0, 10)) {
  const detail = item.durationSeconds
    ? ` / ${item.durationSeconds.toFixed(1)}s / ${item.bitrateKbps || '?'} kbps`
    : item.width && item.height ? ` / ${item.width}x${item.height}` : ''
  console.log(`  ${mib(item.bytes).padStart(7)} MiB  ${item.path}${detail}`)
}
console.log(`\nreport: ${rel(REPORT_PATH)}`)

if (process.argv.includes('--check') && failures.length) {
  console.error('\nmedia audit validation failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exitCode = 1
}
