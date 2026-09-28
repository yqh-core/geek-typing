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
 *   node scripts/scan-mojibake.mjs                # 扫默认集合（src + tests + scripts + docs + content）
 *   node scripts/scan-mojibake.mjs <路径...>       # 扫指定文件
 *
 * > ⚠️ **扫描的另一个副产品（ `[实测]` ），已于 2026-09-29 P1.6-E 关闭**：
 * >   `content/vocabulary/<包id>/words.json` 的 `phonetic` 字段里混进了**西里尔字母 schwa**（U+04D9）
 * >   来代替 IPA 的 ə（U+0259）—— **同形字污染**（肉眼与渲染都看不出来，但码位不同，
 * >   会让「逐字符比较 ContentId / 音标去抖」把两条本应相同的音标判成不同）。
 * >   当时它被判定为「内容数据质量，留给 CONTENT_QUALITY 章节」⇒ **本扫描把它放进了白名单**，
 * >   结果就是：数据修之前，本脚本一整年都不会响。
 * >
 * > **本轮的处置**（顺序不能反）：
 * >   ① 修数据：`content/vocabulary/{cet4,cet6,ielts,kaoyan,toefl}/words.json` 的 `phonetic`
 * >      共 4907 条 / 6397 处 U+04D9 → U+0259（其余字段零改动），随后 content:build 重算 checksum；
 * >   ② 接进门禁：**移出西里尔白名单 + 把 content/ 加进扫描范围**（之前根本没扫 content/，
 * >      这才是「修改数据也不会响」的真正原因）。
 * >   ⇒ 现在任何一处 U+04D9 都会 exit 1。 detector 是否真的会响，已用「恢复一个受污染文件」
 * >      的合成对照实测过，不是靠推理。
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
 * 精确到「码位 × 路径」的豁免（**不是整个区间**）—— 每条必须写明是什么、为什么、什么时候。
 *
 * 为什么不能用「把西里尔区间放回白名单」这种省事做法：那等于宣布「插入音标里的同形字不算错」，
 * 于是下一个混入的字符（除了 U+04D9 还有一整串同形西里尔小写：
 * U+0430 / U+0435 / U+043E / U+0440 / U+0441 / U+0445，分别与拉丁 a / e / o / p / c / x 同形）
 * 再也不会被抓到。白名单一旦为了当下的方便放开一格，它就再也收不回来。
 *
 * 规则：只有「**指定码位**出现在**指定路径正则**里」才豁免；同一码位出现在别处照样判红，
 * 别的西里尔码位出现在这些文件里也照样判红。
 */
const CODEPOINT_ALLOW = [
  // ── U+0454（西里尔小写乌克兰 ye）—— 2026-09-29 P1.6-E 第二批已全量修正为 U+025B，豁免随之作废 ──
  // 原豁免项：content/vocabulary/{ielts,kaoyan,toefl}/words.json（87 条）+ 派生样本 docs/.../SAMPLE-ielts.json（1 条）。
  // 数据已清干净，此处刻意**不留任何 U+0454 豁免**：再留就是放水，以后真混进来反而抓不到。
  // ── U+04D9（西里尔 schwa）—— 仅豁免「审计留档正文中对该历史缺陷的叙述引用」──
  // 这些是 2026-09-29 之前写下的证据叙述：它们引用的是**修复前**的样例音标，
  // 正文不可改（改了就等于改写证据）。新增实例由 content/ 与其它路径的 0 容忍兜底。
  [0x04d9, /^docs\/audit-package\/04-content\/CONTENT_QUALITY\.md$/,
    '审计留档：叙述中提到修复前的 toefl 样例音标（KK/旧式标注体系的那段论证依赖该原文）'],
  [0x04d9, /^docs\/audit-package\/08-exam\/CET\.md$/,
    '审计留档：CET 实测样例引用修复前的 cet4 数据 + 说明这两者的差异'],
  [0x04d9, /^docs\/audit-package\/08-exam\/TOEFL\.md$/,
    '审计留档：TOEFL 实测样例引用修复前的 toefl 数据 + 说明这两者的差异'],
  [0x04d9, /^docs\/audit-package\/13-acceptance\/KNOWN_ISSUES\.md$/,
    '审计留档：已知问题清单中引用修复前的 toefl 样例'],
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
  const rel = path.replace(/\\/g, '/')
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
          // 精确到「码位 × 路径」的豁免：命中就不报，否则判红
          if (!CODEPOINT_ALLOW.some(([code, where]) => code === cp && where.test(rel))) {
            report(c + 1, seg[c], '非预期文字')
          }
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
  // content/ 必须扫：2026-09-29 之前它**不在集合里**，所以即使数据里躺着 6397 处西里尔 schwa，
  // 本脚本也一声不响 —— 「负责的脚本没覆盖出问题的目录」和「没有脚本」是同一件事。
  : [
    ...listFiles('src'), ...listFiles('tests'), ...listFiles('scripts'), ...listFiles('docs'), ...listFiles('content'),
  ]

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
