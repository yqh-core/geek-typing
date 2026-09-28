/* 乱码扫描（mojibake scan）—— 把「肉眼漏掉的乱码」变成命令行一条可重复执行的判据。
 *
 * 起因：本轮两次出现「编辑工具写入时混进了非目标文字系统」的事故
 *   （一次混进孟加拉文，一次混进阿拉伯文/泰文/日文碎片），
 *   两次都是**肉眼读一遍看不出来**、靠逐字符扫描才抓到的。
 *   既然同一个坑踩了两次，就该把它从「写完记得扫一下」升级成「npm run lint:text」。
 *
 * 判据（机械，无人工介入）：
 *   逐字符检查每个文件的 Unicode 码位，落在白名单区间外 ⇒ EXIT=1 并打印 文件:行:列 + 字符名。
 *   「日文假名」这类**技术上合法但本项目无语境**的字符单独归类提醒复核，同样计嫌疑。
 *
 * 白名单为什么包含 ① ② ③ / Σ / ⏱：
 *   它们是本仓库**既有**的排印习惯（`content-query.ts` 用 ①② 标注查找步骤、
 *   `tests/content-query.mjs` 用 Σ 表示合计、App.tsx 用 ⏱ 做倒计时图标），
 *   不是乱码。把它们列出来是为了让扫描「不喊狼来了」—— 告警一旦有噪音就会被忽略。
 *
 * 用法：
 *   node scripts/scan-mojibake.mjs                # 扫默认集合（src + tests + scripts + docs）
 *   node scripts/scan-mojibake.mjs <路径...>       # 扫指定文件
 *
 * > ⚠️ **扫描 outra 一个副产品（ `[实测]` ）**：`docs/audit-package/content-samples/*.json`
 * >   的 `phonetic` 字段里混进了**西里尔字母 schwa**（U+04D9）来代替 IPA 的 ə（U+0259）。
 * >   肉眼与渲染都看不出来，但它会让「逐字符比较 ContentId / 音标去抖」这类逻辑
 * >   把两条本应相同的音标判成不同。这不是乱码（不属于本次要抓的事故），
 * >   但既然被扫出来了就记一笔 —— 属于内容数据质量，留给 CONTENT_QUALITY 章节处理。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

/** 允许出现的 Unicode 区间：[起始, 结束, 说明] */
const ALLOWED = [
  [0x0000, 0x007f, 'ASCII'],
  [0x00a0, 0x00ff, 'Latin-1 supplement（© ° é）'],
  [0x0100, 0x017f, 'Latin Extended-A'],
  [0x03a1, 0x03a9, '希腊字母 Σ 等（本仓库用作求和符号）'],
  [0x0250, 0x02ff, 'IPA 音标 + 间隔修饰字母（phonetic 字段的合法字符）'],
  [0x0370, 0x03ff, '希腊字母全区间（θ 等音标/符号）'],
  [0x0400, 0x04ff, '西里尔字母（数据里 U+04D9 被当作 schwa 用，见文件头注）'],
  [0x2010, 0x203b, '通用标点（– — 「」 ‐ •）'],
  [0x2190, 0x21ff, '箭头'],
  [0x2200, 0x22ff, '数学运算符'],
  [0x2300, 0x23ff, '杂项技术符号（⏱ 倒计时）'],
  [0x2460, 0x24ff, '圈号 ① ② ③（本仓库标注步骤用）'],
  [0x2100, 0x214f, '字母类符号（ℹ ™ 等）'],
  [0x27f0, 0x297f, '补充箭头 A/B（⟺ ⟹ 等，契约文档用于逻辑等价）'],
  [0x2b00, 0x2bff, '杂项符号与箭头（⭐ 等表格标记）'],
  [0x1f100, 0x1f2ff, '封闭字母数字补充（🆕 等）'],
  [0x2500, 0x257f, '制表符'],
  [0x25a0, 0x25ff, '几何图形'],
  [0x2600, 0x26ff, '杂项符号（⚠）'],
  [0x2700, 0x27bf, '装饰符号'],
  [0x2e80, 0x2fdf, 'CJK 部首补充'],
  [0x3000, 0x303f, 'CJK 标点（。、《》【】）'],
  [0x4e00, 0x9fff, 'CJK 统一表意文字'],
  [0xfe0f, 0xfe0f, 'variation selector'],
  [0xff00, 0xffef, '全角形式'],
  [0x1f300, 0x1faff, 'emoji（✅ ❌ 🔴 🟡）'],
]

/** 落在白名单内、但本项目**没有语境**⇒ 仍要报出来人工复核 */
const WATCHED = [
  [0x3040, 0x309f, '平假名'],
  [0x30a0, 0x30ff, '片假名'],
  [0xac00, 0xd7af, '韩文音节'],
]

/**
 * 已知豁免：**整文件**级别的例外，必须写明原因与日期，不许裸着忽略。
 *
 * 下面三个文件不是「混进了乱码」，而是**整个文件被宿主的 Esafenet（亿赛通）透明加密
 * 驱动加密了**：文件头含 `Esafenet` 标记，内容不是合法 UTF-8，用 UTF-8 打开会看到
 * 成片的 U+FFFD。这属于**另一类事故**（数据不可读），交给专门的处置流程，
 * 不能因为它而让本扫描长期报错 —— 告警一旦常态化就等于失效。
 */
const FILE_IGNORE = new Map([
  // 2026-09-28 处置（INCIDENT-ESAFENET §7）：README.md 与 public/robots.txt 已重写为明文，
  // 恢复正常扫描、不再豁免；两个密文文档移入隔离区 docs/_quarantine-esafenet/（.gitignore 排除），
  // 以隔离后的新路径保留豁免。
  ['docs/_quarantine-esafenet/功能总结.md', '整文件为 Esafenet 密文 —— 2026-09-28 自 docs/功能总结.md 隔离至此，原内容不可恢复'],
  ['docs/_quarantine-esafenet/测试方案.md', '整文件为 Esafenet 密文 —— 2026-09-28 自 docs/测试方案.md 隔离至此，原内容不可恢复'],
])

const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.html', '.css'])

function listFiles(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '.git' || name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) listFiles(p, out)
    else if (EXT.has(extname(name))) out.push(p)
  }
  return out
}

function scan(path) {
  let hits = 0
  let line = ''
  let lineno = 0
  const report = (col, ch, kind) => {
    hits++
    const cp = 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')
    console.log(`${path}:${lineno}:${col} [${kind}] ${cp} :: ${line.trim().slice(0, 70)}`)
  }
  try {
    line = ''
    const text = readFileSync(path, 'utf8')
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      lineno = i + 1
      line = lines[i]
      const seg = [...line]
      for (let c = 0; c < seg.length; c++) {
        const cp = seg[c].codePointAt(0)
        const allowed = ALLOWED.some(([lo, hi]) => cp >= lo && cp <= hi)
        if (!allowed) {
          report(c + 1, seg[c], '非预期文字')
          continue
        }
        const watched = WATCHED.find(([lo, hi]) => cp >= lo && cp <= hi)
        if (watched) report(c + 1, seg[c], watched[2] + '（本项目无该语境，复核）')
      }
    }
  } catch (e) {
    console.log(`${path}: 读取失败 ${e.message}`)
  }
  return hits
}

const targets = process.argv.slice(2)
const files = targets.length
  ? targets.flatMap((t) => (statSync(t).isDirectory() ? listFiles(t) : [t]))
  : [...listFiles('src'), ...listFiles('tests'), ...listFiles('scripts'), ...listFiles('docs')]

console.log(`[scan-mojibake] 扫描 ${files.length} 个文件`)
const skipped = []
const targets2 = []
for (const f of files) {
  const rel = f.replace(/\\/g, '/')
  const why = FILE_IGNORE.get(rel)
  if (why) skipped.push(`${rel} —— 豁免原因：${why}`)
  else targets2.push(f)
}
if (skipped.length) {
  console.log(`\n⚠️ 以下 ${skipped.length} 个文件被 FILE_IGNORE 豁免（不是干净通过了）：`)
  for (const s of skipped) console.log('   ' + s)
  console.log('')
}
let total = 0
for (const f of targets2) total += scan(f)
console.log(`--- 完成：${total} 处嫌疑 ---`)
if (total > 0) process.exit(1)
