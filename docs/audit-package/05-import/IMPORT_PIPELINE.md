# 导入流水线（IMPORT_PIPELINE）

> 状态：✅ 已有（实测）
>
> ✅ **已有**：内容包 JSON 的五阶段流水线 —— Raw → Normalize → Validate → Canonical → Build，全部有真实脚本、可重复运行、有退出码门禁
> 📐 **待建**：面向「用户上传」的流水线 —— 当前流水线是**开发者/CI 侧**的离线批处理，不接受任何用户提交
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`scripts/content/{normalize,validate,canonical,build,list}.mjs`、`content/README.md`、根目录 `package.json`

---

## 1. 一句话事实

**流水线是真实存在的，但它服务的是「仓库维护者把外部词表并入库」，不是「用户上传自己的内容」。**

两者不能混为一谈：

| 维度 | 现有流水线（✅ 已有） | 用户上传流水线（📐 待建） |
|---|---|---|
| 触发者 | 开发者 / CI | 终端用户 |
| 输入 | 已在仓库内的 `words.json` | 用户设备上的任意文件 |
| 运行位置 | 本机 Node / GitHub Actions | 浏览器（无后端）或未来服务端 |
| 产物 | 回写 `content/vocabulary/<id>/manifest.json` | 用户私有词库（localStorage） |
| 校验强度 | 20 项门禁 + `exit 1` | **无任何校验**（仅前端正则过滤） |

现有流水线的真实入口是 `package.json` 的 npm scripts（实测 `package.json` scripts 段）：

```json
"content:normalize": "node scripts/content/normalize.mjs",
"content:build": "node scripts/content/build.mjs",
"content:validate": "node scripts/content/validate.mjs",
"content:check": "node scripts/content/validate.mjs",
"content:list": "node scripts/content/list.mjs",
"check:bundle": "node scripts/check-bundle.mjs"
```

---

## 2. ✅ 已有：五阶段流水线全景

`content/README.md:352-364` 给出的官方顺序是：

```
Raw → Normalize → Validate → Build → Index → Manifest → Content Registry → Query
```

但**实际落地的可执行脚本只有 5 个**（Normalize / Validate / Canonical / Build / List），其中 `Canonical` 是被 Normalize 与 Build 共享的**序列化基石**而不是一个独立阶段命令。`Index` 不是脚本 —— 它是运行时（`src/core/content/index/content-index.ts`）的懒构建行为。因此**实际可跑的流水线是 5 个脚本阶段**：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  阶段 0            阶段 1              阶段 2            阶段 3      阶段 4  │
│  Raw      ──▶     Normalize     ──▶    Validate   ──▶   Build   ──▶   List   │
│  (人工落盘)        (normalize.mjs)      (validate.mjs)  (build.mjs)  (list)  │
└─────────────────────────────────────────────────────────────────────────────┘
       │                   │                    │              │            │
       │                   │                    │              │            │
   words.json        规范化 + 问题检测     20 项门禁      派生 manifest   清单展示
   手写 / 脚本生成    ─ 不代改 ─           FAIL=exit 1    ─ 幂等 ─
        
                    ▲                    ▲              ▲
                    └────────────────────┴──────────────┘
                          共享 canonical.mjs（序列化与指纹唯一实现）
```

### 2.1 阶段职责与真实函数

| 阶段 | 脚本 | 关键函数/行号 | 输入 | 输出 | 退出码 |
|---|---|---|---|---|---|
| 0 Raw | —（人工） | — | — | `content/vocabulary/<id>/words.json` | — |
| 1 Normalize | `scripts/content/normalize.mjs`（187 行） | `normalizeText()` `:60-69`、`dupKey()` `:72-74` | `words.json` | 规范化后 `words.json`（仅 `--write`） | 有问题 → `exit 1` `:180-183` |
| 2 Validate | `scripts/content/validate.mjs`（428 行） | `main()` `:107-425`，20 项在 `:137-421` | `manifest.json` + `words.json` + `registry.ts` 文本 | 控制台 PASS/FAIL | 任一 FAIL → `exit 1` `:423` |
| 3 Canonical | `scripts/content/canonical.mjs`（135 行） | `canonicalize()` `:54-71`、`sha256Canonical()` `:81-83`、`canonicalFile()` `:89-91` | 任意 JSON 值 | 稳定序列化字符串 / 指纹 | 自检失败抛异常 `:95-120` |
| 4 Build | `scripts/content/build.mjs`（215 行） | `main()` `:87-212`、`migrateSources()` `:78-85`、`namespaceOf()` `:49` | `manifest.json` + `words.json` | 回写 `manifest.json`（派生全部） | 异常 → `exit 1` `:214` |
| 附 List | `scripts/content/list.mjs`（59 行） | `main()` `:16-57` | 全部 manifest | 表格 / `--json` | 异常 → `exit 1` `:59` |

### 2.2 阶段 1 · Normalize（`scripts/content/normalize.mjs`）

**目的**（文件头 `:1-6` 原文）：外来词表（ECDICT 导出、CSV、网页抓取）常带全角空格 / HTML 标签 / 实体 / 大小写与空白差异，直接入库会让「同一个词」在包里出现多次、或让 checksum 因无关空白漂移。

规范化规则（`normalizeText()`，`:60-69`），**作用于 `word / translation / phonetic / definition`**（`TEXT_FIELDS`，`:48`；`partOfSpeech` 是枚举型不做清洗）：

```
NFC 归一 (s.normalize('NFC'))
  → 剥离 HTML 标签  s.replace(/<[^>]*>/g, '')          :64
  → 解码实体        &lt; &gt; &quot; &#39; &nbsp; &amp;  :50-54, :65
  → 空白折叠        WS_RE = /[\s\u00A0]+/g → 单空格    :55, :67
  → 删控制字符      CONTROL_RE = /[\u0000-\u001F\u007F]/g  :56, :67
  → trim
```

顺序有讲究（`:11-12` 注释）：**实体解码必须在折叠/删除之前**，否则剥离标签留下的空白会残留在词形里。

**只检测、不代改**（`:20-26`、`:153-155`）—— 三类问题报出但脚本不改：

| 检测项 | 代码位置 | 判定 |
|---|---|---|
| 包内重复 normalized word | `:139-143` | `dupKey` = NFC + lowercase + 空白折叠 |
| 空 word / 空 translation | `:136-137` | 规范化后为空串 |
| 非法字段 | `:132-134` | 不在白名单 `word/translation/phonetic/definition/partOfSpeech`（`:46`） |

**代码词库例外**（`:14-18`、`:105-111`）：`ts-code` / `go-code` 必须在 manifest 声明 `"normalize": { "stripHtml": false }`，否则泛型 `type Handler<T>`、JSX `<div className="app">`、`<List />` 会被 `<[^>]*>` 当标签删掉 —— **实测 5 条命中**（`:16`）。

**与 checksum 同源**（`:29-32`、`:166`）：`--write` 一律用 `canonicalFile()` 落盘，与 `content:build` / `content:validate` 的 `sha256Canonical` 是同一份序列化实现。

用法（`:34-35`）：`node scripts/content/normalize.mjs [包id...] [--write]` — 不给包 id = 全部包；**默认干跑**，`--write` 才回写。

### 2.3 阶段 2 · Validate（`scripts/content/validate.mjs`）

20 项门禁，逐条见 `IMPORT_VALIDATION.md`。此处只记**门禁的输入依赖**：除 `manifest.json` / `words.json` 外，第 20 项还需要读 **`src/core/content/registry.ts` 的源码文本**（`REGISTRY_TS`，`:52`；`registryLoadMode()`，`:75-88`），因为「manifest 声明的 offline.policy」必须与「registry 实际加载方式」一致，而 Node 跑不了 TS。

退出码（`:423-424`）：任一 FAIL → `console.error` 汇总 + `process.exit(1)`；全绿 → `PASS`。

### 2.4 阶段 3 · Canonical（`scripts/content/canonical.mjs`）

这不是「一步命令」，而是被 Normalize 与 Build 共享的**序列化与指纹唯一实现**（文件头 `:1-8`）。它存在的理由（`:4-8` 原文）：`build.mjs` 原先拿 words.json **文件原文**算 sha256，`validate.mjs` 拿 `JSON.stringify(words)` 算 —— 只要文件被格式化，checksum 就漂移 ⇒「内容没变」被误判成「内容变了」。

核心 API：

| 函数 | 行号 | 作用 |
|---|---|---|
| `canonicalize(value)` | `:54-71` | 规范序列化（紧凑、无尾随换行、与排版无关） |
| `sha256Canonical(value)` | `:81-83` | 内容指纹，返回 `'sha256:' + hex` |
| `canonicalFile(value)` | `:89-91` | 落盘形态 = `canonicalize()` + 尾随 `\n` |
| `selfCheck()` | `:95-120` | 幂等 + 数组不重排 + 指纹与排版无关 |

**三条硬规则**：

1. **数组保持原顺序，绝不重排**（铁律 1，`:11-14`、`:57`）—— 词表顺序 = 产品语义（词频序 / 教材序 / 难度梯度）。自检断言 `:112-114`：`canonicalize([{word:'z'},{word:'a'}]) === '[{"word":"z"},{"word":"a"}]'`。
2. **对象键按白名单序**（`CANONICAL_FIELD_ORDER`，`:36`）：`word → translation → phonetic → definition → partOfSpeech`；白名单外未知键按 UTF-16 字典序排后（`orderedKeys()`，`:42-47`）。
3. **留痕** —— 值为 `undefined` 的键省略；`null` 保留（`:43`）。

自检可直接跑：`node scripts/content/canonical.mjs`（`:122-134`，无 npm script 包装）。

### 2.5 阶段 4 · Build（`scripts/content/build.mjs`）

**manifest 由数据自动派生，杜绝人工维护漂移**（文件头 `:1`）。它做 5 件事（`:3-24`）：

| # | 事项 | 代码位置 |
|---|---|---|
| ① | checksum 存完整 SHA-256 | `:102` |
| ② | `stats.items/phonetic/definition` 由 `words.json` 计算后回写 | `:181-186` |
| ③ | V4.1 manifest 迁移：`source{}` → `sources[]`、license 结构化、`bank:x` → 4 段式 ContentId | `:78-85`、`:98` |
| ④ | 版本字段 `schemaVersion` + `contentVersion` | `:52-55`、`:125-160` |
| ⑤ | Contract Hardening：checksum 统一走 canonical + 版本三元组 + `canonicalFile` 落盘 | `:14-24`、`:194-209` |

**幂等**（`:26-27`、`:139-144`、`:194`）：用 `canonicalize` 的语义比较，**不用 `JSON.stringify` 直比** —— 后者对键序敏感，而 `canonicalFile` 会把 manifest 顶层键排序后再落盘。内容与上次记录一致时（`contentChecksum === checksum`）revision/version/publishedAt/builtAt **一个字节都不改**（铁律 2，`:113-115`）。

**namespace 每包唯一**（`SOURCE` 表，`:45-49`）：规则 `${来源族}-${包 id}`（`ecdict-ielts`、`curated-ai-core`）。`namespaceOfId()` `:70-71` 从最终 ContentId **反解**而不是重算，保证 `manifest.namespace` 与 `manifest.id` 永远同源。

用法：`node scripts/content/build.mjs`（无参数，处理全部包）。

### 2.6 附 · List（`scripts/content/list.mjs`）

只读展示，不改数据。`node scripts/content/list.mjs [--json]`。实测输出（2026-09-27）：

```
✓ ai-core          43 words  v1.0.0  []                    -     self  inline content:vocabulary:curated-ai-core:ai-core
✓ cet4             84 words  v1.0.0  [phonetic,definition] CET-4 MIT   inline content:vocabulary:ecdict-cet4:cet4
✓ cet6             69 words  v1.0.0  [phonetic,definition] CET-6 MIT   inline content:vocabulary:ecdict-cet6:cet6
✓ cloud-native     30 words  v1.0.0  []                    -     self  inline content:vocabulary:curated-cloud-native:cloud-native
✓ frontend         20 words  v1.0.0  []                    -     self  inline content:vocabulary:curated-frontend:frontend
✓ go-code          50 words  v1.0.0  []                    -     self  inline content:vocabulary:curated-go-code:go-code
✓ ielts          3000 words  v1.0.0  [phonetic,definition] IELTS MIT   lazy   content:vocabulary:ecdict-ielts:ielts
✓ kaoyan         3000 words  v1.0.0  [phonetic,definition] 考研  MIT   lazy   content:vocabulary:ecdict-kaoyan:kaoyan
✓ toefl          3000 words  v1.0.0  [phonetic,definition] TOEFL MIT   lazy   content:vocabulary:ecdict-toefl:toefl
✓ ts-code          50 words  v1.0.0  []                    -     self  inline content:vocabulary:curated-ts-code:ts-code
────────────────────────────────────────────────────────────────────────────────
total: 10 packages / 9346 words
```

---

## 3. ✅ 已有：完整操作序列（实测自 `content/README.md:462-473`）

```
1) 落数据     content/vocabulary/<id>/words.json（最小形状 word + translation）
2) 写骨架     manifest.json 只写展示字段
3) 规范化     npm run content:normalize -- <id> --write
4) 派生       npm run content:build      # id / packageId / namespace / stats / checksum / 版本三元组 / history / build
5) 门禁       npm run content:validate   # 20 项
6) 登记       src/core/content/registry.ts 的 packages 数组
              词数 > 1000 或 words.json > 64 KiB ⇒ 必须 lazy
7) 验证       npm run test:content / npm run check:bundle / npm run test:e2e
```

第 6 步是**唯一的手工环节**（`registry.ts:58-69` 的 `packages` 数组），也是门禁第 20 项存在的理由 —— 两边改漏就会静默破坏首屏体积契约。

---

## 4. 📐 待建：用户上传流水线（规划）

> 以下全部为**建议**，非实测事实。当前代码中**没有任何一行**实现这些内容。

### 4.1 建议的流水线形态

用户上传与仓库导入是**两条不同的链路**，不能复用同一套门禁（用户上传无法跑 `exit 1`，也无法人工复核）：

```
用户文件 ──▶ [浏览器] 解析 ──▶ 规范化 ──▶ 轻量校验 ──▶ 预览 ──▶ 用户确认 ──▶ localStorage
              │                 │            │                     │
        （File.text()）   （复用规则）  （不 exit，只提示）   （回滚点）
```

### 4.2 为什么不能直接把现有脚本搬进浏览器

| 障碍 | 实测依据 |
|---|---|
| 现有脚本是 Node ESM，依赖 `node:fs/promises` / `node:crypto` / `node:path` | `normalize.mjs:37-40`、`validate.mjs:44-47`、`build.mjs:30-33` |
| `validate` 第 20 项要在文件系统里读 `registry.ts` | `validate.mjs:52`、`:125` |
| 用户上传的产物是「用户私有词库」（localStorage），不是 `content/vocabulary/` 下的包 | `customBanks.ts:3`（`KEY = 'gt.customBanks.v1'`） |
| 无后端 ⇒ 无法做「服务端复核 + 入库」 | 仓库为纯静态站，无 API 层 |

### 4.3 建议的实现路径（分三步，不在本次交付范围内）

| 步骤 | 内容 | 依赖 |
|---|---|---|
| S1 | 抽出**平台无关**的规范化核心（把 `normalizeText` / `dupKey` 移到可被浏览器复用的模块），现有脚本改为调用它 | 不改变现有行为；需回归 `content:normalize` 输出与 checksum |
| S2 | 浏览器侧 `parseWords`（`customBanks.ts:50-84`）升级为「解析 + 规范化 + 去重报告」，复用 S1 的核心 | 保持 localStorage 键不变 |
| S3 | 需要「多设备同步 / 大文件 / 版权复核」时再引入服务端（建议 Cloudflare Workers + D1/R2） | 需新架构，见 `12-infrastructure/*` |

### 4.4 与 07-media 流水线的关系

`07-media/MEDIA_PIPELINE.md` 描述的是**媒体（音视频/字幕）**的处理流水线，与本文件的「文本词表」流水线是两条独立链路。两者共享的只有基础原则（规范化、checksum、版本），实现不共享。

---

## 5. 实测命令与结果（可复核）

```bash
# 干跑规范化（不落盘）
npm run content:normalize

# 派生 manifest（幂等，无变化时输出「无变化」）
npm run content:build

# 20 项门禁
npm run content:validate

# 包清单
npm run content:list

# canonical 自检（无 npm 包装）
node scripts/content/canonical.mjs
```

---

## 6. 结论

- **已有**：五阶段流水线真实、可重复、有退出码。它是本项目**最严谨的部分之一** —— 尤其 `canonical.mjs` 把「序列化」与「指纹」收敛到唯一实现，解决了「格式化一下就被判成内容变了」的经典漂移问题。
- **待建**：与需求文档强调的「把素材导入做成核心能力」相比，现有流水线**只覆盖了维护者侧，完全没有用户侧**。用户能做的只有「粘贴纯文本」这一条窄路径（见 `IMPORT_FORMATS.md`），且**零校验**。
- **差距**：需求文档所说的「导入体系」若指用户上传，则本项目当前完成度接近 0；若指内容入库工程化，则本项目完成度较高。**审计时须先明确这一区分**，否则会得出完全相反的结论。
