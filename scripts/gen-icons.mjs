/**
 * 生成 PWA 图标（纯 Node 实现，无第三方依赖）
 * 用法：node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/* ---------- 极简 PNG 编码器 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0 // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------- 画一个"正在打字"的图标 ---------- */
function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4)
  const put = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
    buf[i + 3] = a
  }
  const rect = (x0, y0, x1, y1, color) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, color)
  }
  const rounded = (x0, y0, x1, y1, r, color) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const cx = Math.max(x0 + r, Math.min(x1 - 1 - r, x))
        const cy = Math.max(y0 + r, Math.min(y1 - 1 - r, y))
        const d = Math.hypot(x - cx, y - cy)
        if (d <= r) put(x, y, color)
      }
    }
  }

  const u = size / 512 // 以 512 为基准做缩放
  const S = (n) => Math.round(n * u)

  // 圆角底板
  rounded(0, 0, size, size, S(96), [15, 23, 42])

  // 四行"代码/文本"，最后一行绿色且带光标
  const lines = [
    { y: 120, w: 300, color: [71, 85, 105] },
    { y: 208, w: 380, color: [71, 85, 105] },
    { y: 296, w: 250, color: [71, 85, 105] },
    { y: 384, w: 200, color: [52, 211, 153] },
  ]
  const x0 = S(72)
  for (const l of lines) {
    rect(x0, S(l.y), x0 + S(l.w), S(l.y + 44), l.color)
  }
  // 光标竖条（在绿线之后）
  rect(x0 + S(220), S(374), x0 + S(232), S(438), [248, 250, 252])
  return buf
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(file, encodePng(size, size, drawIcon(size)))
  console.log(`✓ 生成 ${file}`)
}
