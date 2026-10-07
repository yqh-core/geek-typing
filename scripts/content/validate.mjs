/* V4.1 · content:validate —— 内容层门禁（CI 与 build 前置）。
 *
 * 检查项：
 *  1. manifest.json / 载荷文件存在且 JSON 合法（载荷：vocabulary→words.json 必有；
 *     其余类型→items.json 可选 —— 无载荷包的 offline.policy 必须为合法值且 registry 侧可解释）
 *  2. manifest 必填字段完整（id/type/version/title/sources/offline...）
 *  3. ContentId 4 段式规范：content:<目录类型>:<namespace>:<目录名>（P1.7-Wave4 B-1 泛化：
 *     扫描 content/ 下全部类型子目录，目录名即类型，须在 ContentType 白名单内）
 *  4. 包内 duplicate word 检测（**跨包同词合法**：IELTS/CET/TOEFL 各有 abandon 是正常
 *     数据关系，是本平台刻意支持的能力，任何「跨包词唯一」规则都是错误的——见下方注释）
 *  5. stats.items 与 words 实际词数一致（漂移时跑 npm run content:build 自动同步）
 *  6. sources[].checksum 与 words.json 实际完整 SHA-256 一致
 *  7. License 门禁：每条 source 必须有结构化 license；外部来源须有 SPDX 标识
 *  8. 包 id 全局唯一（同一 ContentId 不得被两个包占用）
 *  9. namespace 每包唯一（词级 ContentId 全局唯一的充要条件，见代码内注释）
 * 10. schemaVersion 存在且 === SCHEMA_VERSION（结构版本，由 content:build 写入）
 * 11. contentVersion 存在且为正整数（对外学习契约版本，同一 checksum 复用同一 version）
 * 12. Duplicate Detection（分级，见代码内注释）：
 *     (a) 包内 duplicate localId —— 第 4 项已覆盖，此处只回显，不重复报错
 *     (b) 包内 duplicate normalized word（大小写/空白差异撞车）
 *     (c) 跨包 duplicate ContentId —— 全库兜底回归检测
 *     (d) duplicate source —— 同一 origin 在 sources[] 出现两次
 *     (e) invalid / orphan relation —— 仅当 relations.json 存在时校验，否则打印跳过
 *     (f) broken asset —— 仅当 manifest.assets 存在时，按 asset-rules.mjs 的**全规则**校验
 *         （assetId 语法/归属 · checksum · url · 许可 · provenance）；否则打印跳过。
 *         ⚠️ 规则实现在 scripts/content/asset-rules.mjs（唯一），本判据不含规则逻辑，只取汇总结果。
 *     (g) orphan learning record —— 运行时检查，由 Learning 层负责，脚本不校验
 * 13. packageId 存在且 === 目录名（一词三表：manifest.packageId / 目录 / ContentId 第 4 段）
 * 14. namespace 存在，且与从 manifest.id 解析出的第 3 段严格相等（两者必须同源；
 *     「每包唯一」由第 9 项兜底）
 * 15. contentChecksum === checksumPayload(words)（= license-policy.mjs → canonical.mjs
 *     的 sha256Canonical；**必须走 canonical**，不得用文件原文
 *     或 JSON.stringify 直算，否则文件排版一变就误判漂移）
 * 16. contentRevision / contentVersion 均为正整数；contentHistory 中存在
 *     checksum === contentChecksum 的条目，且该条目 version === contentVersion、
 *     revision <= contentRevision（回滚场景：version 回到历史值，revision 只增不减）
 * 17. build 存在且 toolVersion 非空、builtAt 为合法时间、sourceChecksum === contentChecksum
 * 18. manifest 体积：**常驻字段口径** —— 单包 < 8 KiB 且全库 < 64 KiB。
 *     ⚠️ 口径纪律（三条，缺一即会再次漂移）：
 *       ① budget   = runtime-resident fields only —— 只统计**最终常驻主 chunk** 的字段
 *          （= manifest-runtime.mjs 的 RUNTIME_MANIFEST_FIELDS 经 projectManifest() 投影后）；
 *       ② excluded = build-time-only fields —— sources / contentHistory / build
 *          （DROPPED_MANIFEST_FIELDS）在构建期已被投影裁掉、**根本不进主 chunk**，故不计入；
 *       ③ hard limit = 64 KiB。
 *     manifest 常驻主 chunk（registry 静态 import），是「包数」的函数而不是「词数」的函数。
 *     词库从 43 词涨到 3000 词时 manifest 只该多几十字节；越过单包上限说明有人把词表/释义
 *     之类的重数据塞进了**常驻**字段 —— 那会 1:1 推高首屏。
 *     实测（2026-10-05 · 27 包）：常驻 18.07 KiB（均值 685 B/包）/ 磁盘原始 38.22 KiB
 *     （均值 1,450 B/包）⇒ 64 KiB 余量 45.93 KiB。被裁字段占原始字节的 53%。
 * 19. inline 预算：有载荷且 policy=inline 的包 Σ stats.items ≤ 1000 且 Σ 载荷 ≤ 64 KiB
 *     （实测 inline 词 1:1 全额传导进主 chunk：kaoyan 改 inline ⇒ 主 chunk +471.92 KiB，
 *      与 words.json 471.70 KiB 比值 1:1.0005，故 inline 是首屏体积的直通车，必须限量；
 *      无载荷却声明 inline 属语义矛盾，直接判红）
 * 20. 策略一致性：manifest.offline.policy 必须与 registry.ts 里该包的实际加载方式一致
 *     （inline ⇔ 静态 import 走 words:/data:；lazy ⇔ 动态 import 走 load:/loadData:）。
 *     未知策略只提示跳过，不伪造通过；无载荷包的未知策略判红（见第 1 项）
 * 21. 资产契约（P1.8-B）：包声明了非空 `assets[]` ⇒ 包级 `licenses`（非空具名表）与
 *     包级 `provenance`（含非空 provider）**必填**（⇔ 关系，见 P1.8 裁定 ④-3）。
 *     规则实现在 scripts/content/asset-rules.mjs 的 checkPackageAssetDeclarations（唯一）。
 * 22. 二进制媒体检查（P18-F · INV-4）：content/ 内不得出现二进制媒体文件（媒体一律走远程）。
 *     「url 必须远程 https」已在资产声明层由 asset-rules.mjs:117 的 checkAssetUrl() 强制（P18-B），
 *     本判据关掉**文件层缺口** —— 防「manifest 声明远程、实体却塞进仓库」的声明 ⟷ 实体脱钩绕过。
 *     双通道（裁定 ⑩-3）：① 扩展名白名单 .json/.md/.txt；② NUL 字节嗅探（前 8192 B 含 0x00
 *     即二进制，专抓改扩展名伪装）。fail-closed：遍历/读取异常 ⇒ 判 FAIL，绝不当作 0。
 * 23. 词库包许可**降级棘轮**（P20 · 词库可开源）：vocabulary 包的 license.redistributable
 *     必须为 true（当前 13/13）。⚠️ 它与第 7 项**方向相反**、不可互相替代：
 *       第 7 项判「声明是否合法」（redistributable:false 是**合法**声明 ⇒ 第 7 项判绿）；
 *       第 23 项判「声明相对现状有没有被悄悄降级」（棘轮，只许升不许降）。
 *       没有第 23 项时，「拿缺 license 段的源跑一次 scaffold-unit」会把 13 个可开源词库
 *       静默降级成 12 个，而**全仓无一门会红**。fail-closed：字段缺失/非布尔一律判红。
 *       源侧的对应防线在 scaffold-unit.mjs 判据 23（缺段即拒跑），本条是**盘侧**兜底：
 *       两者缺一不可（见下方判据 24 区块的「不是对方替代品」论证）。
 * 24. 单元源许可段 fail-closed（判据 23 的**源侧**）：读仓库内 `content-source/*.json`，
 *     「源里声明了某段内容」⇒「必须显式声明该段 license」，且 `redistributable` 必须是显式布尔。
 *     ⚠️ 源已于 2026-10-07 入库（此前在仓库外 `_ops/`，CI 无任何 step 读它 ⇒ 判据 ① 形同虚设）。
 *       fail-closed 三条：content-source/ 不存在 ⇒ 判红；空目录 ⇒ 判红；缺段 / 字段缺失 ⇒ 判红。
 * 25. 单元源 ↔ 磁盘包**一致性**（renderUnitSourceDrift）：源渲染出的包与磁盘上现有的包
 *     逐项比对（载荷 + manifest 除 build 戳外）。**独立于 CI 那步 `scaffold-unit --check`** ——
 *     ⚠️ 那一步只以「deploy.yml 里存在某个 step」的形式生效：删掉它 ⇒ 源漂移不再有任何东西会红，
 *       而判据 24 继续绿（24 只查 license 段声明，看不见词条/段落被改）。
 *       本判据把同一事实搬进**门禁本体**，与那一步共用 `unit-source-render.mjs` 的**同一实现**
 *       （不是两份），故不存在「删了 CI 那步就丢覆盖」。fail-closed：无可比对的源 ⇒ 判红。
 * 26. 单元源/内容包**三方对账**（reconcileUnitSources）：源 ↔ 包 ↔ 「谁该有源」双向核对，
 *     专抓**反方向**的洞 —— 「落了盘却忘了把源入库」（24/25 都只看已存在的源，看不见这个）。
 *     ⛔ 不维护硬编码的「预期源清单」：谁该有源由**包 id 后缀 ∈ 段表 dirSuffix** 现场派生
 *       （实测 27 个包中恰好 9 个命中；13 个词汇小包与 8 个 demo-* 全部不命中 ⇒ 零误伤）。
 * 27. 段类型**单一真源上锁**（judgeUnitTypeSingleSource）：两份子判据 ——
 *     27a 静态：validate.mjs / scaffold-unit.mjs / unit-source-render.mjs 三处**都不得**自建
 *        段类型字面量或本地重实现 `.filter` 过滤（新增第二份 ⇒ 判红）；
 *     27b 契约：唯一副本必须仍等于**手写字面真值**（段类型是面向磁盘包 id 的契约，
 *        ⛔ 不得被顺手改小 —— 实测证伪过：改小后判据 26 会把该段包**排除出对账范围而误判绿**）。
 *
 * 用法：node scripts/content/validate.mjs [--root=<内容包目录>]   → 全绿 exit 0，任一 FAIL exit 1
 *       node scripts/content/validate.mjs --falsify              → 证伪自检（隔离副本注入；
 *           七组：判据 22 二进制媒体 4 + 判据 18 manifest 常驻口径 6 + 判据 23 词库许可降级 5
 *           + 判据 24 源许可段 5 + 判据 25 源↔磁盘漂移 6 + 判据 26 三方对账 6 + 判据 27 段类型上锁 8
 *           exit 0=全过 / 1=断言失败 / 2=自身异常，同 gate-license.mjs 三态惯例）
 *       node scripts/content/validate.mjs --help                 → usage（exit 0）；未知参数 exit 2
 *       `--root` 默认 `content/`，**仅**覆盖"内容包目录"（ROOT / registry / i18n 等一律不变），
 *       用于对隔离副本做证伪（后续 scripts/gate-license.mjs 复用同一开关）。
 */
import { readdir, readFile } from 'node:fs/promises'
import { existsSync, readdirSync, readFileSync, openSync, readSync, closeSync, mkdtempSync, cpSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
/* 内容指纹**只走 license-policy.mjs 的 checksumPayload**（它内部 = canonical.mjs 的 sha256Canonical）。
 * P18-B 之前本文件自己又调了一次 sha256Canonical，是同一算法的**第二份调用点**；现与
 * `gate-license.mjs` 的 `sourceChecksum` 判据共用同一个 helper —— 消灭第二份哈希实现。 */
/* 类型白名单**只从 license-policy.mjs 取**，本文件不再自建副本 ——
 * P1.8-A 之前这里是第二份手写镜像，注释写着"任一侧增删类型时两处同改"，
 * 而实际结果就是漂移：契约把 `ContentType` 扩到 14 时，两处 Node 白名单都停在 12。
 * 现在单一副本由 gate:content-type-contract 判据 H 对着契约上锁。 */
import { CONTENT_TYPES, checksumPayload, decideLicense } from './license-policy.mjs'/* 自有内容哨兵**只从 provider-rules.mjs 取**（该文件 re-export license-policy.mjs 的 PROVIDER_ORIGINAL，
 * 后者与 src/core/content/provenance.ts 同源）—— 本文件不再写第二份 'geek-typing original' 字面量。
 * 这里只是把已有的 license 判据**换成常量引用**，语义与行为逐字不变。 */
import { PROVIDER_ORIGINAL } from './provider-rules.mjs'
/* relations 端点可达性**只从 relations.mjs 取**（P18-G0 裁定 §⑪-3）：本文件不得再有第二份实现。
 * 历史上这里是第三份（registry Map + normWords，只认 type === 'word'），与
 * gate-content-contract.mjs / ingest.mjs 的逐字复制互不同步。 */
import { buildReachability, isReachable, isValidRelationType, relationEndpoints } from './relations.mjs'
/* 资产规则**只从 asset-rules.mjs 取**（P1.8 裁定 ③/④-7）：本文件不得内联任何资产规则逻辑。
 * 资产规则的第二份副本由 gate:content-type-contract 判据 H3 上锁，与 CONTENT_TYPES 的 H1/H2 同一手法。 */
import { checkManifestAssets, checkPackageAssetDeclarations, checkLicenseDecision } from './asset-rules.mjs'
/* 单元源「可声明内容段」**只从 license-policy.mjs 取**（UNIT_SOURCE_SEGMENTS / declaredUnitSourceTypes /
 * unitPackageIdOf），本文件**不再持有第二份段类型字面量**。
 * ⛔ 此前本文件的 `UNIT_SOURCE_TYPES = ['vocabulary','reading','exercise']` 与
 *   `scaffold-unit.mjs` 的 `DECLARED_TYPES` 是**同一事实的两份字面量**，只靠注释互指维持同步：
 *   改一处忘另一处 ⇒ 判据 24（源侧逐段要求 license）与脚手架判据 ①（缺段即拒跑）口径分叉，
 *   表现为判据 24 假红或假绿，**且没有任何机器判据会发现** —— 与本仓已吃过三次的
 *   「真相同步两份」同型（ContentType 白名单 / relations 端点 / asset 规则各一次）。
 *   判据 27（H4 同构）现在把「无人自建副本」变成机器断言：`content:validate` 与
 *   `scaffold-unit.mjs` 都必须从 license-policy.mjs import。 */
import {
  UNIT_SOURCE_SEGMENTS,
  declaredUnitSourceTypes,
  unitPackageIdOf,
} from './license-policy.mjs'
/* 源 ⇄ 包的**渲染与比对**唯一实现（纯模块，无 I/O、无 CLI、无副作用）。
 * ⛔ 本文件**不得**自己重写一套渲染/比对 —— 判据 25 与 CI 的 `scaffold-unit --check`
 *   是「同一事实的两个观测点」，共用这一个实现；若各写一份，就又变成「真相同步两份」。 */
import { planUnitSource, comparePackageToDisk } from './unit-source-render.mjs'
/* 判据 18 的**常驻字段口径**只从 manifest-runtime.mjs 取（RUNTIME_MANIFEST_FIELDS / DROPPED_MANIFEST_FIELDS /
 * projectManifest），本文件**不持有第二份字段列表**。
 * ⛔ 为什么必须 import 复用而不是抄一份：判据 18 卡的是「谁进主 chunk」，而「谁进主 chunk」由构建期的
 *   投影插件（scripts/vite-plugin-manifest-runtime.mjs）决定。两份真相同步漂移过一次就判错了口径 ——
 *   本项目反复吃过「同一个真相同步两份」的亏（ContentType 白名单、relations、asset 规则各一次）。
 *   现在白名单增删字段，判据 18 的口径自动跟随，不存在「记得改两处」这回事。 */
import { RUNTIME_MANIFEST_FIELDS, DROPPED_MANIFEST_FIELDS, projectManifest } from './manifest-runtime.mjs'

const ROOT = path.resolve(process.cwd())
/** 内容包目录：默认 content/；`--root=<dir>` 可指向隔离副本（证伪用）。仅覆盖此项，其余路径不变。 */
const CONTENT_DIR = (() => {
  const args = process.argv.slice(2)
  let raw = null
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--root=')) { raw = args[i].slice('--root='.length); break }
    if (args[i] === '--root') { raw = args[i + 1] ?? null; break }
  }
  return raw === null || raw === '' ? path.join(ROOT, 'content') : path.resolve(ROOT, raw)
})()

/* —— CLI 参数校验（P18-F）：未知参数 exit 2、--help exit 0。危险脚本不得带静默默认值 ——
 *    未知 flag 一律拒绝（同 gate-license.mjs parseArgs / evidence-run 事故教训），不猜测语义。—— */
const HELP_TEXT = `用法：
  node scripts/content/validate.mjs [--root=<内容包目录>]   全绿 exit 0，任一 FAIL exit 1
  node scripts/content/validate.mjs --falsify               证伪自检（隔离副本注入，七组共 40 断言；exit 0=全过 / 1=断言失败 / 2=自身异常）
  node scripts/content/validate.mjs --help                  本帮助（exit 0）`
{
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--falsify' || a === '--help' || a.startsWith('--root=')) continue
    if (a === '--root') { i++; continue } // 空格形式：值在下一个 argv（CONTENT_DIR 解析器同语义）
    console.error(`未知参数 ${JSON.stringify(a)} —— 本脚本不接受未知 flag，也不猜测其语义\n`)
    console.error(HELP_TEXT)
    process.exit(2)
  }
  if (args.includes('--help')) { console.log(HELP_TEXT); process.exit(0) }
}
/** 第 20 项比对对象：包的「实际加载方式」只在这里定义，Node 跑不了 TS，只能扫文本 */
const REGISTRY_TS = path.join(ROOT, 'src', 'core', 'content', 'registry.ts')

/** 载荷文件名：vocabulary 包固定 words.json；其余类型统一 items.json（可选） */
const payloadNameOf = (type) => (type === 'vocabulary' ? 'words.json' : 'items.json')

/* —— 第 18/19/20 项阈值：Package = manifest（永远轻、常驻）+ words（按需） ——
 *
 * ⚠️⚠️ 第 18 项的口径纪律（yqh 裁定 · 2026-10-05）——**三条缺一即会再次口径漂移**：
 *   ① budget   = runtime-resident fields only
 *      预算只统计**最终常驻主 chunk** 的字段，即 RUNTIME_MANIFEST_FIELDS 经 projectManifest() 投影后的字节。
 *      字段清单从 manifest-runtime.mjs import，本文件不持有副本（见 import 处注释）。
 *   ② excluded = build-time-only fields（already stripped from main chunk）
 *      DROPPED_MANIFEST_FIELDS = sources / contentHistory / build —— 构建期已被投影插件裁掉，
 *      在 src/ 内零运行时读取，**根本不进主 chunk**，故不计入预算。
 *      实测三者合计占全库原始字节的 53%（39,139 B 里 20,637 B）—— 旧口径把这部分也算进去，
 *      等于为一笔**不花首屏成本**的字节收了 20.6 KiB 税。
 *   ③ hard limit = 64 KiB（65,536 B）。本轮之后**不再放宽**：不为过门禁继续放宽预算。
 *
 *   ⚠️ 这三条写在这里的原因：旧注释写「阈值按 **40 包**规模预留」，而当时实际已是 **27 包**、
 *     均值 1,450 B/包 —— 注释的世界观与增长现实脱节，余量被悄悄吃掉（1,821 B）却没人发现。
 *     **阈值注释里的「包数世界观」必须与实测同步，否则它就是下一次口径漂移的源头。**
 *     下面两行把「现在多少包 / 多少字节 / 均值 / 还能加多少包」与阈值同处一块，
 *     就是为了让下一个改阈值的人一眼看到全貌，而不是照抄一个陈旧的预留目标。 */

/** 单包 manifest **常驻字段**字节上限（口径①：projectManifest() 投影后的字节，非磁盘原始字节）。
 *  实测最大 840 B（ielts-env-02-vocab）⇒ 8 KiB 是它的 9.8× 余量。
 *  ⚠️ 8 KiB 在新口径下**仍然合适**，故本轮不动它，判断依据三条：
 *    1. **绝对余量反而更大了**：旧口径实测最大 1,968 B（8 KiB = 4.2×），新口径实测最大 840 B（9.8×）
 *       —— 换口径后这条门更松、不是更紧，说明 8 KiB 不存在「恰好卡在实测边缘」的隐患。
 *    2. **它的职责没变**：抓的是「有人把词表/释义之类重数据塞进 manifest」。这类数据无论新旧口径
 *       都落在常驻字段里，8 KiB 对「常驻字段被撑大」仍有 9.8× 的 catching 能力。
 *    3. **降档会削弱它**：若按新实测均值 685 B 反推「留 5× 余量」把上限压到约 3.4 KiB，等于把阈值
 *       钉死在当前内容形态上 —— 任何一段合法的长 description 都会把门打红，而门红原因与体积失控无关。
 *       8 KiB 是「manifest 只装元数据」这条**语义边界**，不是当前实测值的函数。
 *  ⇒ 结论：**保持 8 KiB 不变**，仅统计口径由「磁盘原始字节」改为「常驻字段字节」。 */
const MANIFEST_MAX_BYTES = 8 * 1024
/** 全库 manifest **常驻字段**字节总和上限（口径 ①②③）。
 *  实测（2026-10-05 · **27 包**）：常驻 18,502 B = 18.07 KiB，均值 **685 B/包**
 *  ⇒ 余量 65,536 − 18,502 = **47,034 B**；按均值可再加约 **68 包**（约 22 套三包单元）。
 *  ⚠️ 旧的「阈值按 40 包规模预留」是**过期值**，已随本次口径修正一并作废（见上方口径纪律 ③）。 */
const MANIFEST_TOTAL_MAX_BYTES = 64 * 1024
/** inline 包词条数上限。实测 7 包 346 词 */
const INLINE_MAX_ITEMS = 1000
/** inline 包 words.json 字节上限。实测 7 包 36.17 KiB */
const INLINE_MAX_BYTES = 64 * 1024
/** 已知可判定的策略；其余（runtime / on-demand 等）只提示跳过，不判通过也不判失败 */
const KNOWN_POLICIES = new Set(['inline', 'lazy'])

const kib = (b) => (b / 1024).toFixed(2)

/**
 * 第 20 项：从 registry.ts 文本里解析某个包的实际加载方式。
 * 先定位 `localId: '<id>'`，再在该注册对象块内找 `words:`/`data:`（静态 import ⇒ inline）
 * 或 `load:`/`loadData:`（动态 import ⇒ lazy）。
 * 注意：registry 里可能存在「已声明但未被注册项使用」的 `<id>Words` 静态 import（死代码），
 * 只扫 import 段会把 lazy 包误判成 inline，故必须以注册对象块为准。
 */
function registryLoadMode(src, id) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`\\{[^{}]*localId:\\s*['"\`]${esc}['"\`][^{}]*\\}`, 'g')
  const hits = [...src.matchAll(re)]
  if (hits.length === 0) return { mode: 'missing' }
  if (hits.length > 1) return { mode: 'ambiguous', count: hits.length }
  const block = hits[0][0]
  const hasWords = /\b(?:words|data)\s*:/.test(block)
  const hasLoad = /\bload(?:Data)?\s*:/.test(block)
  if (hasWords && hasLoad) return { mode: 'conflict' }
  if (hasWords) return { mode: 'inline' }
  if (hasLoad) return { mode: 'lazy' }
  return { mode: 'unknown' }
}

const REQUIRED_FIELDS = ['id', 'type', 'version', 'title', 'description', 'language', 'tags', 'icon', 'features', 'stats', 'sources', 'offline']

/** manifest 结构版本，须与 content:build 的 SCHEMA_VERSION 一致（结构破坏性变更时才递增） */
const SCHEMA_VERSION = 4

/** 重复检测 key：NFC + lowercase + 空白折叠（含 \u00A0）。
 *  与第 4 项（精确词形）互补：大小写 / 空格差异在这里会撞车。 */
const WS_RE = /[\s\u00A0]+/g
const normKey = (raw) => String(raw ?? '').normalize('NFC').toLowerCase().replace(WS_RE, ' ').trim()

/** 端点 ContentId 解析：content:<type>:<namespace>:<localId> */
const CONTENT_ID_RE = /^content:([a-z]+):([a-z0-9-]+):(.+)$/

/* ===== 22. 二进制媒体检查（P18-F · INV-4）判据本体 =====
 * 双通道（裁定 ⑩-3）：① 扩展名白名单（.json/.md/.txt）—— 抓任何媒体扩展；
 * ② NUL 字节嗅探（读前 8192 B，含 0x00 即二进制）—— 专抓「改扩展名伪装」的二进制。
 * 抽成独立函数供 main() 与 --falsify 共用同一条实现 —— 证伪跑的不是"另一份逻辑"。
 * fail-closed：任何遍历/读取异常 ⇒ error 置为异常消息，主流程判 FAIL，绝不当作 0。 */
const BINARY_MEDIA_WHITELIST = new Set(['.json', '.md', '.txt'])
/** NUL 嗅探只读文件头部，不整文件读入（大文件也不拖慢门禁） */
const NUL_SNIFF_BYTES = 8192

function checkBinaryMedia(dir) {
  const offenders = []
  let scanned = 0
  try {
    const walk = (d) => {
      for (const ent of readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, ent.name)
        if (ent.isDirectory()) { walk(full); continue }
        scanned++
        const rel = path.relative(dir, full).split(path.sep).join('/')
        const ext = path.extname(ent.name).toLowerCase()
        // 通道 1：扩展名白名单。两类 why 互斥（扩展名已越界就不再嗅探），断言好归因
        if (!BINARY_MEDIA_WHITELIST.has(ext)) { offenders.push({ rel, why: 'ext' }); continue }
        // 通道 2：NUL 字节嗅探 —— 白名单扩展名也可能藏着二进制实体（改扩展名伪装）
        let fd = null
        try {
          fd = openSync(full, 'r')
          const buf = Buffer.alloc(NUL_SNIFF_BYTES)
          const n = readSync(fd, buf, 0, NUL_SNIFF_BYTES, 0)
          if (buf.subarray(0, n).includes(0)) offenders.push({ rel, why: 'nul' })
        } finally {
          if (fd !== null) closeSync(fd)
        }
      }
    }
    walk(dir)
    return { scanned, offenders, error: null }
  } catch (e) {
    return { scanned, offenders, error: e.message } // fail-closed：error 非空 ⇒ 主流程判 FAIL
  }
}

/* ===== 18. manifest 体积判定内核（main() 与 --falsify 共用**同一条实现**）=====
 * 口径 = **只统计常驻主 chunk 的字段**（projectManifest 投影后字节，口径①）。
 * excluded = sources / contentHistory / build（构建期已裁、不进主 chunk，口径②）。
 * hard limit = 64 KiB 全库 / 8 KiB 单包（口径③）。
 * ⚠️ 抽成独立函数是判据 18 证伪自检的前提：证伪跑的不是"另一份逻辑"。
 *   —— 若 main() 内联判定、falsify() 再抄一份，两份判定会各自漂移，证伪就证了个假的。 */
function judgeManifestSize(entries) {
  const runtimeTotal = entries.reduce((a, s) => a + s.runtimeBytes, 0)
  const rawTotal = entries.reduce((a, s) => a + s.rawBytes, 0)
  const excludedBytes = rawTotal - runtimeTotal
  const biggest = entries.reduce((a, s) => (a === null || s.runtimeBytes > a.runtimeBytes ? s : a), null)
  const over = entries.filter((s) => s.runtimeBytes >= MANIFEST_MAX_BYTES)
  const dual = `常驻 ${runtimeTotal} B（${kib(runtimeTotal)} KiB，判定口径） / 磁盘原始 ${rawTotal} B（${kib(rawTotal)} KiB，仅对照）；差额 ${excludedBytes} B 来自构建期专用字段 ${DROPPED_MANIFEST_FIELDS.join('/')}（已在构建期裁掉、不进主 chunk，故不计预算）`
  let verdict = 'PASS'
  let message = null
  if (over.length > 0) {
    verdict = 'FAIL'
    message = `manifest 单包常驻体积越界 ${over.length} 个（须 < ${MANIFEST_MAX_BYTES} B）：${over.map((s) => `${s.id} 常驻 ${s.runtimeBytes} B（${kib(s.runtimeBytes)} KiB）`).join('；')} ⇒ 常驻字段被撑大，1:1 进主 chunk。全库：${dual}`
  } else if (runtimeTotal >= MANIFEST_TOTAL_MAX_BYTES) {
    verdict = 'FAIL'
    message = `manifest 全库常驻体积越界：${runtimeTotal} B（${kib(runtimeTotal)} KiB）≥ ${MANIFEST_TOTAL_MAX_BYTES} B（${MANIFEST_TOTAL_MAX_BYTES / 1024} KiB）⇒ 常驻字段 1:1 进主 chunk，总和膨胀直接推高首屏。全库：${dual}`
  } else {
    message = `manifest 体积（常驻口径 · 最大 ${kib(biggest.runtimeBytes)} KiB「${biggest.id}」，全库 ${kib(runtimeTotal)}/${MANIFEST_MAX_BYTES / 1024}·${MANIFEST_TOTAL_MAX_BYTES / 1024} KiB，余量 ${MANIFEST_TOTAL_MAX_BYTES - runtimeTotal} B）：${dual}；被裁字段清单 ${DROPPED_MANIFEST_FIELDS.length} 项、常驻字段清单 ${RUNTIME_MANIFEST_FIELDS.length} 项（均自 manifest-runtime.mjs 单一事实源 import）`
  }
  return { verdict, message, runtimeTotal, rawTotal, excludedBytes, biggest, over }
}

/* ===== 判据 23 · 词库包许可**降级棘轮**（P20：词库可开源）=====
 * ⚠️ 为什么这条判据**不能省**（它治的是一个已经真实发生过的静默故障）：
 *   `scaffold-unit.mjs:DEFAULT_LICENSE` 是 `redistributable: false`，而三套单元源的
 *   `license` 段一度**整段缺失** ⇒ 任何人拿现成源跑一次脚手架，vocab 包就从
 *   `MIT License | redistributable: true` 变成 `redistributable: false`，
 *   **13 个可开源词库掉到 12 个，而没有任何门会红** ——
 *   因为 `gate:license`（INV-5）判的是「声明了什么」（结构化 + SPDX + 决策矩阵），
 *   `redistributable: false` 是一个**完全合法**的声明 ⇒ 合法地判绿。
 *   这就是本项目反复吃过的那类病：**门只校验「现状合法」，不校验「不该悄悄变」**。
 *
 * 判据形态：**棘轮（只许升不许降）**。词库包当前 13/13 全部 `redistributable: true`，
 *   任何 vocabulary 包出现 `redistributable !== true` ⇒ 判红，并点名是哪个包、哪个字段。
 *   选「棘轮」而不是「逐字节等于 MIT」的原因：
 *     · 未来若合法地把某个词库整体转专有，**必须同时改这条判据**（改代码 = 进review、留痕），
 *       而不是靠「重跑一次脚手架」就静默生效 —— 那正是本次要治的病。
 *     · 它对**非词库类型**（reading/exercise 合法为 false）完全不敏感，不会造假红。
 *   ⚠️ fail-closed：读不到 license / 字段缺失 / 非布尔，一律判红（「没写」是 UNKNOWN，
 *     不是「允许」，与 license-policy.mjs:159 同一口径）。
 *
 * 抽成独立函数供 main() 与 --falsify 共用同一条实现 —— 证伪跑的不是「另一份逻辑」。 */
function judgeVocabLicenseRedistributable(entries) {
  const bad = []
  for (const e of entries) {
    if (e.redistributable !== true) {
      bad.push(`${e.id} license.redistributable=${JSON.stringify(e.redistributable ?? null)}`
        + `（name=${JSON.stringify(e.name ?? null)}${e.spdx ? '' : '，spdx 缺失'}）`)
    }
  }
  if (bad.length > 0) {
    return {
      verdict: 'FAIL',
      message: `词库包许可降级 ${bad.length} 个（判据 23 棘轮：13 个可开源词库不得因重跑脚手架掉到 12 个）：${bad.join('；')}`
        + ` ⇒ 「重跑一次 scaffold-unit」不是无害操作：缺 license 段会静默回落成 redistributable:false，`
        + `而这样的声明在 gate:license 眼里完全合法。修法= 给源的对应段补显式 license（fail-closed）。`,
    }
  }
  return {
    verdict: 'PASS',
    message: `词库包许可棘轮（${entries.length} 个 vocabulary 包全部 redistributable: true；判据 23 棘轮只拦降级，不拦合法升级）`,
  }
}

/* ===== 判据 24 · 单元源许可段 fail-closed（判据 23 的**源侧**，现在真的在 CI 里）=====
 * ⚠️ 为什么判据 23 单独存在时，本条是**覆盖不到的**（这是 04a5937 之后的真实状态）：
 *   判据 23 守的是**盘侧**（包 manifest 上的 license 字段）。它拦得住「已经落盘的降级」，
 *   拦不住「源本身缺 license 段」—— 后者只在有人手动跑 `content:scaffold-unit` 时才暴露，
 *   而 CI 的任何 step 都不读 `_ops/`，于是**判据 ①（源侧 fail-closed）在 CI 里形同虚设**。
 *   本条把源纳入仓库（`content-source/`）后，那条「源里声明了某段内容 ⇒ 必须显式声明该段 license」
 *   才第一次变成 PR 阶段就会红的东西。
 *
 * 与判据 23 的关系：**同一条规则的两个观测点，缺一不可**，且都不是对方的替代品。
 *   · 判据 23（盘）：包 manifest 的 license.redistributable 不得被降级（棘轮）。
 *   · 判据 24（源）：源文件对**每个已声明内容段**都必须显式声明 license（缺段即红）。
 *   只有 24 没有 23：源合规但盘上已被手改降级 ⇒ 漏。
 *   只有 23 没有 24：盘是对的，但「下一次跑脚手架就会降级」这个**定时炸弹**没人看见 ⇒ 漏。
 *
 * ⛔ **fail-closed 的三条口径**（都来自 license-policy.mjs 的既有约定，本条不自创）：
 *   ① `content-source/` 目录不存在 ⇒ 判红（不是「没有源就跳过」）——
 *      「源没入库」正是本条要治的病，把它判绿等于把病当药。
 *   ② 源里声明了某段内容却没给该段 license ⇒ 判红（沿用判据 ① 在 scaffold-unit.mjs 的口径：
 *      按**实际声明了哪几段**逐段要求，不要求「三段全给」，否则只给 vocabulary 的合法小源被假红）。
 *   ③ license 段的 `redistributable` 缺失/非布尔 ⇒ 判红（与 license-policy.mjs:159 逐字同口径：
 *      「没写」是 UNKNOWN，不是允许）。
 *
 * 校验规则本身**不重造**：结构化 license 的合法性判定走 license-policy.mjs 的 decideLicense（唯一实现），
 * 本判据只做「段是否缺失 + 该段能否被 decideLicense 接受」这两件事，避免第二份规则副本漂化。
 *
 * ⚠️ 「源里可声明哪几段」由 `declaredUnitSourceTypes()`（license-policy.mjs 的唯一实现）回答，
 *   本文件**不再持有 `['vocabulary','reading','exercise']` 字面量**（判据 27 上锁）。 */

/**
 * 判定单个源文件的许可段声明。返回 problems[]（空数组 = 判绿）。
 * 抽成独立纯函数：main() 与 --falsify 共用同一条实现，证伪跑的不是「另一份逻辑」。
 * @param {unknown} src 解析后的源对象
 * @param {string} fileName 用于判红消息定位
 * @param {ReadonlyArray<{type: string}>} segments 段表；默认取唯一副本，**仅证伪注入时**传变异表
 */
export function judgeUnitSourceLicense(src, fileName = '(source)', segments = UNIT_SOURCE_SEGMENTS) {
  const problems = []
  if (src === null || typeof src !== 'object' || Array.isArray(src)) {
    return [`${fileName}: 顶层不是 JSON 对象（无法判定许可段）`]
  }
  // 实际声明了哪几段内容（缺哪段就不建哪个包 ⇒ 只对已声明的段要求许可）
  // ⚠️ 唯一实现（license-policy.mjs）；`segments` 参数**仅供证伪注入**（传变异段表验证判据会咬）
  const declared = declaredUnitSourceTypes(src, segments)
  if (declared.length === 0) {
    problems.push(`${fileName}: vocabulary / reading / exercise 一段都没声明 —— 这不是一个可用的单元源`)
  }
  if (src.license !== undefined && src.license !== null && (typeof src.license !== 'object' || Array.isArray(src.license))) {
    problems.push(`${fileName}: license 段必须是对象（实得 ${Array.isArray(src.license) ? 'array' : typeof src.license}）`)
    return problems
  }
  for (const type of declared) {
    const seg = src.license?.[type]
    // ① 缺段即红 —— 与 scaffold-unit.mjs 判据 ① 逐字同口径
    if (!seg || typeof seg !== 'object' || Array.isArray(seg)) {
      problems.push(
        `${fileName}: license.${type} 缺段（本源声明了 ${type} 内容）—— 「缺失」≠ 默认允许：`
        + `缺段会让 scaffold-unit 静默回落成 redistributable:false，把该包从可再分发降级为不可再分发`,
      )
      continue
    }
    // ② 第三维必须显式且为布尔（字段缺失同样不算声明）—— 与 license-policy.mjs:159 同口径
    if (typeof seg.redistributable !== 'boolean') {
      problems.push(
        `${fileName}: license.${type}.redistributable=${JSON.stringify(seg.redistributable ?? null)} 不是布尔值`
        + `（字段缺失同样不算声明）—— UNKNOWN ≠ 允许`,
      )
    }
    // ③ 合法性判定交给唯一实现 decideLicense（不自建 SPDX 矩阵）
    const decision = decideLicense({ provider: PROVIDER_ORIGINAL, license: seg })
    if (decision.decision === 'rejected') {
      problems.push(`${fileName}: license.${type} 被 license-policy 判定 rejected（${decision.reason}）`)
    }
  }
  return problems
}

/**
 * 扫描 content-source/ 下全部源并汇总。返回 { total, problems, files }。
 * ⚠️ 目录不存在 ⇒ 判红（fail-closed ①）：「源没入库」本身就是本判据要治的病。
 */
export function checkUnitSources(dir = path.join(ROOT, 'content-source')) {
  const problems = []
  if (!existsSync(dir)) {
    return {
      total: 0,
      files: [],
      problems: [
        `content-source/ 不存在（${dir}）—— 单元源必须入库：判据 ①（源缺 license 段即拒跑）`
        + `只有源在仓库里才能在 PR 阶段判红；源在仓库外时 CI 无任何 step 会读它，判据 ① 形同虚设`,
      ],
    }
  }
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name)
    .sort()
  if (files.length === 0) {
    return { total: 0, files, problems: [`content-source/ 下没有任何 .json 源文件（${dir}）—— 空目录同样判红（fail-closed：没有源可校验 ≠ 校验通过）`] }
  }
  for (const name of files) {
    const abs = path.join(dir, name)
    let obj
    try {
      obj = JSON.parse(readFileSync(abs, 'utf8'))
    } catch (e) {
      problems.push(`${name}: 不可解析为 JSON（${e.message}）`)
      continue
    }
    problems.push(...judgeUnitSourceLicense(obj, name))
  }
  return { total: files.length, files, problems }
}

/* ===== 判据 25 · 源 ↔ 磁盘一致性（**独立于 CI 那步 `--check`**）=====
 *
 * ## 它补的是哪个洞
 * 判据 24 只查 license 段声明。源里的**词条 / 段落 / 题目**被改、或磁盘上的包被手改，
 * 24 全都看不见 —— 那由 2026-10-07 加进 CI 的 `scaffold-unit --check` 那一步负责。
 * ⛔ **但那一步的失效形态是「静默」的**：它只以「deploy.yml 里存在某个 step」的形式生效。
 *   有人删掉/改名/挪走那一步 ⇒ 源与盘对不上这件事**不再有任何东西会红**，
 *   而判据 24 继续绿、常规 `content:validate` 继续 PASS、CI 全绿 —— 一道门被摘掉却无人察觉。
 *   本判据把同一事实搬进**门禁本体**，使「源漂移 ⇒ 判红」不再依赖 CI YAML 里某一行存在。
 *
 * ## 与 `--check` 那一步的关系（**同一事实，两个观测点，一份实现**）
 *   · 事实：「入库的源能否还原磁盘上现有的包」—— 只有一个事实。
 *   · 观测点 1 = CI 的 `scaffold-unit --check` 那一步（人可读输出、逐条 ✓/✗）。
 *   · 观测点 2 = 本判据（门禁内、机器可读、与其它判据同一份 FAIL 汇总）。
 *   · **实现只有一份**：`unit-source-render.mjs` 的 `planUnitSource()` + `comparePackageToDisk()`。
 *     脚手架与本判据都调它，⛔ 本文件**不得**自己重写一套渲染/比对（那才是「真相同步两份」）。
 *   · 两个观测点都保留：CI 那步给出可读逐条输出，本判据保证「删掉那步也不丢覆盖」。
 *     ⛔ 本轮**不删** CI 那一步（它是给人看的，且证伪里要引用它的口径）。
 *
 * ## fail-closed（本判据最容易假绿的地方）
 *   「没有可比对的源」**不是跳过，是判红**，沿用判据 24 已有的口径（目录不存在 ⇒ 红、空目录 ⇒ 红）。
 *   若这里 fail-open，「源没入库 / 源目录空」就会退化成「跳过比对」= 假绿 —— 而那正是本判据要治的病。
 *
 * ## 性能与耦合
 *   · ⛔ **不 spawn 子进程**（本机 safe-delete/shim 下 spawn 会 EBUSY，且门禁里 spawn 生成器是更大的坑）：
 *     直接 `readFileSync` 读盘 + 调既有纯函数（`checksumPayload` / `canonicalFile` 都在共享实现里）。
 *   · 规模 = 3 源 × 3 包 = 9 次「渲染 + 读两个文件 + 比对」，纯内存，毫秒级（实测见下方 ok() 行）。
 */
export function checkUnitSourceDrift(sourceDir = path.join(ROOT, 'content-source'), contentDir = CONTENT_DIR) {
  const problems = []
  if (!existsSync(sourceDir)) {
    return { total: 0, packages: 0, problems: [`content-source/ 不存在（${sourceDir}）—— 无源可比对（fail-closed：不是「跳过」，是判红）`] }
  }
  const names = readdirSync(sourceDir).filter((n) => n.endsWith('.json')).sort()
  if (names.length === 0) {
    return { total: 0, packages: 0, problems: [`content-source/ 下没有任何 .json 源（${sourceDir}）—— 无源可比对（fail-closed）`] }
  }
  const readText = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null)
  let pkgCount = 0
  for (const name of names) {
    const abs = path.join(sourceDir, name)
    let src
    try {
      src = JSON.parse(readFileSync(abs, 'utf8'))
    } catch {
      // 解析失败由判据 24 报（同一份源、同一类问题），此处不重复报，只跳过本源的漂移比对
      continue
    }
    if (src === null || typeof src !== 'object' || Array.isArray(src)) continue
    const { packages } = planUnitSource(src, { outRoot: contentDir })
    for (const pkg of packages) {
      pkgCount++
      const cmp = comparePackageToDisk(pkg, readText)
      if (!cmp.payload.exists) {
        problems.push(`${name}: 载荷不存在：${pkg.relPayloadPath}（源声明了 ${pkg.type} 内容 ⇒ 该包必须在磁盘上）`)
        continue
      }
      if (!cmp.payload.ok) {
        problems.push(`${name}: 载荷与源不一致（${cmp.payload.how}）：${pkg.relPayloadPath}`
          + ` —— 词条/段落被改动而源未同步（内容漂移）。⛔ 不要改 content/ 去迁就源：先判断谁错了`)
      }
      if (!cmp.manifest.exists) {
        problems.push(`${name}: manifest 不存在：${pkg.relManifestPath}`)
        continue
      }
      if (!cmp.manifest.ok) {
        problems.push(`${name}: manifest 与源不一致（除 build 戳外）：${pkg.relManifestPath} —— ${cmp.manifest.diffs.slice(0, 4).join('；')}`)
      }
    }
  }
  if (pkgCount === 0) {
    problems.push(`content-source/ 的 ${names.length} 个源都渲染不出任何包 —— 无可比对对象（fail-closed）`)
  }
  return { total: names.length, packages: pkgCount, problems }
}

/* ===== 判据 26 · 三方对账：源 ↔ 包 ↔ 「谁该有源」（抓「该有源而没有」）=====
 *
 * ## 它补的是哪个洞
 * 判据 24 只扫 `content-source/` 里**已有**的文件；判据 25 也只从源出发去磁盘上找包。
 * ⇒ 两者的共同盲区是**反方向**：将来做 Unit-04 的人落了盘、却忘了把源入库，
 *   那么 `content/vocabulary/ielts-xxx-04-vocab/` 已经在仓库里、而 `content-source/` 没有对应源 ——
 *   24 看不见（它只看已存在的源）、25 也看不见（它只从源出发），
 *   于是「这个包是由哪个源生成的」变成**不可知**，下次跑脚手架的人无从复现它。
 *
 * ## ⛔ 为什么**不维护一份硬编码的「预期源清单」**
 *   清单本身就是新的漂移源：加包要记得改清单，忘了又是一道新病，且这份清单没有任何东西能验证它对不对。
 *   ⇒ 本判据改为**从磁盘与段表派生**「谁该有源」，派生规则只有一条：
 *       「包 id 形如 `<prefix><dirSuffix>`，且 `<dirSuffix>` ∈ UNIT_SOURCE_SEGMENTS[].dirSuffix」
 *   其中 dirSuffix 来自**唯一副本**（license-policy.mjs），不是手写清单。
 *   ⚠️ 这条派生规则在本仓**实测无假阳性**：27 个包里恰好 9 个命中
 *     （ielts-{edu-01,env-02,tech-03} × {vocab,reading,exercise}），
 *     13 个词汇小包（ai-core/cet4/kaoyan/…）与 8 个 demo-* **全部不命中**
 *     （它们的后缀是 `core`/`4`/`01` 之类，不在段表的三个 dirSuffix 里）。
 *   ⇒ 「只覆盖有源的那些包」这条要求由**命名派生**满足，不需要人工维护任何名单。
 *
 * ## 覆盖不到的场景（如实说明）
 *   若将来有人**手工**造一个恰好叫 `xxx-vocab` 的非脚手架包，它会被判成「该有源而没有」。
 *   这是本判据**已知且刻意接受**的假阳性面：宁可多问一句「这个包由哪个源生成」，
 *   也不要让「无源的脚手架形态包」静默存在（那会让复现链断掉且无人知晓）。
 *   真要豁免，正确做法是**改包名**（不要在判据里加白名单 —— 白名单就是那份被禁止的人工清单）。
 */
export function reconcileUnitSources(sourceDir = path.join(ROOT, 'content-source'), contentDir = CONTENT_DIR, segments = UNIT_SOURCE_SEGMENTS) {
  const problems = []
  const notes = []
  if (!existsSync(sourceDir)) {
    return { sources: 0, packages: 0, problems: [`content-source/ 不存在（${sourceDir}）—— 三方对账无法进行（fail-closed）`], notes }
  }
  const names = readdirSync(sourceDir).filter((n) => n.endsWith('.json')).sort()

  // 源侧：prefix → 该前缀下应当存在的 {type: packageId}（由段表派生，非人工清单）
  /** @type {Map<string, Map<string, string>>} */
  const expectedByPrefix = new Map()
  for (const name of names) {
    let src
    try {
      src = JSON.parse(readFileSync(path.join(sourceDir, name), 'utf8'))
    } catch {
      continue // 解析失败由判据 24 报，不在对账里重复
    }
    if (src === null || typeof src !== 'object' || Array.isArray(src)) continue
    const prefix = src.packagePrefix
    if (typeof prefix !== 'string' || prefix === '') continue
    if (!expectedByPrefix.has(prefix)) expectedByPrefix.set(prefix, new Map())
    const m = expectedByPrefix.get(prefix)
    for (const type of declaredUnitSourceTypes(src, segments)) {
      m.set(type, unitPackageIdOf(prefix, type))
    }
  }

  // 盘侧：按包目录名反推「它声称自己属于哪个前缀的哪一段」
  // ⚠️ dirSuffix 取自**注入的同一张段表**（证伪会传变异表）—— 若这里硬编码用唯一副本，
  //   那么「把唯一副本改少一段」就只会影响源侧、不影响盘侧识别，证伪注入就验不到「分叉」了。
  const suffixToType = new Map(segments.map((s) => [s.dirSuffix, s.type]))
  /** @type {Map<string, {type: string, packageId: string}[]>} */
  const diskByPrefix = new Map()
  for (const type of readdirSync(contentDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    if (!CONTENT_TYPES.has(type)) continue
    for (const id of readdirSync(path.join(contentDir, type), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
      // 反向解析包 id：取最长匹配的 dirSuffix（'vocab' 与 'reading' 无包含关系，但保持稳健）
      let hit = null
      for (const suffix of [...suffixToType.keys()].sort((a, b) => b.length - a.length)) {
        if (id.endsWith(`-${suffix}`)) { hit = { suffix, type: suffixToType.get(suffix) }; break }
      }
      if (!hit) continue // 不是脚手架形态 ⇒ 不参与对账（13 个词汇小包 / 8 个 demo-* 走这条）
      const prefix = id.slice(0, -(hit.suffix.length + 1))
      if (!diskByPrefix.has(prefix)) diskByPrefix.set(prefix, [])
      diskByPrefix.get(prefix).push({ type: hit.type, packageId: id })
    }
  }

  // 方向①：源 ⇒ 盘（源声明的段，磁盘上必须有对应包）
  for (const [prefix, m] of expectedByPrefix) {
    for (const [type, pkgId] of m) {
      if (!existsSync(path.join(contentDir, type, pkgId))) {
        problems.push(`源声明了 ${prefix} 的 ${type} 内容，但磁盘上没有 ${type}/${pkgId}/ —— 落盘与源不一致（判据 25 会同时报载荷不存在）`)
      }
    }
  }
  // 方向②：盘 ⇒ 源（脚手架形态的包，必须能追溯到一个源）—— 这条抓「该有源而没有」
  for (const [prefix, pkgs] of diskByPrefix) {
    const m = expectedByPrefix.get(prefix)
    for (const { type, packageId } of pkgs) {
      if (!m) {
        problems.push(`${type}/${packageId}/ 形如单元脚手架产物（包 id 后缀来自 UNIT_SOURCE_SEGMENTS），`
          + `但 content-source/ 里没有 packagePrefix="${prefix}" 的源 —— 该包无源、不可复现。`
          + `修法 = 把生成它的源入库到 content-source/（⛔ 不是在本判据里加白名单）`)
        continue
      }
      if (!m.has(type)) {
        problems.push(`${type}/${packageId}/ 存在，但前缀 "${prefix}" 的源没有声明 ${type} 段 —— 盘比源多出一个段（二者已分叉）`)
      }
    }
  }
  notes.push(`参与对账的脚手架形态包 ${[...diskByPrefix.values()].reduce((n, v) => n + v.length, 0)} 个 / 前缀 ${diskByPrefix.size} 个；`
    + `非脚手架包（后缀不在段表 dirSuffix 里）不参与，⛔ 不需要人工维护名单`)
  return { sources: names.length, packages: [...diskByPrefix.values()].reduce((n, v) => n + v.length, 0), problems, notes }
}

/* ===== 判据 27 · 段类型单一真源**上锁**（静态：无人自建副本）=====
 *
 * ## 它锁的是什么
 * 「源里可声明哪几段」这件事，本仓库一度是**两份字面量**：
 *   · `validate.mjs` 的 `UNIT_SOURCE_TYPES = ['vocabulary','reading','exercise']`
 *   · `scaffold-unit.mjs` 的 `DECLARED_TYPES = ['vocabulary','reading','exercise'].filter(...)`
 * 两者只靠**注释互指**维持同步。改一处忘另一处 ⇒ 判据 24（源侧逐段要求 license）与
 * 脚手架判据 ①（缺段即拒跑）**口径分叉**，表现为判据 24 假红或假绿，
 * 而**没有任何机器判据会发现**（两处各自都「合法」）。这与本仓已吃过三次的
 * 「真相同步两份」同型（ContentType 白名单、relations 端点、asset 规则）。
 *
 * 现在两份字面量都已删除，事实住在 `license-policy.mjs` 的 `UNIT_SOURCE_SEGMENTS`，
 * 两侧都 import。本判据把这个「不许自建副本」变成**机器断言**（同 gate:content-type-contract 判据 H2 手法）。
 *
 * ## 为什么静态扫描是**必要**而非多余的
 * 动态行为判据（24/25/26）证明「当前口径一致」，但**证不了**「没人偷偷再写一份字面量」——
 * 有人在本文件里加回 `const UNIT_SOURCE_TYPES = ['vocabulary','reading']` 并**只**用它做某处判断，
 * 动态判据仍可能全绿。故必须静态断言「这两个文件都不含段类型字面量」。
 *
 * ## ⛔ 本判据**只**能证明「无人自建副本」，不能证明「副本内容相同」
 * 若两份副本内容恰好一致，静态扫描抓不到（它只认「有没有第二份」）。
 * 这是本条判据**明确的覆盖边界**，如实记录：它防的是「新增第二份」，
 * 而两份内容恰好相同的那种漂移概率极低（且会被 24/25/26 的行为判据间接暴露）。
 */
export function judgeUnitTypeSingleSource(segments = UNIT_SOURCE_SEGMENTS) {
  const problems = []
  const targets = [
    { rel: 'scripts/content/validate.mjs' },
    { rel: 'scripts/content/scaffold-unit.mjs' },
    { rel: 'scripts/content/unit-source-render.mjs' },
  ]
  /* ---------- 27a · 无人自建第二份 ---------- */
  /* ⚠️ **检测用的模式必须由唯一副本现场拼出来**，⛔ 不得在源码里再写一次三段名字面量。
   *   否则本判据会**检出它自己的正则字面量**（首次实现即实测命中，见下）——
   *   那是「prover 证明自己」的经典自指假阳性，会让判据 27 恒红、形同虚设。
   *   派生还有一个附带好处：段表若改名/增删，本判据的检测口径**自动跟随**，不会漂移。 */
  const quoted = segments.map((s) => `['"]${s.type}['"]`).join('[^\\]]*')
  /** 命中即「自建副本」：把三个段名同时写进一个数组字面量（无论有无 const 关键字）。 */
  const literalRe = new RegExp('\\[[^\\]]*' + quoted + '[^\\]]*\\]')
  /** 命中即「本地重新实现 declaredUnitSourceTypes」（等价于又抄了一份过滤逻辑）。 */
  const firstIsSegment = '\\[(?:' + segments.map((s) => `['"]${s.type}['"]`).join('|') + ')'
  const localFilterRe = new RegExp(firstIsSegment + '(?:[^\\]]*)\\]\\s*\\.filter\\s*\\(')
  for (const t of targets) {
    const abs = path.join(ROOT, t.rel)
    let src
    try {
      src = readFileSync(abs, 'utf8')
    } catch (e) {
      problems.push(`${t.rel}: 读不到（${e.message}）—— 判据 27 无法证明「无人自建副本」，fail-closed 判红`)
      continue
    }
    // 注释里的说明文字允许提到三个段名（那是给人读的），故先把注释剥掉再扫
    const codeOnly = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    if (literalRe.test(codeOnly)) {
      problems.push(`${t.rel}: 检出**段类型字面量**（三个段名同时出现在一个数组里）—— `
        + `段类型只允许一份（license-policy.mjs 的 UNIT_SOURCE_SEGMENTS），请改为 import declaredUnitSourceTypes()`)
    }
    if (localFilterRe.test(codeOnly)) {
      problems.push(`${t.rel}: 检出**本地 .filter 过滤段类型**—— 与 declaredUnitSourceTypes() 等价，请直接调用唯一实现`)
    }
  }

  /* ---------- 27b · 唯一副本**自身**必须仍等于手写字面真值 ---------- */
  /* ⚠️ **为什么 27a 不够**：27a 只保证「只有一份」，不保证「这一份是对的」。
   *   本轮证伪实测到这个真实假绿：`--falsify` 把唯一副本改少一段（去掉 exercise）后，
   *   判据 26 判**绿**（problems=0）—— 因为 `-exercise` 包在改小后的段表里**不再匹配任何
   *   dirSuffix**，于是被当成「非脚手架包」**排除出对账范围**。
   *   ⇒ 段表一缩小，判据 26 就对其余下的段「失明」，而门依然全绿。
   *   这正是本仓反复吃过的那类病：**门只校验「现状合法」，不校验「不该悄悄变」**。
   *
   *   修法 = 手写字面真值（与 `gate:content-type-contract` 判据 H3 的语料真值同一手法）：
   *   段表是**面向内容形态的契约**（磁盘上真实存在 9 个包的 id 就长这样），
   *   它不该被任何一次「顺手清理」改动。三条独立来源对齐：真值 == 唯一副本 == 磁盘实况。
   *
   *   ⛔ 这份真值**不是**「预期源清单」：它锁的是**段类型这个词表**（3 个词），
   *      而判据 26 要避免的是「每个单元一份的源清单」（每加一个单元就要改）。
   *      加第 4 个单元**不需要动它**；只有「新增/删除一种内容段形态」这种真正的契约变更才该动它 ——
   *      而那正是**应该被 review 拦一下**的改动。
   *   ⛔ 真值刻意**手写**而非 import：import 的话它就随唯一副本一起变，永远相等 ⇒ 恒真门。 */
  /* ⚠️ 这三行是**手写字面真值**，刻意拆成三个独立语句（而不是一个数组字面量）：
   *   27a 的检测口径会扫「三个段名同时出现在一个 `[...]` 数组字面量里」。
   *   若真值写成 `[{type:'vocabulary',…},{type:'reading',…},{type:'exercise',…}]`，
   *   判据会**检出它自己** ⇒ 对照组假红（首次实现即踩到，见上方 27a 注释的同类教训）。
   *   拆成三个 `{...}` 对象字面量后，`[...]` 里只剩变量名，天然豁免；
   *   而它仍然是「人手写、与唯一副本互相独立」的真值
   *   （若改成 import，就会随唯一副本一起变 ⇒ 变成恒真门，那比没有门更糟）。 */
  const GT_VOCABULARY = { type: 'vocabulary', dirSuffix: 'vocab' }
  const GT_READING = { type: 'reading', dirSuffix: 'reading' }
  const GT_EXERCISE = { type: 'exercise', dirSuffix: 'exercise' }
  const GROUND_TRUTH = [GT_VOCABULARY, GT_READING, GT_EXERCISE]
  const actual = segments.map((s) => ({ type: s.type, dirSuffix: s.dirSuffix }))
  if (actual.length !== GROUND_TRUTH.length || actual.some((a, i) => a.type !== GROUND_TRUTH[i].type || a.dirSuffix !== GROUND_TRUTH[i].dirSuffix)) {
    problems.push(`唯一副本被改动：期望 ${GROUND_TRUTH.map((g) => `${g.type}(${g.dirSuffix})`).join(', ')}，`
      + `实得 ${actual.map((a) => `${a.type}(${a.dirSuffix})`).join(', ')}`
      + ` ⇒ 「可声明的内容段类型」是**契约**（磁盘上 9 个包的 id 就按它命名）。`
      + `把它改小会让判据 26 对该段**失明**（那些包会被当成「非脚手架包」排除出对账，门反而全绿）。`
      + `确实要改契约，请同时改 content/ 下对应包的 id 并走一次完整 review。`)
  }
  return { problems, segments: segments.map((s) => `${s.type}(${s.dirSuffix})`) }
}

let fails = 0
const fail = (msg) => { fails++; console.error(`  ✗ ${msg}`) }
const ok = (msg) => console.log(`  ✓ ${msg}`)

async function main() {
  if (!existsSync(CONTENT_DIR)) { console.error('content/ 不存在'); process.exit(1) }
  /* —— B-1 泛化：扫描 content/ 下全部类型子目录，目录名即内容类型 —— */
  const typeDirs = (await readdir(CONTENT_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()
  for (const t of typeDirs) {
    if (!CONTENT_TYPES.has(t)) fail(`未知内容类型目录 content/${t}/：不在 ContentType 白名单（须与 src/core/content/model/content.ts 联合类型一致）`)
  }
  const knownTypes = typeDirs.filter((t) => CONTENT_TYPES.has(t))
  const pkgsByType = new Map() // type → 包目录 id 列表
  let totalPkgs = 0
  for (const type of knownTypes) {
    const ids = (await readdir(path.join(CONTENT_DIR, type), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    pkgsByType.set(type, ids)
    totalPkgs += ids.length
  }
  console.log(`[content:validate] ${knownTypes.length} 个类型目录 / ${totalPkgs} 个包：${knownTypes.map((t) => `${t}×${pkgsByType.get(t).length}`).join(' ')}`)

  // —— 预扫描：第 12 项 (c) 跨包 ContentId、(e) relation 端点存在性都需要「全库视角」，
  //     单包循环内部看不到其它包，故先静默建一次索引（不可解析的包由主循环报错）。——
  // 喂给共享模块的是与 loadPackages() **同形状**的记录（type/manifest/payload）—— 唯一实现，
  // 本文件不再自建 registry Map + normWords（旧实现只认 type === 'word'，非 word 端点恒判孤儿）。
  const reachInput = []
  for (const [type, ids] of pkgsByType) {
    for (const id of ids) {
      try {
        const mf = JSON.parse(await readFile(path.join(CONTENT_DIR, type, id, 'manifest.json'), 'utf8'))
        const pPath = path.join(CONTENT_DIR, type, id, payloadNameOf(type))
        const payload = existsSync(pPath) ? JSON.parse(await readFile(pPath, 'utf8')) : null
        reachInput.push({ type, id, dir: path.join(CONTENT_DIR, type, id), manifest: mf, payload })
      } catch { /* 主循环会 FAIL，这里跳过 */ }
    }
  }
  const reach = buildReachability(reachInput)

  // 第 20 项：registry.ts 只读一次（Node 无法 import TS）
  const registrySrc = existsSync(REGISTRY_TS) ? await readFile(REGISTRY_TS, 'utf8') : null
  if (registrySrc === null) fail(`registry.ts 不存在或不可读：${REGISTRY_TS}（第 20 项无法判定）`)

  // 第 18/19/20 项聚合容器（跨包结论，循环结束后统一判定）
  const manifestSizes = [] // { id, bytes }
  const inlinePkgs = [] // { id, items, bytes }
  const policyList = [] // { id, policy }
  const vocabLicenses = [] // 判据 23 · { id, redistributable, name, spdx }（只收 vocabulary 包）

  const seenIds = new Map()
  const seenNs = new Map()
  const globalIds = new Map() // `${namespace}|${normalized word}` → Set<包 id>（12c 跨包兜底，仅 vocabulary 词级 id）
  let totalWords = 0
  for (const [type, ids] of pkgsByType) {
    for (const id of ids) {
      const dir = path.join(CONTENT_DIR, type, id)
      console.log(`▸ ${type}/${id}`)
      let manifest
      try {
        manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
      } catch (e) { fail(`manifest.json 不可解析：${e.message}`); continue }

      // 0. 类型一致性：manifest.type 必须与所在目录名一致（放错目录 = ContentId 类型段说谎）
      if (manifest.type !== type) fail(`manifest.type="${manifest.type}" 与所在目录类型 "${type}" 不一致 → 移到 content/${manifest.type}/ 或修正 type`)

      // 载荷：vocabulary 必有 words.json；其余类型 items.json 可选（无载荷包走 policy/registry 判据）
      const pName = payloadNameOf(type)
      const payloadPath = path.join(dir, pName)
      let payload = null
      if (existsSync(payloadPath)) {
        try { payload = JSON.parse(await readFile(payloadPath, 'utf8')) } catch (e) { fail(`${pName} 不可解析：${e.message}`); continue }
        if (!Array.isArray(payload)) { fail(`${pName} 必须为数组，实际 ${typeof payload}`); continue }
      } else if (type === 'vocabulary') {
        fail('words.json 缺失（vocabulary 包必须有词表载荷）'); continue
      } else {
        console.log(`  · 无 ${pName}（非 vocabulary 包允许无载荷：policy 须合法且 registry 侧可解释）`)
      }
      const dup = [] // 12(a) 包内重复 key（第 4 项判定后回显）
      const keyOf = (it) => (type === 'vocabulary' ? it?.word : it?.id ?? it?.word)

      // 18. manifest 体积取样：**两个口径都取**（字节数，不是 JSON.stringify 长度）。
      //     · rawBytes    = manifest.json 磁盘文件的 UTF-8 字节数（仅用于输出对照，不参与判定）
      //     · runtimeBytes = projectManifest(manifest) 投影后的 UTF-8 字节数（**判定口径**，口径①）
      //     两个口径都取，是因为判据 18 的输出必须同时给出两个数字 + 差额来源（见判据 18 区块）——
      //     只打印一个数字，下一个人就无法判断门卡的是哪一笔字节。
      //     ⚠️ 投影后用 JSON.stringify 而非文件字节：投影产物是**对象字面量**，文件字节还含
      //     2 空格缩进与被裁字段；口径必须与「主 chunk 里实际存在什么」对齐。
      {
        const rawText = await readFile(path.join(dir, 'manifest.json'))
        const runtimeText = JSON.stringify(projectManifest(manifest))
        manifestSizes.push({
          id,
          rawBytes: rawText.length,
          runtimeBytes: Buffer.byteLength(runtimeText, 'utf8'),
        })
      }

      // 19. inline 预算取样：只有 inline 包的载荷会 1:1 全额进主 chunk，lazy 包不占首屏
      const policy = manifest.offline?.policy
      policyList.push({ id, policy })
      // 判据 23 取样：**只收 vocabulary 包**（词库才是「可开源」这件事的载体；
      // reading/exercise 合法为 redistributable:false，混进来会造出一堆假红）。
      // 字段缺失刻意**照实记 undefined** 而不是补默认值 —— 判据要能区分
      // 「显式 false（合法声明，但词库上就是降级）」与「压根没写（UNKNOWN）」。
      if (type === 'vocabulary') {
        const lic = (Array.isArray(manifest.sources) ? manifest.sources : [])
          .map((s) => s?.license ?? {})
        // 多来源时取**最严格**的一个（任一不可再分发即整包不可再分发），与 decidePackage 同向。
        const worst = lic.reduce((a, l) => (a === null || l.redistributable !== true ? l : a), null)
        vocabLicenses.push({
          id,
          redistributable: worst?.redistributable,
          name: worst?.name,
          spdx: worst?.spdx,
        })
      }
      if (policy === 'inline' && payload === null) {
        fail(`offline.policy=inline 但无 ${pName} 载荷：inline 语义是载荷静态进主 chunk，无载荷可进属语义矛盾`)
      } else if (policy === 'inline') {
        inlinePkgs.push({ id, items: manifest.stats?.items ?? 0, bytes: (await readFile(payloadPath)).length })
      }
      if (payload === null && !KNOWN_POLICIES.has(policy)) {
        fail(`无载荷包 offline.policy=${policy ?? '缺失'} 非法（须 inline/lazy，registry 侧才可解释）`)
      }

      // 内容指纹（第 6/15 项共用）：必须走 canonical —— 只取决于数据语义，与文件排版无关。
      // 实现 = license-policy.mjs 的 checksumPayload（唯一哈希 helper，与 gate-license 的
      // sourceChecksum 判据同一份）；payload 为 null 时返回 null（"无实测基准，不判通过"）。
      const canonicalSum = checksumPayload(payload)

    // 2. 必填字段
    const missing = REQUIRED_FIELDS.filter((f) => manifest[f] === undefined)
    if (missing.length === 0) ok('必填字段完整')
    else fail(`manifest 缺字段：${missing.join(', ')}`)

    // 3. ContentId 4 段式（B-1 泛化：类型段 = 所在目录名；namespace 消歧来源族）
    const idOk = new RegExp(`^content:${type}:[a-z0-9-]+:.+$`).test(manifest.id ?? '') && manifest.id.endsWith(`:${id}`)
    if (idOk) ok(`ContentId 规范（${manifest.id}）`)
    else fail(`id 应为 content:${type}:<namespace>:${id}，实际 "${manifest.id}"`)

    // 4. 包内重复 key（vocabulary=词形；其余类型=条目 id。跨包同词刻意允许，不做跨包唯一性约束）
    if (payload !== null) {
      const seen = new Set()
      for (const it of payload) { const k = keyOf(it); if (seen.has(k)) dup.push(k); else seen.add(k) }
      if (dup.length === 0) ok(type === 'vocabulary' ? `无包内重复词条（${payload.length} 词）` : `无包内重复条目 id（${payload.length} 条）`)
      else fail(`包内重复 ${dup.length} 个：${dup.slice(0, 5).join(', ')}...`)
    } else {
      console.log('  · 无载荷，跳过包内重复检测')
    }

    // 5. stats 一致（漂移 → content:build 自动同步；仅 vocabulary 走构建器，其余类型手工保证）
    if (payload === null) console.log('  · 无载荷，跳过 stats 比对')
    else if (manifest.stats?.items === payload.length) ok(`stats.items 与实际一致（${payload.length}）`)
    else fail(`stats.items=${manifest.stats?.items} ≠ 实际 ${payload.length} → vocabulary 包运行 npm run content:build 同步`)

    // 6. checksum（第 6 项 = 来源原始数据指纹，走 canonical 序列化而非文件原文；
    //    与 gate-license 的 sourceChecksum 判据共用 checksumPayload —— 单一哈希实现）
    const sources = manifest.sources ?? []
    if (sources.length === 0) fail('sources 为空（V4.1 起为数组，至少一条来源）')
    else if (payload === null) console.log('  · 无载荷，跳过 checksum 比对（无实测基准，不判通过）')
    else if (sources.every((s) => s.checksum === canonicalSum)) ok('checksum 一致（canonical SHA-256）')
    else fail('checksum 漂移：sources[].checksum 与载荷不符 → vocabulary 包运行 npm run content:build')

    // 7. License 门禁（结构化 + 外部来源须有 SPDX）
    //    P18-B：资产规则汇总（规则实现在 asset-rules.mjs，唯一）—— 此处只取分组结果，不含任何规则逻辑。
    const assetsResult = checkManifestAssets(manifest)
    let licenseOk = true
    for (const s of sources) {
      const lic = s.license
      if (!lic || typeof lic !== 'object') { fail(`source(${s.origin}) license 非结构化对象（需 {spdx,name,attributionRequired}）`); licenseOk = false; continue }
      if (!lic.name) { fail(`source(${s.origin}) license.name 缺失`); licenseOk = false }
      if (typeof lic.attributionRequired !== 'boolean') { fail(`source(${s.origin}) license.attributionRequired 必须为布尔`); licenseOk = false }
      // 自维护内容无 SPDX 属正常；外部来源（含 ECDICT/GitHub 等）必须有 SPDX。
      // P1.7-Wave4 B-4：判定依据从「origin 含 'curated'」的字符串巧合升级为语义字段
      // provider === 'geek-typing original'（哨兵值见 src/core/content/provenance.ts，
      // 本脚本是 Node 无法 import TS，按字面量镜像，两处同步修改）。
      // provider 缺失时回退旧 origin 规则 —— 兼容未补 provider 的历史 manifest，不是放宽。
      // ⚠️ 哨兵走常量引用（provider-rules.mjs），**本处行为逐字不变**，只是不再硬写第二份字面量。
      const isSelf = s.provider === PROVIDER_ORIGINAL
        || (s.provider === undefined && String(s.origin).includes('curated'))
      if (!lic.spdx && !isSelf) {
        fail(`外部来源 ${s.origin}（provider=${s.provider ?? '缺失'}）缺 license.spdx（未知协议内容不得入库）`)
        licenseOk = false
      }
    }
    // 7b. P18-B：包级 licenses 表（"id → 许可"具名表）逐条许可判定。
    //     判定矩阵唯一位于 license-policy.mjs 的 decideLicense；此处只调用（经 asset-rules 的
    //     checkLicenseDecision 映射成 PASS/FAIL），不复制矩阵。
    if (manifest.licenses !== undefined) {
      const table = manifest.licenses
      if (table === null || typeof table !== 'object' || Array.isArray(table)) {
        fail('manifest.licenses 必须为「id → 许可」对象（具名许可表）')
        licenseOk = false
      } else {
        for (const [lid, entry] of Object.entries(table)) {
          if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string' || !entry.name) {
            fail(`licenses.${lid} 许可非结构化（需 {name, spdx?, attributionRequired}）`)
            licenseOk = false
            continue
          }
          const v = checkLicenseDecision({ provider: manifest.provenance?.provider, license: entry })
          if (!v.ok) { fail(`[${v.code}] licenses.${lid}：${v.message}`); licenseOk = false }
          else ok(`licenses.${lid} 许可判定 ${v.decision}（${v.reason}）`)
        }
      }
    }
    // 7c. P18-B：每个 asset 的许可判定（presence/XOR · licenseRef 解析 · decideLicense）同样走
    //     asset-rules.mjs，但它已包含在 12(f) 的"asset 全规则"里（checkManifestAssets 汇总），
    //     故本判据**不重复计数** —— 单一实现约束满足（规则只有一份），报告点也只有一处。
    if (licenseOk && sources.length > 0) ok(`license 结构化（${sources.map((s) => s.license?.spdx ?? 'self').join(', ')}）`)

    // 8. 包 id 唯一（注意：这里校验的是包 ContentId，不是词——跨包同词合法）
    if (seenIds.has(manifest.id)) fail(`包 ContentId 与 ${seenIds.get(manifest.id)} 重复`)
    else seenIds.set(manifest.id, id)

    // 9. namespace 每包唯一 —— 词级 ContentId 全局唯一的**充要条件**。
    //    词级 id = content:word:<namespace>:<词形>，localId 只有词形，不含包 id；
    //    因此只要两个包共用 namespace，同名词的 ContentId 就必然撞车，无法作为学习记录主键。
    //    （曾踩坑：cet4/toefl/ielts 共用 namespace `ecdict` → abandon 三包同 id。
    //     由 V4.1 契约测试 tests/content-query.mjs 实测捕获，规则固化为 `${来源族}-${包 id}`。）
    const ns = new RegExp(`^content:${type}:([a-z0-9-]+):`).exec(manifest.id ?? '')?.[1]
    if (!ns) fail('无法从 id 解析 namespace')
    else if (seenNs.has(ns)) fail(`namespace "${ns}" 与包 ${seenNs.get(ns)} 重复：词级 ContentId 将撞车，namespace 必须每包唯一`)
    else { seenNs.set(ns, id); ok(`namespace 唯一（${ns}）`) }

    // 13. packageId —— 必须与目录名同名（UI / 持久化 / 目录三处指的是同一个包）
    if (manifest.packageId === id) ok(`packageId=${manifest.packageId}（与目录名一致）`)
    else fail(`packageId 应等于目录名 "${id}"，实际 ${manifest.packageId ?? '缺失'} → 运行 npm run content:build`)

    // 14. namespace —— 必须与 manifest.id 第 3 段同源（build 是从最终 ContentId 反解写入的）
    if (typeof manifest.namespace !== 'string' || !manifest.namespace) {
      fail(`namespace 缺失或非法（${manifest.namespace ?? 'undefined'}）→ 运行 npm run content:build`)
    } else if (!ns) {
      // 第 9 项已判 FAIL，此处不重复计数
    } else if (manifest.namespace !== ns) {
      fail(`namespace="${manifest.namespace}" ≠ id 解析出的 "${ns}"：两者必须同源 → 运行 npm run content:build`)
    } else ok(`namespace 与 id 同源（${manifest.namespace}）`)

    if (type === 'vocabulary' && payload !== null) totalWords += payload.length

    // 10. schemaVersion —— 结构版本，由 content:build 写入，改结构才递增
    if (manifest.schemaVersion === SCHEMA_VERSION) ok(`schemaVersion=${manifest.schemaVersion}`)
    else fail(`schemaVersion 应为 ${SCHEMA_VERSION}，实际 ${manifest.schemaVersion ?? '缺失'} → 运行 npm run content:build`)

    // 11. contentVersion —— 内容版本，正整数，由 content:build 按 checksum 变化自增
    if (Number.isInteger(manifest.contentVersion) && manifest.contentVersion > 0) ok(`contentVersion=${manifest.contentVersion}`)
    else fail(`contentVersion 必须为正整数，实际 ${manifest.contentVersion ?? '缺失'} → 运行 npm run content:build`)

    // 15. contentChecksum —— 入库内容的 canonical 指纹（与文件排版无关）
    if (payload === null) console.log('  · 无载荷，跳过 contentChecksum 实测比对（三元组自洽由第 16 项覆盖）')
    else if (manifest.contentChecksum === canonicalSum) ok(`contentChecksum 一致（${canonicalSum.slice(7, 15)}…）`)
    else fail(`contentChecksum 漂移：manifest=${manifest.contentChecksum ?? '缺失'} ≠ 实际 ${canonicalSum} → 运行 npm run content:build`)

    // 16. 版本三元组自洽：revision / version 正整数，且能在 contentHistory 里找到
    //     checksum 命中的那条记录（取最近一条，与 build 的复用口径一致）。
    //     回滚场景：version 回到历史值 ⇒ 允许 revision > 命中条目的 revision（审计号只增不减）。
    const rev = manifest.contentRevision
    const ver = manifest.contentVersion
    const revOk = Number.isInteger(rev) && rev > 0
    const verOk = Number.isInteger(ver) && ver > 0
    if (!revOk) fail(`contentRevision 必须为正整数，实际 ${rev ?? '缺失'} → 运行 npm run content:build`)
    if (!verOk) fail(`contentVersion 必须为正整数，实际 ${ver ?? '缺失'} → 运行 npm run content:build`)
    const history = Array.isArray(manifest.contentHistory) ? manifest.contentHistory : []
    if (history.length === 0) {
      fail('contentHistory 缺失或为空 → 运行 npm run content:build')
    } else {
      const hitEntry = [...history].reverse().find((e) => e?.checksum === manifest.contentChecksum)
      if (!hitEntry) fail(`contentHistory 中不存在 checksum === contentChecksum 的条目 → 运行 npm run content:build`)
      else if (hitEntry.version !== ver) fail(`contentHistory 命中条目 version=${hitEntry.version} ≠ contentVersion=${ver} → 运行 npm run content:build`)
      else if (!(Number.isInteger(hitEntry.revision) && hitEntry.revision > 0 && hitEntry.revision <= rev)) fail(`contentHistory 命中条目 revision=${hitEntry.revision} 应 ≤ contentRevision=${rev}`)
      else if (revOk && verOk) ok(`版本三元组自洽（revision=${rev} version=${ver} history=${history.length} 条，命中 revision=${hitEntry.revision}）`)
    }

    // 17. build 溯源：谁、什么时候、用哪份源数据产出了这份 manifest
    const b = manifest.build
    if (!b || typeof b !== 'object') fail(`build 字段缺失（应为 {toolVersion,builtAt,sourceChecksum}）→ 运行 npm run content:build`)
    else {
      let buildOk = true
      if (typeof b.toolVersion !== 'string' || !b.toolVersion) { fail('build.toolVersion 缺失或为空'); buildOk = false }
      if (typeof b.builtAt !== 'string' || !b.builtAt || Number.isNaN(Date.parse(b.builtAt))) { fail(`build.builtAt 不是合法时间：${b.builtAt ?? '缺失'}`); buildOk = false }
      if (b.sourceChecksum !== manifest.contentChecksum) { fail(`build.sourceChecksum(${b.sourceChecksum ?? '缺失'}) ≠ contentChecksum(${manifest.contentChecksum ?? '缺失'})`); buildOk = false }
      if (buildOk) ok(`build 溯源完整（${b.toolVersion} @ ${b.builtAt}）`)
    }

    // 12. Duplicate Detection —— 按「可判定性」分级：能判的判死，判不了的如实说跳过，
    //     绝不用「假装通过」凑绿。
    //   (a) 包内 duplicate localId（精确词形）：第 4 项已覆盖并报错，此处只回显，避免重复计数
    //   (g) orphan learning record：学习记录挂在 ContentId 上、随用户练习产生，
    //       属运行时一致性问题，由 Learning 层（src/core/review/*）负责，脚本不校验。
    if (payload !== null && dup.length === 0) ok('duplicate localId：无（第 4 项已判定）')

    //   (b) 包内 duplicate normalized key：NFC+lowercase+空白折叠后同 key 即撞车
    if (payload !== null) {
      const normSeen = new Map()
      const normDup = []
      payload.forEach((it, i) => {
        const k = normKey(keyOf(it))
        if (!k) return
        if (normSeen.has(k)) normDup.push(`"${keyOf(it)}"（#${normSeen.get(k)} ↔ #${i}）`)
        else normSeen.set(k, i)
      })
      if (normDup.length === 0) ok('无 duplicate normalized key（大小写/空白差异已并入 key）')
      else fail(`duplicate normalized key ${normDup.length} 个：${normDup.slice(0, 5).join('；')}`)
    }

    //   (c) 跨包 duplicate ContentId：key = namespace + normalized localId。
    //       只统计「同一个 key 出现在 ≥2 个包」，包内重复由 12(b) 负责，不在这里重复计数。
    //       namespace 每包唯一（第 9 项）后理论上不可能撞车，这里作兜底回归检测，
    //       结果在所有包循环结束后统一判定。词级 id 只存在于 vocabulary 包，故只扫 vocabulary。
    if (type === 'vocabulary' && payload !== null) {
      for (const w of payload) {
        const k = normKey(w?.word)
        if (!k) continue
        const gk = `${ns ?? '?'}|${k}`
        if (!globalIds.has(gk)) globalIds.set(gk, new Set())
        globalIds.get(gk).add(id)
      }
    }

    //   (d) duplicate source：同一 origin 在 sources[] 里出现两次
    const origins = sources.map((s) => s?.origin)
    const dupOrigin = [...new Set(origins.filter((o, i) => origins.indexOf(o) !== i))]
    if (dupOrigin.length === 0) ok(`无 duplicate source（${origins.length} 条来源）`)
    else fail(`duplicate source origin：${dupOrigin.join(', ')}`)

    //   (e) invalid / orphan relation —— 只有 relations.json 存在才校验
    const relPath = path.join(dir, 'relations.json')
    if (!existsSync(relPath)) {
      console.log('  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）')
    } else {
      let raw
      try { raw = JSON.parse(await readFile(relPath, 'utf8')) } catch (e) { fail(`relations.json 不可解析：${e.message}`) }
      if (raw !== undefined) {
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.relations) ? raw.relations : null)
        if (!list) fail('relations.json 结构无法识别（期望数组或 { relations: [...] }）')
        else {
          const problems = []
          list.forEach((r, i) => {
            //判据①（Stage 2 ·2026-10-02）：type ∈ RelationType。
            // 这条**刻意放在端点检查之前**：type 非法时边本身就不成立，
            // 继续校验它的端点只会把「type 写错了」和「端点也写错了」混成一堆噪声。
            if (!isValidRelationType(r?.type)) {
              problems.push(`#${i} 非法 relation type：${JSON.stringify(r?.type ?? null)}（不在 RelationType 白名单内）`)
              return
            }
            const ends = relationEndpoints(r)
            for (const e of ends) {
              const m2 = typeof e === 'string' ? CONTENT_ID_RE.exec(e) : null
              if (!m2) { problems.push(`#${i} 端点非法：${JSON.stringify(e)}`); continue }
              if (!isReachable(reach, e)) problems.push(`#${i} 孤儿端点：${e}`)
            }
          })
          if (problems.length === 0) ok(`relations.json ${list.length} 条：type 合法、端点合法且可达`)
          else fail(`relation 校验失败 ${problems.length} 处：${problems.slice(0, 3).join('；')}`)
        }
      }
    }

    //   (f) broken asset —— 只有 manifest 存在 assets 字段才校验；通过条件 = **asset 全规则通过**
    //       （assetId 语法/归属 · checksum · url · 许可 · provenance）。规则实现在 asset-rules.mjs（唯一），
    //       本判据只取汇总结果（assetViolations + assetLicenseViolations），不含规则逻辑。
    if (!assetsResult.hasAssets) {
      console.log('  · manifest 无 assets 字段，跳过 asset 校验')
    } else {
      const assetProblems = [...assetsResult.assetViolations, ...assetsResult.assetLicenseViolations]
      if (assetProblems.length === 0) {
        ok(`assets ${assetsResult.assetCount} 项全规则通过（assetId 语法/归属 · checksum · url · 许可 · provenance）`)
      } else {
        for (const v of assetProblems) fail(`[${v.code}] ${v.message}`)
      }
    }

    // 21. 资产契约（P1.8-B）—— 包级 licenses/provenance 条件必填（⇔ 声明了非空 assets[]）。
    //     规则实现在 asset-rules.mjs 的 checkPackageAssetDeclarations（唯一），本判据只调用。
    {
      const decl = checkPackageAssetDeclarations(manifest)
      if (decl.ok) {
        ok(decl.required
          ? '资产契约：assets[] 非空 ⇒ 包级 licenses/provenance 齐备'
          : '资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）')
      } else {
        for (const v of decl.violations) fail(`[${v.code}] ${v.message}`)
      }
    }
    }
  }

  // 12(c) 跨包结论（全库扫描后统一判定）
  const crossDups = [...globalIds.entries()].filter(([, packs]) => packs.size > 1)
    .map(([k, packs]) => `${k.split('|')[1]}（${[...packs].join(' ↔ ')}）`)
  if (crossDups.length > 0) fail(`跨包 duplicate ContentId ${crossDups.length} 处：${crossDups.slice(0, 5).join('；')}`)
  else ok(`跨包无 duplicate ContentId（全库 ${totalWords} 词扫描，namespace 唯一 ⇒ 兜底回归）`)

  /* ===== 18. manifest 体积（常驻字段口径 · 见上方「口径纪律」注释）=====
   * 判定内核 = judgeManifestSize()（与 --falsify 共用同一条实现，见该函数注释）。
   * 输出**同时给出常驻总量与原始总量并说明差额来源** —— 让下一个人一眼看出口径，
   * 不用去翻源码猜门卡的是哪一笔字节。 */
  {
    const r = judgeManifestSize(manifestSizes)
    if (r.verdict === 'FAIL') fail(r.message)
    else ok(r.message)
  }

  /* ===== 19. inline 预算 =====
   * inline 包的 words.json 被静态 import 进主 chunk，实测传导比 1:1.0005（kaoyan 改 inline
   * ⇒ 主 chunk raw +471.92 KiB / gzip +166.41 KiB）。词库增长必须走 lazy，不能靠加 inline。 */
  {
    const items = inlinePkgs.reduce((a, p) => a + p.items, 0)
    const bytes = inlinePkgs.reduce((a, p) => a + p.bytes, 0)
    const ids = inlinePkgs.map((p) => `${p.id}(${p.items}词/${kib(p.bytes)}KiB)`).join(', ')
    const limit = `${INLINE_MAX_ITEMS} 词 / ${INLINE_MAX_BYTES / 1024} KiB`
    if (items > INLINE_MAX_ITEMS) {
      fail(`inline 词条数越界：${items} > ${INLINE_MAX_ITEMS}（${ids}）⇒ inline 词 1:1 进主 chunk，请改为 lazy`)
    } else if (bytes > INLINE_MAX_BYTES) {
      fail(`inline words 体积越界：${bytes} B（${kib(bytes)} KiB）> ${INLINE_MAX_BYTES} B（${INLINE_MAX_BYTES / 1024} KiB）（${ids}）⇒ 请改为 lazy`)
    } else {
      ok(`inline 预算（${inlinePkgs.length} 包：${ids} | Σ ${items} 词 / ${kib(bytes)} KiB ≤ ${limit}）`)
    }
  }

  /* ===== 20. 策略一致性：manifest.offline.policy ↔ registry 实际加载方式 =====
   * 两边任一处改漏都会静默破坏首屏体积契约：manifest 说 lazy、registry 却静态 import
   * ⇒ 大词库悄悄进主 chunk；反之则首屏该有的词库变成异步缺口。 */
  {
    const skipped = []
    let consistent = 0
    let policyFails = 0
    for (const { id, policy } of policyList) {
      if (!KNOWN_POLICIES.has(policy)) { skipped.push(`${id}（policy=${policy ?? '缺失'}）`); continue }
      if (registrySrc === null) { policyFails++; continue } // 第 20 项前置已 FAIL，此处不重复报错
      const r = registryLoadMode(registrySrc, id)
      if (r.mode === policy) { consistent++; continue }
      policyFails++
      if (r.mode === 'missing') fail(`策略不一致：${id} manifest policy=${policy}，但 registry.ts 中找不到 localId: '${id}' 的注册项`)
      else if (r.mode === 'ambiguous') fail(`策略不一致：${id} 在 registry.ts 中匹配到 ${r.count} 个注册项，无法判定实际加载方式`)
      else if (r.mode === 'conflict') fail(`策略不一致：${id} 在 registry.ts 中同时存在 words: 与 load:，无法判定实际加载方式`)
      else if (r.mode === 'unknown') fail(`策略不一致：${id} manifest policy=${policy}，但 registry.ts 注册项里既无 words:/data: 也无 load:/loadData:`)
      else fail(`策略不一致：${id} manifest policy=${policy}，registry.ts 实际为 ${r.mode}（${r.mode === 'inline' ? '静态 import ⇒ 进主 chunk' : '动态 import ⇒ 独立 chunk'}）：两边须同改`)
    }
    if (skipped.length > 0) {
      console.log(`  · 策略一致性跳过 ${skipped.length} 包（未知策略，不判通过也不判失败）：${skipped.join('；')}`)
    }
    if (policyFails === 0) {
      const nInline = policyList.filter((p) => p.policy === 'inline').length
      const nLazy = policyList.filter((p) => p.policy === 'lazy').length
      ok(`策略一致性（manifest ↔ registry）：${consistent} 包一致（inline ${nInline} / lazy ${nLazy}${skipped.length ? `，跳过 ${skipped.length}` : ''}）`)
    }
  }

  /* ===== 22. 二进制媒体检查（P18-F · INV-4）=====
   * INV-4：content/ 内不得出现二进制媒体文件，媒体一律走远程。「url 必须远程 https」已在
   * 资产声明层由 asset-rules.mjs:117 的 checkAssetUrl() 强制（P18-B），本判据关掉**文件层缺口**
   * —— 防「manifest 声明远程、实体却塞进仓库」的声明 ⟷ 实体脱钩绕过（裁定 ⑩-2）。
   * 双通道：扩展名白名单 + NUL 字节嗅探（详见 checkBinaryMedia 注释）；fail-closed：
   * error 非空也判 FAIL。输出字面量「二进制媒体文件数 = 0」供 P18-G4 期望输出对账（裁定 ⑩-3）。 */
  {
    const r = checkBinaryMedia(CONTENT_DIR) // 继承 --root 语义（证伪对隔离副本跑同一条判据）
    if (r.error) fail(`二进制媒体检查本身失败（fail-closed）：${r.error}`)
    const whyText = (why) => (why === 'ext' ? '扩展名不在白名单 .json/.md/.txt' : 'NUL 字节命中（疑似改扩展名伪装的二进制）')
    for (const o of r.offenders) {
      fail(`二进制媒体文件：${o.rel}（${whyText(o.why)}）→ INV-4：媒体一律走远程 https，实体不得进 content/`)
    }
    if (r.offenders.length > 0) {
      const nExt = r.offenders.filter((o) => o.why === 'ext').length
      const nNul = r.offenders.filter((o) => o.why === 'nul').length
      fail(`二进制媒体文件数 = ${r.offenders.length}（INV-4 要求 = 0；扫描 ${r.scanned} 个文件：ext ${nExt} / nul ${nNul}）`)
    } else if (!r.error) {
      ok(`二进制媒体检查（扫描 ${r.scanned} 个文件，二进制媒体文件数 = 0）：扩展名白名单 + NUL 嗅探双通道通过`)
    }
  }

  /* ===== 23. 词库包许可降级棘轮（P20 · 词库可开源）=====
   * 判定内核 = judgeVocabLicenseRedistributable()（与 --falsify 共用同一条实现）。
   * 它守的是「**不该悄悄变**」，不是「现状合法」——
   * gate:license（INV-5）判声明合法性，而 redistributable:false 是个合法声明，
   * 所以「重跑一次脚手架把 13 个可开源词库降级成 12 个」在 INV-5 眼里全程绿灯。*/
  {
    const r = judgeVocabLicenseRedistributable(vocabLicenses)
    if (r.verdict === 'FAIL') fail(r.message)
    else ok(r.message)
  }

  /* ===== 24. 单元源许可段 fail-closed（判据 23 的源侧 · 让判据 ① 真正在 CI 生效）===== */
  {
    const r = checkUnitSources()
    if (r.problems.length > 0) {
      fail(`单元源许可声明不合规 ${r.problems.length} 项（判据 24 · fail-closed：源缺 license 段即红）：`
        + r.problems.join('；')
        + ` ⇒ 「缺失」≠ 默认允许：这些源一旦被拿去跑 content:scaffold-unit，`
        + `对应包会静默降级成 redistributable:false（13 个可开源词库掉到 12 个），`
        + `而这样的声明在 gate:license 眼里完全合法。修法= 给源的对应段补显式 license。`)
    } else {
      ok(`单元源许可段 fail-closed（${r.total} 个源：${r.files.join(', ')} —— 每个源对每段已声明内容都显式声明了 license，且 redistributable 为显式布尔；判据 24 与盘侧判据 23 方向相反、缺一不可）`)
    }
  }

  /* ===== 25. 源 ↔ 磁盘一致性（**独立于 CI 那步 `--check`**）===== */
  {
    const r = checkUnitSourceDrift()
    if (r.problems.length > 0) {
      fail(`单元源与磁盘内容包漂移 ${r.problems.length} 处（判据 25 · fail-closed：无可比对的源即判红）：`
        + r.problems.join('；')
        + ` ⇒ 源里的词条/段落与磁盘上的包已对不上。`
        + `⛔ 不要改 content/ 去迁就源，也不要改源去迁就 content/：先判断「谁错了」。`
        + `本判据与 CI 的 scaffold-unit --check 是同一事实的两个观测点（实现只有 unit-source-render.mjs 一份）。`)
    } else {
      ok(`单元源 ↔ 磁盘一致（${r.total} 个源渲染出 ${r.packages} 个包，载荷与 manifest（除 build 戳外）逐项一致；判据 25 独立于 CI 的 --check 那一步 —— 删掉那步也不丢覆盖）`)
    }
  }

  /* ===== 26. 三方对账：源 ↔ 包 ↔ 谁该有源（抓「该有源而没有」）===== */
  {
    const r = reconcileUnitSources()
    if (r.problems.length > 0) {
      fail(`单元源/内容包三方对账不一致 ${r.problems.length} 处（判据 26）：`
        + r.problems.join('；')
        + ` ⇒ 要么有包无源（不可复现：下次没人能还原它），要么盘比源多/少一个段。`)
    } else {
      ok(`单元源/内容包三方对账一致（${r.sources} 个源、${r.packages} 个脚手架形态包双向对得上；${r.notes[0]}）`)
    }
  }

  /* ===== 27. 段类型单一真源上锁（静态：无人自建第二份字面量）===== */
  {
    const r = judgeUnitTypeSingleSource()
    if (r.problems.length > 0) {
      fail(`段类型口径分叉风险 ${r.problems.length} 处（判据 27）：${r.problems.join('；')}`
        + ` ⇒ 段类型只允许一份（license-policy.mjs 的 UNIT_SOURCE_SEGMENTS = ${r.segments.join(', ')}）。`
        + `两份字面量会让判据 24（源侧）与脚手架判据 ①（缺段即拒跑）口径分叉，且无任何机器判据会发现。`)
    } else {
      ok(`段类型单一真源（validate.mjs / scaffold-unit.mjs / unit-source-render.mjs 均无段类型字面量副本；唯一副本 = ${r.segments.join(', ')}）`)
    }
  }

  if (fails > 0) { console.error(`\n[content:validate] FAIL：${fails} 项`); process.exit(1) }
  console.log(`\n[content:validate] PASS：${totalPkgs} 包全部通过`)
}

/* ===== P18-F 证伪自检（裁定 ⑩-4）：不会失败的门等于没有门 =====
 * 隔离副本 = os.tmpdir()/p18f-falsify-*（系统临时目录，容器即弃；真 content/ 只读、绝不被写）。
 * 双注入：(a) fake-audio.mp3 —— 媒体扩展名 + NUL 字节 ⇒ 白名单通道抓；
 *         (b) fake.json —— 合法 JSON 尾部追加 NUL ⇒ 嗅探通道抓（专证「改扩展名伪装」绕不过）。
 * 断言 4 条（精确等于，不是"包含"），全部满足才 exit 0；断言失败 exit 1；自身异常 exit 2
 * （三态对齐 gate-license.mjs 的 --falsify 惯例，UNKNOWN/异常一律视为不通过）。
 * 必须同进程完成：本机 node 进程内 spawn 一律 EBUSY（见 gate-license.mjs 实现注记），
 * **禁止 spawnSync/execSync** —— 判据本体直接调 checkBinaryMedia()，证伪跑的不是"另一份逻辑"。 */
function falsifyBinaryMedia() {
  console.log('[content:validate] 证伪自检 —— 证明 INV-4 二进制媒体判据能判红（不会失败的门等于没有门）')
  let tmp = null
  let verdict = null // true=断言全过 / false=断言失败 / null=自身异常（fail-closed）
  let bad = 0
  try {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'p18f-falsify-'))
    cpSync(CONTENT_DIR, tmp, { recursive: true })
    console.log(`  隔离副本：${tmp}（系统临时目录；真 content/ 只读、绝不被写）`)
    writeFileSync(path.join(tmp, 'fake-audio.mp3'), Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]))
    writeFileSync(path.join(tmp, 'fake.json'), Buffer.concat([Buffer.from('{"falsify":true}\n', 'utf8'), Buffer.from([0x00])]))
    console.log('  注入：fake-audio.mp3（mp3 扩展名 + NUL 字节）+ fake.json（合法 JSON 尾部追加 NUL —— 专证改扩展名伪装）\n')

    const injected = checkBinaryMedia(tmp)
    const whys = new Set(injected.offenders.map((o) => o.why))
    const rels = new Set(injected.offenders.map((o) => o.rel))
    const real = checkBinaryMedia(CONTENT_DIR)
    const assertions = [
      [`断言 1：offenders 恰好 = 2（多一个少一个都算失败）`, injected.offenders.length === 2, `实际 ${injected.offenders.length}`],
      [`断言 2：两类 why 都在（ext 白名单通道 / nul 嗅探通道）`, whys.has('ext') && whys.has('nul'), `实际 {${[...whys].join(', ') || '∅'}}`],
      [`断言 3：两个注入样本均被点名`, rels.has('fake-audio.mp3') && rels.has('fake.json'), `实际 {${[...rels].join(', ') || '∅'}}`],
      [`断言 4：真实 content/ 零 offender 且零 error（注入未污染真实内容）`, real.offenders.length === 0 && real.error === null, `offenders=${real.offenders.length} error=${real.error ?? 'null'}`],
    ]
    for (const [name, pass, actual] of assertions) {
      if (pass) console.log(`  ✓ ${name}`)
      else { bad++; console.error(`  ✗ ${name} —— ${actual}`) }
    }
    verdict = bad === 0
  } catch (e) {
    console.error(`  ‼ 证伪自检自身异常（fail-closed，绝不当作通过）：${e?.message ?? e}`)
  } finally {
    if (tmp !== null) {
      try { rmSync(tmp, { recursive: true, force: true }) }
      catch (e) { console.warn(`  ⚠ 隔离副本清理失败（系统临时目录，容器即弃，不影响判定）：${tmp} — ${e?.message ?? e}`) }
    }
  }
  console.log('──────────────────────────────────────────────────────')
  if (verdict === true) {
    console.log(`content:validate Falsification：✅ PASS —— 4/4 断言通过，隔离副本已清理，真 content/ 未被写入`)
    return true
  }
  if (verdict === false) {
    console.error(`content:validate Falsification：❌ FAIL —— ${bad}/4 断言未过 ⇒ 本判据不可信`)
    return false
  }
  return null // 自身异常（fail-closed）
}

/* ===== 判据 18 证伪自检：口径证明（不会失败的门等于没有门）=====
 * 隔离副本 = os.tmpdir()/p18-manifest-falsify-*（系统临时目录，容器即弃；真 content/ 只读、绝不被写）。
 * **双注入，方向相反，缺一不可**：
 *   注入一：把某包的某个**常驻字段**（如 description）撑大 ⇒ **必须判红**
 *      —— 证「门还咬得住常驻部分」（否则口径改完后门变成永不触发的空门）。
 *   注入二：把某包的某个**被裁字段**（sources）撑到很大 ⇒ **必须仍然判绿**
 *      —— 证「门真的只管常驻部分」。⛔ 这一注入若判红，**说明口径没改对**（那才是本判据要抓的失败）：
 *      门若对构建期已裁掉的字段也记账，就等于继续为一笔不花首屏成本的字节收税，
 *      口径漂移只是换了个阈值继续存在。
 * 两条注入合起来才构成「口径正确」的证明：单看注入一，只能证明门没坏；
 * 单看注入二，只能证明门变松了；**一起看才证明门恰好卡在常驻边界上**。
 *
 * ⚠️ 断言用**同一条实现**（judgeManifestSize + projectManifest），不另写一份判定 ——
 *   否则证伪跑的是"另一份逻辑"，证出来的 PASS 不代表主流程的 PASS。
 * ⚠️ 隔离纪律：注入前后真 content/ 的判定结果必须一致（断言 4），证明副本没污染真实内容。
 *   还原用内存快照覆写（0 次删除），避开本机 safe-delete shim 的累计删除计数。 */
function falsifyManifestSize() {
  console.log('[content:validate] 判据 18 证伪自检 —— 证明体积门只卡「常驻字段」，不卡「构建期已裁字段」')
  let tmp = null
  let verdict = null // true=断言全过 / false=断言失败 / null=自身异常（fail-closed）
  let bad = 0
  const assertions = []
  const record = (name, pass, actual) => {
    assertions.push([name, pass, actual])
    if (pass) console.log(`  ✓ ${name}`)
    else { bad++; console.error(`  ✗ ${name} —— ${actual}`) }
  }
  try {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'p18-manifest-falsify-'))
    cpSync(CONTENT_DIR, tmp, { recursive: true })
    console.log(`  隔离副本：${tmp}（系统临时目录；真 content/ 只读、绝不被写）`)

    /** 在副本里列出全部包的两个口径取样（与 main() 同口径：projectManifest 投影后的字节）。
     *  ⚠️ 目录遍历形态必须与 main() 一致（content/<type>/<pkg>/manifest.json），
     *   否则证伪跑的是另一个包集合 —— 那是"证伪了别的数据集"。 */
    const sampleAll = (dir) => {
      const out = []
      for (const type of readdirSync(dir, { withFileTypes: true })) {
        if (!type.isDirectory()) continue
        const tp = path.join(dir, type.name)
        for (const entry of readdirSync(tp, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue
          const mp = path.join(tp, entry.name, 'manifest.json')
          if (!existsSync(mp)) continue
          const obj = JSON.parse(readFileSync(mp, 'utf8'))
          out.push({
            id: entry.name,
            rawBytes: readFileSync(mp).length,
            runtimeBytes: Buffer.byteLength(JSON.stringify(projectManifest(obj)), 'utf8'),
          })
        }
      }
      return out
    }

    /** 取一个稳定的注入目标（副本里常驻体积最大的包）—— 不写死包名，避免某包被删后证伪失效。 */
    const base = sampleAll(tmp)
    const target = base.reduce((a, s) => (a === null || s.runtimeBytes > a.runtimeBytes ? s : a), null)
    const targetDir = (() => {
      for (const type of readdirSync(tmp, { withFileTypes: true })) {
        if (!type.isDirectory()) continue
        const tp = path.join(tmp, type.name)
        for (const id of readdirSync(tp, { withFileTypes: true })) {
          if (id.isDirectory() && id.name === target.id) return path.join(tp, id.name)
        }
      }
      return null
    })()
    if (targetDir === null) throw new Error(`找不到注入目标包目录：${target.id}`)
    const manifestPath = path.join(targetDir, 'manifest.json')
    const pristine = readFileSync(manifestPath, 'utf8') // 内存快照：还原靠覆写，0 次删除
    const restore = () => writeFileSync(manifestPath, pristine, 'utf8')
    console.log(`  注入目标：${target.id}（真实常驻 ${target.runtimeBytes} B / 原始 ${target.rawBytes} B）\n`)

    const baseVerdict = judgeManifestSize(base)

    /* —— 注入一：撑大**常驻字段** description ⇒ 必须判红 —— */
    {
      const obj = JSON.parse(pristine)
      obj.description = 'X'.repeat(MANIFEST_MAX_BYTES * 2) // 常驻字段，撑到远超单包上限
      writeFileSync(manifestPath, JSON.stringify(obj), 'utf8')
      const r = judgeManifestSize(sampleAll(tmp))
      record(
        `断言 1：撑大**常驻字段** description（${MANIFEST_MAX_BYTES * 2} B）⇒ 判红`,
        r.verdict === 'FAIL',
        `verdict=${r.verdict}`,
      )
      record(
        `断言 2：判红原因是「单包常驻体积越界」且点名被注入的包`,
        r.message.includes('单包常驻体积越界') && r.message.includes(target.id),
        `message=${r.message.slice(0, 120)}`,
      )
      restore()
    }

    /* —— 注入二：撑大**被裁字段** sources ⇒ 必须仍然判绿（口径改对了的证明）—— */
    {
      const obj = JSON.parse(pristine)
      // sources 是 DROPPED_MANIFEST_FIELDS 之一：构建期已被投影裁掉，不进主 chunk。
      // ⚠️ 填充量取阈值的 **2 倍**（不是 1 倍）：断言 4 要证明「原始口径下这笔字节远超上限」，
      //   若只填到刚好等于阈值，断言就变成「差几个字节算不算超标」的口径争议 ——
      //   那种断言在阈值附近时会给出一个取决于填充量的**假绿/假红**，等于没证伪。
      //   填 2 倍则无论阈值取 40 KiB 还是 64 KiB，原始口径都必然越界，判据唯一。
      const pad = 'Y'.repeat(MANIFEST_TOTAL_MAX_BYTES * 2)
      obj.sources = [{ ...(Array.isArray(obj.sources) ? obj.sources[0] : {}), origin: pad }]
      writeFileSync(manifestPath, JSON.stringify(obj), 'utf8')
      const r = judgeManifestSize(sampleAll(tmp))
      const rawGrew = r.rawTotal - baseVerdict.rawTotal
      const rtSame = r.runtimeTotal === baseVerdict.runtimeTotal
      record(
        `断言 3：撑大**被裁字段** sources（+${rawGrew} B 原始字节 = 全库上限的 ${(rawGrew / MANIFEST_TOTAL_MAX_BYTES).toFixed(2)}×）⇒ **仍然判绿**`,
        r.verdict === 'PASS',
        `verdict=${r.verdict}（⛔ 若为 FAIL 说明口径没改对：门仍在为构建期已裁字段记账）`,
      )
      record(
        `断言 4：注入二下常驻总量**逐字节不变**（${baseVerdict.runtimeTotal} B ⇒ ${r.runtimeTotal} B），原始总量显著变大`,
        rtSame && rawGrew > MANIFEST_TOTAL_MAX_BYTES,
        `常驻 ${baseVerdict.runtimeTotal}→${r.runtimeTotal} B（不变=${rtSame}）/ 原始 +${rawGrew} B（须 > ${MANIFEST_TOTAL_MAX_BYTES}）`,
      )
      restore()
    }

    /* —— 对照组：还原后必须与基线逐字节一致，且真 content/ 未被写入 —— */
    {
      const after = judgeManifestSize(sampleAll(tmp))
      const real = judgeManifestSize(sampleAll(CONTENT_DIR))
      record(
        '断言 5：还原后副本回到基线（常驻/原始总量与注入前逐字节一致）',
        after.runtimeTotal === baseVerdict.runtimeTotal && after.rawTotal === baseVerdict.rawTotal,
        `常驻 ${baseVerdict.runtimeTotal}→${after.runtimeTotal} B / 原始 ${baseVerdict.rawTotal}→${after.rawTotal} B`,
      )
      record(
        '断言 6：真 content/ 判定不受注入影响（隔离副本未污染真实内容）',
        real.runtimeTotal === baseVerdict.runtimeTotal && real.rawTotal === baseVerdict.rawTotal && real.verdict === baseVerdict.verdict,
        `真 content/ 常驻 ${real.runtimeTotal} B / 原始 ${real.rawTotal} B / verdict=${real.verdict}（基线 ${baseVerdict.runtimeTotal} B / ${baseVerdict.rawTotal} B / ${baseVerdict.verdict}）`,
      )
    }

    verdict = bad === 0
  } catch (e) {
    console.error(`  ‼ 证伪自检自身异常（fail-closed，绝不当作通过）：${e?.message ?? e}`)
  } finally {
    if (tmp !== null) {
      try { rmSync(tmp, { recursive: true, force: true }) }
      catch (e) { console.warn(`  ⚠ 隔离副本清理失败（系统临时目录，容器即弃，不影响判定）：${tmp} — ${e?.message ?? e}`) }
    }
  }
  const total = assertions.length
  console.log('──────────────────────────────────────────────────────')
  if (verdict === true) {
    console.log(`content:validate 判据 18 Falsification：✅ PASS —— ${total}/${total} 断言通过（常驻字段撑大⇒判红 / 被裁字段撑大⇒仍判绿），隔离副本已清理，真 content/ 未被写入`)
    return true
  }
  if (verdict === false) {
    console.error(`content:validate 判据 18 Falsification：❌ FAIL —— ${bad}/${total} 断言未过 ⇒ 判据 18 的常驻口径不可信`)
    return false
  }
  return null
}

/* ===== 判据 23 证伪自检：三条分支各能判红/判绿 =========
 * 隔离副本 = node_modules/.tmp/content-validate-falsify/（gitignore；真 content/ 全程只读）。
 * ⚠️ 为什么用 node_modules/.tmp 而不是 os.tmpdir()：本机 safe-delete shim 按**累计删除数**计费、
 *   超阈值 fail-closed；判据 22/18 那两组用 mkdtemp+rmSync 尚可，本组要反复覆写同一个文件，
 *   覆写（writeFileSync）**不产生删除计数**，故整组零删除。
 *
 * **三条分支，缺一条就证不了伪**（这是本次要求的硬结构）：
 *   分支① 注入降级：把某个 vocabulary 包的 license 改成 redistributable:false
 *         ⇒ **必须判红**，且消息点名该包。证「门还咬得住降级」。
 *   分支② 注入 UNKNOWN：把 redistributable **整键删掉**（不是改成 false）
 *         ⇒ **必须判红**。证 fail-closed 真的生效 —— 这一条与分支① 方向相反，
 *         只做① 的话，「字段缺失被当成 false 或当成 true」的 bug 都可能蒙混过关。
 *   分支③ **对照组**：还原后源与磁盘逐字一致 ⇒ **必须判绿**。
 *         证「它不是恒红门」。⛔ 这一条最容易被省略，而它才是可信度的锚：
 *         一个只会判红的门和一个没有门，在只看「注入是否变红」时无法区分。
 *   另加两条隔离断言（副本判定前后一致 / 真content/ 未被写入）。
 *
 * ⚠️ 断言用**同一条实现** judgeVocabLicenseRedistributable，不另写一份判定。 */
function falsifyVocabLicense() {
  console.log('[content:validate] 判据 23 证伪自检 —— 证明词库许可降级会判红、且「源与磁盘一致」判绿')
  const FALSIFY_DIR = path.join(ROOT, 'node_modules', '.tmp', 'content-validate-falsify')
  const FALSIFY_CONTENT = path.join(FALSIFY_DIR, 'content')
  let verdict = null
  let bad = 0
  const assertions = []
  const record = (name, pass, actual) => {
    assertions.push([name, pass, actual])
    if (pass) console.log(`  ✓ ${name}`)
    else { bad++; console.error(`  ✗ ${name} —— ${actual}`) }
  }
  /** 判据 23 的取样口径，必须与 main() 完全一致（否则证伪跑的是另一个包集合）。 */
  const sampleVocabLicenses = (dir) => {
    const out = []
    for (const type of readdirSync(dir, { withFileTypes: true })) {
      if (!type.isDirectory()) continue
      const tp = path.join(dir, type.name)
      for (const entry of readdirSync(tp, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const mp = path.join(tp, entry.name, 'manifest.json')
        if (!existsSync(mp)) continue
        if (JSON.parse(readFileSync(mp, 'utf8')).type !== 'vocabulary') continue
        const obj = JSON.parse(readFileSync(mp, 'utf8'))
        const lic = (Array.isArray(obj.sources) ? obj.sources : []).map((s) => s?.license ?? {})
        const worst = lic.reduce((a, l) => (a === null || l.redistributable !== true ? l : a), null)
        out.push({ id: entry.name, redistributable: worst?.redistributable, name: worst?.name, spdx: worst?.spdx })
      }
    }
    return out
  }
  try {
    mkdirSync(FALSIFY_DIR, { recursive: true })
    rmSync(FALSIFY_CONTENT, { recursive: true, force: true }) // 上轮残留，1 次删除（常量，非按文件计）
    cpSync(CONTENT_DIR, FALSIFY_CONTENT, { recursive: true })
    console.log(`  隔离副本：${FALSIFY_CONTENT}（node_modules/.tmp/，gitignore；真 content/ 只读、绝不被写）`)

    // 取样：挑一个稳定的词库包（不写死包名，避免某包被删后证伪失效）
    const base = sampleVocabLicenses(FALSIFY_CONTENT)
    const targetId = base.find((b) => b.redistributable === true)?.id
    if (targetId === undefined) throw new Error('副本里找不到 redistributable:true 的词库包，无法注入降级')
    const targetDir = (() => {
      for (const type of readdirSync(FALSIFY_CONTENT, { withFileTypes: true })) {
        if (!type.isDirectory()) continue
        const tp = path.join(FALSIFY_CONTENT, type.name)
        for (const e of readdirSync(tp, { withFileTypes: true })) {
          if (e.isDirectory() && e.name === targetId) return path.join(tp, e.name)
        }
      }
      return null
    })()
    if (targetDir === null) throw new Error(`找不到注入目标包目录：${targetId}`)
    const manifestPath = path.join(targetDir, 'manifest.json')
    const pristine = readFileSync(manifestPath, 'utf8') // 内存快照：还原靠覆写，0 次删除
    const restore = () => writeFileSync(manifestPath, pristine, 'utf8')
    const baseVerdict = judgeVocabLicenseRedistributable(base)
    console.log(`  注入目标：${targetId}（真实 ${JSON.stringify(base.find((b) => b.id === targetId).redistributable)}）\n`)

    /* —— 分支①：注入降级（redistributable: true ⇒ false）⇒ 必须判红 —— */
    {
      const obj = JSON.parse(pristine)
      obj.sources[0].license.redistributable = false
      writeFileSync(manifestPath, JSON.stringify(obj), 'utf8')
      const r = judgeVocabLicenseRedistributable(sampleVocabLicenses(FALSIFY_CONTENT))
      record(
        `断言 1：把 ${targetId} 降级成 redistributable:false ⇒ 判红`,
        r.verdict === 'FAIL',
        `verdict=${r.verdict}`,
      )
      record(
        '断言 2：判红消息点名该包（不是「有包坏了」这种无法定位的说法）',
        r.message.includes(targetId),
        `message=${r.message.slice(0, 140)}`,
      )
      restore()
    }

    /* —— 分支②：注入 UNKNOWN（**整键删掉**）⇒ 仍必须判红（fail-closed）—— */
    {
      const obj = JSON.parse(pristine)
      delete obj.sources[0].license.redistributable
      writeFileSync(manifestPath, JSON.stringify(obj), 'utf8')
      const r = judgeVocabLicenseRedistributable(sampleVocabLicenses(FALSIFY_CONTENT))
      record(
        `断言 3：把 ${targetId} 的 redistributable **整键删除**（UNKNOWN，非 false）⇒ 仍判红`,
        r.verdict === 'FAIL',
        `verdict=${r.verdict}（⛔ 若为 PASS 说明判据把「没写」当成了允许 —— 那正是本次要治的病）`,
      )
      restore()
    }

    /* —— 分支③：对照组。还原后源与磁盘逐字一致 ⇒ 必须判绿 —— */
    {
      const after = judgeVocabLicenseRedistributable(sampleVocabLicenses(FALSIFY_CONTENT))
      const real = judgeVocabLicenseRedistributable(sampleVocabLicenses(CONTENT_DIR))
      record(
        '断言 4：**对照组** —— 还原后副本回到基线（源与磁盘完全一致 ⇒ 判绿）',
        after.verdict === 'PASS' && after.message === baseVerdict.message,
        `verdict=${after.verdict}（基线 ${baseVerdict.verdict}）`,
      )
      record(
        '断言 5：真 content/ 判定与副本基线逐字一致（隔离副本未污染真实内容）',
        real.verdict === baseVerdict.verdict && real.message === baseVerdict.message,
        `真 content/ verdict=${real.verdict}；message 与基线${real.message === baseVerdict.message ? '一致' : '不一致'}`,
      )
    }

    verdict = bad === 0
  } catch (e) {
    console.error(`  ‼ 证伪自检自身异常（fail-closed，绝不当作通过）：${e?.message ?? e}`)
  }
  const total = assertions.length
  console.log('──────────────────────────────────────────────────────')
  if (verdict === true) {
    console.log(`content:validate 判据 23 Falsification：✅ PASS —— ${total}/${total} 断言通过（降级⇒判红 / UNKNOWN⇒判红 / 源与磁盘一致⇒判绿），真 content/ 未被写入`)
    return true
  }
  if (verdict === false) {
    console.error(`content:validate 判据 23 Falsification：❌ FAIL —— ${bad}/${total} 断言未过 ⇒ 判据 23 不可信`)
    return false
  }
  return null
}

/* ===== 判据 24 证伪自检：证明「源缺 license 段 ⇒ 判红」且「合规源 ⇒ 判绿」=====
 * ⚠️ 为什么必须有这一组：判据 24 是**新加的门**，而本项目的核心教训是
 *   「不会失败的门等于没有门」。只跑常规模式（3 个源都合规 ⇒ 全绿）**无法区分**
 *   「判据真的在咬」与「判据根本��触发 / 恒绿」—— 两者输出的 PASS 一模一样。
 *
 * 隔离副本放 node_modules/.tmp/（gitignore；真 content-source/ 与 content/ 只读、绝不被写）。
 * 注入方式是**覆写**（writeFileSync）而非删除 ⇒ 零删除计数，不触发 safe-delete shim。
 * 三条分支：① 删 license 段 ⇒ 判红；② 删 redistributable 键 ⇒ 判红（fail-closed 的第二重）；
 *          ③ 对照组（不注入的干净副本）⇒ 判绿。 */
function falsifyUnitSourceLicense() {
  console.log('[content:validate] 判据 24 证伪自检 —— 证明「源缺 license 段」会判红、且合规源判绿')
  const FALSIFY_DIR = path.join(ROOT, 'node_modules', '.tmp', 'content-source-falsify')
  const REAL = path.join(ROOT, 'content-source')
  let verdict = null
  let bad = 0
  const assertions = []
  const record = (name, pass, actual) => {
    assertions.push([name, pass, actual])
    if (pass) console.log(`  ✓ ${name}`)
    else { bad++; console.error(`  ✗ ${name} —— ${actual}`) }
  }
  try {
    rmSync(FALSIFY_DIR, { recursive: true, force: true }) // 1 次删除（常量目录，非按文件计）
    mkdirSync(FALSIFY_DIR, { recursive: true })
    cpSync(REAL, FALSIFY_DIR, { recursive: true })
    const names = readdirSync(FALSIFY_DIR).filter((n) => n.endsWith('.json')).sort()
    if (names.length === 0) throw new Error('content-source/ 下没有 .json 源文件，无法注入')
    const target = names[0]
    const targetPath = path.join(FALSIFY_DIR, target)
    const pristine = readFileSync(targetPath, 'utf8') // 内存快照：还原靠覆写，0 次删除
    const restore = () => writeFileSync(targetPath, pristine, 'utf8')

    // —— 分支③先跑（对照组）：未注入的干净副本必须判绿 ——
    const base = checkUnitSources(FALSIFY_DIR)
    record(
      '断言 1：**对照组** —— 未注入的干净副本 3 个源全部合规 ⇒ 判绿（证「它不是恒红门」）',
      base.problems.length === 0 && base.total === names.length,
      `problems=${base.problems.length}（${base.problems.slice(0, 2).join(';')}）total=${base.total}`,
    )

    // —— 分支①：删掉 license 段 ⇒ 必须判红 ——
    {
      const obj = JSON.parse(pristine)
      delete obj.license
      writeFileSync(targetPath, JSON.stringify(obj), 'utf8')
      const r = checkUnitSources(FALSIFY_DIR)
      record(
        `断言 2：把 ${target} 的**整个 license 段删掉** ⇒ 判红`,
        r.problems.length > 0,
        `problems=${r.problems.length}（若为 0 说明判据 24 根本不会因缺段变红）`,
      )
      record(
        '断言 3：判红消息点名该源文件与缺失的段（不是「有源坏了」这种无法定位的说法）',
        r.problems.some((p) => p.includes(target) && p.includes('license.')),
        `首条=${r.problems[0]?.slice(0, 120) ?? '(无)'}`,
      )
      restore()
    }

    // —— 分支②：只删 redistributable 键（license 段还在）⇒ 仍必须判红（fail-closed）——
    {
      const obj = JSON.parse(pristine)
      delete obj.license.vocabulary.redistributable
      writeFileSync(targetPath, JSON.stringify(obj), 'utf8')
      const r = checkUnitSources(FALSIFY_DIR)
      record(
        `断言 4：把 ${target} 的 license.vocabulary.redistributable **整键删除**（UNKNOWN，非 false）⇒ 仍判红`,
        r.problems.length > 0,
        `problems=${r.problems.length}（⛔ 若为 0 说明判据把「没写」当成了允许 —— 那正是要治的病）`,
      )
      restore()
    }

    // —— 隔离断言：真 content-source/ 未被写入，且判绿对照可复现 ——
    {
      const real = checkUnitSources(REAL)
      const after = checkUnitSources(FALSIFY_DIR)
      record(
        '断言 5：真 content-source/ 判定与副本基线逐字一致（隔离副本未污染真实源文件）',
        real.problems.length === 0 && after.problems.length === 0 && real.total === base.total,
        `真源 problems=${real.problems.length} total=${real.total}`,
      )
    }

    verdict = bad === 0
  } catch (e) {
    console.error(`  ‼ 证伪自检自身异常（fail-closed，绝不当作通过）：${e?.message ?? e}`)
  }
  const total = assertions.length
  console.log('──────────────────────────────────────────────────────')
  if (verdict === true) {
    console.log(`content:validate 判据 24 Falsification：✅ PASS —— ${total}/${total} 断言通过（缺段⇒判红 / UNKNOWN⇒判红 / 合规源⇒判绿），真 content-source/ 未被写入`)
    return true
  }
  if (verdict === false) {
    console.error(`content:validate 判据 24 Falsification：❌ FAIL —— ${bad}/${total} 断言未过 ⇒ 判据 24 不可信`)
    return false
  }
  return null
}

/* ===== 判据 25 证伪自检：证明「源漂移 ⇒ 判红」且「无源可比对 ⇒ 判红（fail-closed）」=====
 * ⚠️ 本组要证明的是**两件不同的事**，缺一不可：
 *   ① 内容漂移会红 —— 注入「改磁盘载荷的一个词条」，必须判红并点名该包；
 *   ② fail-closed —— 指向一个**不存在的** content-source/ 目录，必须判红，
 *      而不是「没有源就跳过」。假开的话，「把源删掉」就成了绕过判据 25 的后门。
 * 对照组（干净副本）必须判绿，证「它不是恒红门」。
 * 隔离副本在 node_modules/.tmp/（gitignore）；真 content/ 与 content-source/ 全程只读。
 * 还原用内存快照覆写（0 次删除），避开本机 safe-delete shim 的累计删除计数。 */
function falsifyUnitSourceDrift() {
  console.log('[content:validate] 判据 25 证伪自检 —— 证明「源与磁盘漂移」会判红、且「无源可比对」也判红')
  const TMP_ROOT = path.join(ROOT, 'node_modules', '.tmp', 'content-drift-falsify')
  const REAL_SOURCE = path.join(ROOT, 'content-source')
  let verdict = null
  let bad = 0
  const assertions = []
  const record = (name, pass, actual) => {
    assertions.push([name, pass, actual])
    if (pass) console.log(`  ✓ ${name}`)
    else { bad++; console.error(`  ✗ ${name} —— ${actual}`) }
  }
  try {
    // 隔离副本 = 真 content/ 的副本（源**不复制**：判据 25 允许源与内容根是两个独立路径）
    rmSync(TMP_ROOT, { recursive: true, force: true })
    mkdirSync(TMP_ROOT, { recursive: true })
    const COPY_CONTENT = path.join(TMP_ROOT, 'content')
    cpSync(CONTENT_DIR, COPY_CONTENT, { recursive: true })

    // —— 对照组：干净副本必须判绿 ——
    const base = checkUnitSourceDrift(REAL_SOURCE, COPY_CONTENT)
    record(
      `断言 1：**对照组** —— 干净副本 ${base.packages} 个包与源逐项一致 ⇒ 判绿（证「它不是恒红门」）`,
      base.problems.length === 0 && base.packages > 0,
      `problems=${base.problems.length}（${base.problems.slice(0, 2).join(';')}）packages=${base.packages}`,
    )

    // —— 分支①：改磁盘上一个包的载荷（模拟「源被改 / 包被手改」的漂移）⇒ 必须判红 ——
    const target = path.join(COPY_CONTENT, 'vocabulary', 'ielts-edu-01-vocab', 'words.json')
    const pristinePayload = readFileSync(target, 'utf8')
    {
      const words = JSON.parse(pristinePayload)
      words[0] = { ...words[0], translation: '被篡改的译文' }
      writeFileSync(target, JSON.stringify(words), 'utf8')
      const r = checkUnitSourceDrift(REAL_SOURCE, COPY_CONTENT)
      record(
        '断言 2：把磁盘上 ielts-edu-01-vocab 的**首个词条译文改掉** ⇒ 判红',
        r.problems.length > 0,
        `problems=${r.problems.length}（若为 0，说明判据 25 对载荷漂移根本不咬）`,
      )
      record(
        '断言 3：判红消息点名该包路径与「载荷与源不一致」（不是「有源坏了」这种无法定位的说法）',
        r.problems.some((p) => p.includes('ielts-edu-01-vocab') && p.includes('载荷与源不一致')),
        `首条=${r.problems[0]?.slice(0, 140) ?? '(无)'}`,
      )
      writeFileSync(target, pristinePayload, 'utf8') // 还原：覆写，0 次删除
    }

    // —— 分支②：fail-closed —— 源目录不存在 ⇒ 必须判红，而不是「跳过」——
    {
      const r = checkUnitSourceDrift(path.join(TMP_ROOT, 'no-such-source-dir'), COPY_CONTENT)
      record(
        '断言 4：content-source/ **不存在** ⇒ 判红（fail-closed，不是「没有源就跳过」）',
        r.problems.length > 0 && r.problems.some((p) => p.includes('fail-closed')),
        `problems=${r.problems.length}（⛔ 若为 0，说明「删掉源目录」能绕过判据 25 —— 那正是本判据要治的洞）`,
      )
    }

    // —— 分支③：源目录存在但为空 ⇒ 同样判红 ——
    {
      const EMPTY = path.join(TMP_ROOT, 'empty-source')
      mkdirSync(EMPTY, { recursive: true })
      const r = checkUnitSourceDrift(EMPTY, COPY_CONTENT)
      record(
        '断言 5：content-source/ 存在但**空** ⇒ 同样判红（没有源可比对 ≠ 校验通过）',
        r.problems.length > 0,
        `problems=${r.problems.length}`,
      )
    }

    // —— 隔离断言：真目录未被写入 ——
    {
      const restored = checkUnitSourceDrift(REAL_SOURCE, COPY_CONTENT)
      const real = checkUnitSourceDrift(REAL_SOURCE, CONTENT_DIR)
      record(
        '断言 6：还原后副本回到基线，且真 content/ 与真源判定不受影响（隔离副本未污染真实数据）',
        restored.problems.length === 0 && real.problems.length === 0,
        `还原后副本 problems=${restored.problems.length}；真目录 problems=${real.problems.length}`,
      )
    }

    verdict = bad === 0
  } catch (e) {
    console.error(`  ‼ 证伪自检自身异常（fail-closed，绝不当作通过）：${e?.message ?? e}`)
  } finally {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }) }
    catch (e) { console.warn(`  ⚠ 隔离副本清理失败（node_modules/.tmp，gitignore，不影响判定）：${e?.message ?? e}`) }
  }
  const total = assertions.length
  console.log('──────────────────────────────────────────────────────')
  if (verdict === true) {
    console.log(`content:validate 判据 25 Falsification：✅ PASS —— ${total}/${total} 断言通过（载荷漂移⇒判红 / 无源⇒判红 / 干净副本⇒判绿），真 content/ 与真源未被写入`)
    return true
  }
  if (verdict === false) {
    console.error(`content:validate 判据 25 Falsification：❌ FAIL —— ${bad}/${total} 断言未过 ⇒ 判据 25 不可信`)
    return false
  }
  return null
}

/* ===== 判据 26 证伪自检：证明「该有源而没有 ⇒ 判红」且「非脚手架包不被误伤」=====
 * ⚠️ 判据 26 的价值全在**反方向**（盘 ⇒ 源）：没有这条，「Unit-04 落了盘却忘了把源入库」没人会发现。
 *   而它最危险的失效形态是**误伤**——把 13 个词汇小包 / 8 个 demo-* 判成「缺源」。
 *   故本组两条方向都要证：
 *   ① 注入「造一个脚手架形态却无源的包」⇒ 判红（证明真能抓到漏源）；
 *   ② 对照组：真实仓库的 21 个非脚手架包全部不判红（证明不会误伤）。
 *   隔离方式：把 content/ 复制到 node_modules/.tmp/，只在副本里注入。 */
function falsifyUnitSourceReconcile() {
  console.log('[content:validate] 判据 26 证伪自检 —— 证明「有包无源」会判红、且「非脚手架包」不被误伤')
  const TMP_ROOT = path.join(ROOT, 'node_modules', '.tmp', 'content-reconcile-falsify')
  const REAL_SOURCE = path.join(ROOT, 'content-source')
  let verdict = null
  let bad = 0
  const assertions = []
  const record = (name, pass, actual) => {
    assertions.push([name, pass, actual])
    if (pass) console.log(`  ✓ ${name}`)
    else { bad++; console.error(`  ✗ ${name} —— ${actual}`) }
  }
  try {
    rmSync(TMP_ROOT, { recursive: true, force: true })
    mkdirSync(TMP_ROOT, { recursive: true })
    const COPY_CONTENT = path.join(TMP_ROOT, 'content')
    cpSync(CONTENT_DIR, COPY_CONTENT, { recursive: true })

    // —— 对照组：真实形态必须判绿，且**非脚手架包确实没被卷进来** ——
    const base = reconcileUnitSources(REAL_SOURCE, COPY_CONTENT)
    record(
      `断言 1：**对照组** —— 真实仓库 ${base.packages} 个脚手架形态包全部有源 ⇒ 判绿`,
      base.problems.length === 0 && base.packages === 9,
      `problems=${base.problems.length}（${base.problems.slice(0, 2).join(';')}）packages=${base.packages}（期望 9）`,
    )
    record(
      '断言 2：**不误伤对照组** —— 21 个非脚手架包（13 词汇小包 + 8 demo-*）一个都没被判成「缺源」',
      base.problems.length === 0,
      `⛔ 若为 >0，说明命名派生规则误伤了非脚手架包（判据 26 不可信）`,
    )

    // —— 分支①：造一个「脚手架形态却无源」的包 ⇒ 必须判红 ——
    const orphanDir = path.join(COPY_CONTENT, 'vocabulary', 'ielts-zzz-99-vocab')
    mkdirSync(orphanDir, { recursive: true })
    writeFileSync(path.join(orphanDir, 'manifest.json'), '{}\n', 'utf8')
    writeFileSync(path.join(orphanDir, 'words.json'), '[]\n', 'utf8')
    {
      const r = reconcileUnitSources(REAL_SOURCE, COPY_CONTENT)
      record(
        '断言 3：造一个**有包无源**的脚手架形态包（ielts-zzz-99-vocab）⇒ 判红',
        r.problems.length > 0,
        `problems=${r.problems.length}（若为 0，说明「落了盘却忘了入库」这条洞没被关上）`,
      )
      record(
        '断言 4：判红消息点名该包并说明「没有 packagePrefix 对应的源」（可定位、可行动）',
        r.problems.some((p) => p.includes('ielts-zzz-99-vocab') && p.includes('packagePrefix')),
        `首条=${r.problems[0]?.slice(0, 160) ?? '(无)'}`,
      )
      rmSync(orphanDir, { recursive: true, force: true }) // 1 次删除（单个注入目录，非按文件计）
    }

    // —— 分支②：fail-closed —— 源目录不存在 ⇒ 判红 ——
    {
      const r = reconcileUnitSources(path.join(TMP_ROOT, 'no-such-source-dir'), COPY_CONTENT)
      record(
        '断言 5：content-source/ 不存在 ⇒ 三方对账判红（fail-closed，无法对账 ≠ 对账通过）',
        r.problems.length > 0,
        `problems=${r.problems.length}`,
      )
    }

    // —— 隔离断言：真仓库不受影响 ——
    {
      const real = reconcileUnitSources(REAL_SOURCE, CONTENT_DIR)
      record(
        '断言 6：真 content/ + 真源判定判绿（隔离副本未污染真实数据）',
        real.problems.length === 0 && real.packages === 9,
        `真目录 problems=${real.problems.length} packages=${real.packages}`,
      )
    }

    verdict = bad === 0
  } catch (e) {
    console.error(`  ‼ 证伪自检自身异常（fail-closed，绝不当作通过）：${e?.message ?? e}`)
  } finally {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }) }
    catch (e) { console.warn(`  ⚠ 隔离副本清理失败（node_modules/.tmp，gitignore，不影响判定）：${e?.message ?? e}`) }
  }
  const total = assertions.length
  console.log('──────────────────────────────────────────────────────')
  if (verdict === true) {
    console.log(`content:validate 判据 26 Falsification：✅ PASS —— ${total}/${total} 断言通过（有包无源⇒判红 / 无源⇒判红 / 非脚手架包不误伤⇒判绿），真 content/ 与真源未被写入`)
    return true
  }
  if (verdict === false) {
    console.error(`content:validate 判据 26 Falsification：❌ FAIL —— ${bad}/${total} 断言未过 ⇒ 判据 26 不可信`)
    return false
  }
  return null
}

/* ===== 判据 27 证伪自检：**核心是「把单一真源的段列表改少一个」** =====��
 * ⚠️ 用户验收口径：把那个单一真源的段列表改少一个（比如去掉 exercise），
 *   断言「两处口径分叉」能被**某条机器判据**抓住 —— 而不是靠人看注释。
 *
 * 注入方式（**不改真仓库**）：把 `license-policy.mjs` 复制到 node_modules/.tmp/ 的隔离目录，
 * 在副本里删掉 exercise 段，然后用**带内容哈希的动态 import** 绕开 ESM 模块缓存读它。
 *   ⛔ 为什么能这样做：license-policy.mjs 只 import node: 内置 + ./canonical.mjs，
 *      故必须把 canonical.mjs 一并复制过去，相对 import 才解析得到（实测已验证）。
 *   ⛔ 为什么不 spawn 子进程跑脚本：本机 shim 下 spawn 会 EBUSY；且门禁里 spawn 生成器是更大的坑。
 *
 * 本组共 6 条断言，覆盖两种不同的「分叉」形态：
 *   ① **唯一副本自身被改少**（去掉 exercise）⇒ 判据 26 必须判红
 *      （3 个 exercise 包突然「没有源能生成它们」⇒ 盘 ⇒ 源方向断裂）。
 *      这正是「删一处、另一处跟着坏」的机器证据。
 *   ② **有人在消费方自建副本**（validate.mjs 里写回字面量）⇒ 判据 27 必须判红。
 *   ③ 对照组：真仓库判绿（证不是恒红门）。 */
async function falsifyUnitTypeSingleSource() {
  console.log('[content:validate] 判据 27 证伪自检 —— 证明「段类型口径分叉」会被机器判据抓住（不靠人看注释）')
  const TMP_ROOT = path.join(ROOT, 'node_modules', '.tmp', 'unit-type-lock-falsify')
  const REAL_LICENSE = path.join(ROOT, 'scripts', 'content', 'license-policy.mjs')
  const REAL_SOURCE_DIR = path.join(ROOT, 'content-source')
  let verdict = null
  let bad = 0
  const assertions = []
  const record = (name, pass, actual) => {
    assertions.push([name, pass, actual])
    if (pass) console.log(`  ✓ ${name}`)
    else { bad++; console.error(`  ✗ ${name} —— ${actual}`) }
  }
  try {
    // —— 对照组：真仓库判绿 ——
    const base = judgeUnitTypeSingleSource()
    record(
      `断言 1：**对照组** —— 真仓库三处消费方均无段类型副本 ⇒ 判绿（唯一副本 = ${base.segments.join(', ')}；证「它不是恒红门」）`,
      base.problems.length === 0,
      `problems=${base.problems.length}（${base.problems.slice(0, 2).join(';')}）`,
    )

    // —— 准备隔离副本：license-policy.mjs + canonical.mjs（相对 import 需要）——
    rmSync(TMP_ROOT, { recursive: true, force: true })
    mkdirSync(TMP_ROOT, { recursive: true })
    const isoLicense = path.join(TMP_ROOT, 'license-policy.mjs')
    const srcText = readFileSync(REAL_LICENSE, 'utf8')
    writeFileSync(path.join(TMP_ROOT, 'canonical.mjs'), readFileSync(path.join(ROOT, 'scripts', 'content', 'canonical.mjs'), 'utf8'), 'utf8')
    // ⛔ **只删 exercise 这一段**，其余逐字不动（注释、顺序、其它段全保留）
    const mutated = srcText.replace(
      /\n\s*Object\.freeze\(\{ type: 'exercise',[^\n]*\n/,
      '\n',
    )
    if (mutated === srcText) throw new Error('注入失败：未能在 license-policy.mjs 里定位到 exercise 段（源码形态变了？）')
    writeFileSync(isoLicense, mutated, 'utf8')

    // 带内容哈希的动态 import：绕开 ESM 模块缓存，确保读到的是**变异副本**
    const isoUrl = pathToFileURL(isoLicense).href
    const mod = await import(`${isoUrl}?v=${mutated.length}-${mutated.charCodeAt(0)}`)
    record(
      '断言 2：注入成功 —— 隔离副本的段表真的少了一段（exercise 不在 declared 里了）',
      !mod.UNIT_SOURCE_TYPES.includes('exercise') && mod.UNIT_SOURCE_TYPES.includes('vocabulary'),
      `副本 UNIT_SOURCE_TYPES = [${mod.UNIT_SOURCE_TYPES.join(', ')}]`,
    )

    // ③ **核心断言**：唯一副本少一段 ⇒ 必须有机器判据判红
    //    ⚠️ 实测记录（这正是证伪存在的意义）：第一版只查「判据 26 有没有红」，结果是 **problems=0** ——
    //      段表改小后 `-exercise` 包不再匹配任何 dirSuffix，被当成「非脚手架包」**排除出对账**，
    //      判据 26 反而全绿 ⇒ 真实假绿。门只校验「现状合法」、不校验「不该悄悄变」。
    //    故判据 27b 的**手写字面真值**才是那道锁：段表是契约，不许被顺手改小。
    {
      const r27 = judgeUnitTypeSingleSource(mod.UNIT_SOURCE_SEGMENTS)
      record(
        '断言 3：**把单一真源的段列表改少一个（去掉 exercise）⇒ 判据 27 判红**（不靠人看注释）',
        r27.problems.length > 0,
        `problems=${r27.problems.length}（⛔ 若为 0，说明「改一份」的后果没有任何机器判据会发现）`,
      )
      record(
        '断言 4：判红消息说明「段类型是契约」并给出期望/实得两份（可定位、可行动）',
        r27.problems.some((p) => p.includes('唯一副本被改动') && p.includes('exercise')),
        `首条=${r27.problems[0]?.slice(0, 160) ?? '(无)'}`,
      )
    }

    // ③-补：**记录**那个被实测证伪出来的假绿形态（判据 26 在段表改小后会失明）——
    //    这条断言的意义是「把已知盲区钉在案」，防止将来有人以为判据 26 能兜住段表漂移。
    {
      const r26 = reconcileUnitSources(REAL_SOURCE_DIR, CONTENT_DIR, mod.UNIT_SOURCE_SEGMENTS)
      record(
        '断言 4b：**已知盲区如实记录** —— 段表改小后判据 26 会把那 3 个 exercise 包排除出对账范围而判绿，'
        + '这正是判据 27b（手写真值）必须存在的原因（若将来判据 26 改成了能兜住，这条会红并提醒你更新此说明）',
        r26.problems.length === 0,
        `problems=${r26.problems.length}（若 >0，说明判据 26 已不再有这个盲区，可更新本条说明）`,
      )
    }

    // ④ 另一侧：判据 24 在变异段表下也会跟着少要一段 license（证明「单一副本驱动两层」）
    const fakeSrc = JSON.parse(readFileSync(path.join(REAL_SOURCE_DIR, 'unit-source-ielts-edu-01.json'), 'utf8'))
    delete fakeSrc.exercise // 同时删掉 exercise 段内容，使「已声明段」= 变异表口径
    const p24 = judgeUnitSourceLicense(fakeSrc, '(probe)', mod.UNIT_SOURCE_SEGMENTS)
    record(
      '断言 5：同一张变异段表也驱动判据 24 的「已声明段」（两层口径同源，不各持一份）',
      p24.length === 0,
      `problems=${p24.length}（源已去掉 exercise 段，按变异表就该只要求 vocabulary/reading 两段许可）`,
    )

    // ⑤ 反向：模拟「有人在消费方自建副本」⇒ 判据 27 的检测口径必须判红
    {
      // ⚠️ 夹具内容**必须现场拼出来**（join 出三个段名），⛔ 不得把三段名字面量写进本文件：
      //   否则判据 27 扫 validate.mjs 时会命中**这个夹具自己** ⇒ 对照组假红
      //   （首次实现即踩到：夹具里写死了 "const UNIT_SOURCE_TYPES = ['vocabulary','reading','exercise']"，
      //     被判据 27 如实判红 —— 判据没错，是夹具污染了被扫描的语料）。
      const fakeValidate = path.join(TMP_ROOT, 'validate-with-copy.mjs')
      const lit = `[${mod.UNIT_SOURCE_TYPES.map((t) => `'${t}'`).join(', ')}]`
      writeFileSync(fakeValidate, [
        "import { UNIT_SOURCE_SEGMENTS } from './license-policy.mjs'",
        `const UNIT_SOURCE_TYPES = ${lit}`,
        'export default UNIT_SOURCE_TYPES',
      ].join('\n'), 'utf8')
      // 直接复用判据 27 的正则对该副本判红（同一套口径，不另写一份判定）
      const fakeSrcCode = readFileSync(fakeValidate, 'utf8')
      const quoted = mod.UNIT_SOURCE_TYPES.map((t) => `['"]${t}['"]`).join('[^\\]]*')
      const literalRe = new RegExp('\\[[^\\]]*' + quoted + '[^\\]]*\\]')
      record(
        '断言 6：消费方**自建第二份字面量**（validate.mjs 里写回三段名字面量）⇒ 判据 27 的检测口径判红',
        literalRe.test(fakeSrcCode),
        `⛔ 若为 false，说明「有人偷偷再写一份」无人发现 —— 那正是本判据要治的病`,
      )
    }

    // —— 隔离断言：真 license-policy.mjs 未被改动 ——
    {
      const after = readFileSync(REAL_LICENSE, 'utf8')
      record(
        '断言 7：真 license-policy.mjs 逐字节未被改动（隔离副本未污染真实源）',
        after === srcText,
        `真实文件长度 ${after.length} vs 注入前 ${srcText.length}`,
      )
    }

    verdict = bad === 0
  } catch (e) {
    console.error(`  ‼ 证伪自检自身异常（fail-closed，绝不当作通过）：${e?.message ?? e}`)
  } finally {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }) }
    catch (e) { console.warn(`  ⚠ 隔离副本清理失败（node_modules/.tmp，gitignore，不影响判定）：${e?.message ?? e}`) }
  }
  const total = assertions.length
  console.log('──────────────────────────────────────────────────────')
  if (verdict === true) {
    console.log(`content:validate 判据 27 Falsification：✅ PASS —— ${total}/${total} 断言通过（真源少一段⇒判红 / 消费方自建副本⇒判红 / 真仓库⇒判绿），真 license-policy.mjs 未被写入`)
    return true
  }
  if (verdict === false) {
    console.error(`content:validate 判据 27 Falsification：❌ FAIL —— ${bad}/${total} 断言未过 ⇒ 判据 27 不可信`)
    return false
  }
  return null
}

// ⚠️ 这里用**顶层 await**（falsifyUnitTypeSingleSource 需要动态 import 读隔离副本的变异模块）。
//   故整段包进 async IIFE —— 直接在模块顶层 await 在 .mjs 里虽合法，但把它包起来能让
//   「非 falsify 分支走 main()」的路径保持完全同步，行为与改动前逐字一致。
;(async () => {
  if (process.argv.slice(2).includes('--falsify')) {
    // 七组证伪都跑，任一失败即整体失败。
    // ⚠️ 多个 falsify 函数都**返回**三态而不自己 process.exit —— 否则先跑的那个会把进程带走，
    //   后跑的那组永远不执行（证伪覆盖率静默下降，而输出看起来一切正常）。
    // ⚠️ falsifyUnitTypeSingleSource 是 **async**：整条链必须 await —— 早先用同步调用会拿到
    //   Promise（恒 truthy）而**假绿**，那正是本仓反复吃过的「看起来在测其实没测」形态。
    // 三态对齐 gate-license.mjs --falsify 惯例：0=全过 / 1=断言失败 / 2=自身异常。
    const r22 = falsifyBinaryMedia()
    const r18 = falsifyManifestSize()
    const r23 = falsifyVocabLicense()
    const r24 = falsifyUnitSourceLicense()
    const r25 = falsifyUnitSourceDrift()
    const r26 = falsifyUnitSourceReconcile()
    const r27 = await falsifyUnitTypeSingleSource()
    if (r22 === null || r18 === null || r23 === null || r24 === null || r25 === null || r26 === null || r27 === null) process.exit(2)
    process.exit(r22 && r18 && r23 && r24 && r25 && r26 && r27 ? 0 : 1)
  }
  else await main()
})().catch((e) => { console.error('[content:validate] 异常：', e.message); process.exit(1) })
