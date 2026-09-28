# 导入格式支持矩阵（IMPORT_FORMATS）

> 状态：🔄 混合（本文分节标注）
>
> ✅ **已有**：JSON（内容包链路，开发侧）+ 纯文本行 / JSON（用户自定义词库，浏览器侧）
> 📐 **待建**：CSV / TXT / MD / PDF / DOCX / SRT / VTT / LRC / MP3 / MP4 / Anki —— 全部未实现
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`src/lib/customBanks.ts`、`src/components/BankManager.tsx`、`scripts/content/*.mjs`、`scripts/build-*.mjs`

---

## 1. 一句话事实

**支持矩阵里 12 个格式，只有 2 条真实通道能进数据，其余 11 类全部为「未实现」。**

且必须区分两条链路 —— 它们的「支持」含义完全不同：

- **链路 A（内容包）**：输入恒为 `words.json`（JSON 数组）。所谓「CSV 支持」**不在应用内**，而是发生在**上游离线脚本**（`scripts/build-bank.mjs` 等读本地 `ecdict.csv`）—— 那是构建期的数据准备，不是产品能力。
- **链路 B（用户导入）**：唯一的运行时入口是 `parseWords()`（`customBanks.ts:50-84`），只认「JSON 数组」与「一行一个词」。

---

## 2. 支持矩阵总表

图例：✅ 已有（实测可用）｜🟡 有限支持（需内容恰好符合特定形状）｜❌ 未实现（零代码）

| # | 格式 | 用户侧（链路 B） | 内容侧（链路 A） | 证据 | 缺口说明 |
|---|---|---|---|---|---|
| 1 | **JSON** | ✅ 支持 | ✅ 支持（唯一输入） | `customBanks.ts:54-68`；`normalize.mjs:101` | 用户侧支持数组或 `{words:[...]}`；字段别名 `word/name`、`translation/meaning` |
| 2 | **纯文本行（word 释义）** | ✅ 支持 | ❌ 不适用 | `customBanks.ts:70-84` | 分隔符 `= , \| : ： \t 2+空格`；无释义行也收（`translation: ''`） |
| 3 | **CSV** | 🟡 有限（**仅当**恰好符合行格式） | ❌ 应用内无 | 见 §3 | 无 RFC 4180 解析器；带引号的多行字段会解析失败 |
| 4 | **TXT** | 🟡 有限（同上，`file.text()` 可读） | ❌ | `BankManager.tsx:135`（accept 列出） | accept 属性只过滤文件对话框，不做解析保证 |
| 5 | **MD** | 🟡 有限（同上） | ❌ | `BankManager.tsx:135` | Markdown 标记（`#`、`**`、`-`）会污染词形并被正则丢弃 |
| 6 | **PDF** | ❌ 未实现 | ❌ | 全仓零 PDF 解析依赖 | 无 pdf.js / pdf-parse；无 OCR |
| 7 | **DOCX** | ❌ 未实现 | ❌ | 全仓零 docx 依赖 | 无 mammoth / docx 解析 |
| 8 | **SRT** | ❌ 未实现 | ❌ | `find` 全仓零 `.srt` 文件；零解析器 | 字幕链路整体为零，见 `07-media/SUBTITLE.md` |
| 9 | **VTT** | ❌ 未实现 | ❌ | 同上 | 同上 |
| 10 | **LRC** | ❌ 未实现 | ❌ | 同上 | 同上 |
| 11 | **MP3（音频）** | ❌ 未实现 | ❌ | `find` 全仓零 `.mp3` | 见 `07-media/AUDIO.md` |
| 12 | **MP4（视频）** | ❌ 未实现 | ❌ | `find` 全仓零 `.mp4` | 见 `07-media/VIDEO.md` |
| 13 | **Anki（.apkg / .txt 导出格式）** | ❌ 未实现 | ❌ | 全仓零 anki 相关代码 | Anki 的 `.apkg` 是 SQLite 压缩包，需专门解析；导出的 tab 分隔 txt **可能**落入 #2 |

**统计：✅ 2 / ❌ 9 / 🟡 2**（🟡 是 ✅ 的下位集，不算独立能力）。

---

## 3. 🟡 CSV / TXT / MD 的真实能力边界（实测）

`BankManager.tsx:132-138` 的文件选择器：

```tsx
<input
  ref={fileRef}
  type="file"
  accept=".txt,.json,.csv,.md"
  className="hidden"
  onChange={(e) => e.target.files?.[0] && doFile(e.target.files[0])}
/>
```

**关键事实**：`accept` 属性**只影响文件对话框的默认筛选**，浏览器不保证、也不校验内容。真正决定「能不能解析」的是 `doFile`：

```tsx
const doFile = (file: File) => {
  file
    .text()                                    // ← 恒按 UTF-8 解码（BankManager.tsx:58）
    .then((txt) => {
      setRaw(txt)
      const words = parseWords(txt)            // ← 唯一解析入口
      if (words.length) { /* 落盘 */ }
      else { setMsg(t('bank.fileFail')) }
    })
    .catch(() => setMsg(t('bank.readFail')))
}
```

所以：**「.csv 被 accept 列出」≠「CSV 被解析」**。CSV 若恰好是「`word,translation` 一行一句」的简单形态，会走 `parseWords` 的逗号分支（`customBanks.ts:75` 的 `,` 分隔符）而成功；若含引号包裹、多行字段、BOM、表头，则：

| CSV 特征 | 结果 | 原因 |
|---|---|---|
| `abandon,放弃` | ✅ 成功 | 命中 `,` 分隔符分支 |
| `"hello, world",你好` | ❌ 词形解析错 | 无引号处理；`hello` 后的 `,` 被当分隔符 |
| 首行表头 `word,translation` | ⚠️ 表头被当词条 | `word` 是合法词形 ⇒ 混入一条脏数据 |
| 字段内含换行 | ❌ 拆成两行 | 按 `/\r?\n/` 切（`:71`） |
| 带 UTF-8 BOM | ⚠️ 首词多一个 `\uFEFF` | 无 BOM 剥离 |
| GBK 编码 | ❌ 乱码 → 全丢弃 | `file.text()` 恒 UTF-8 |

Markdown（`.md`）同理：`- abandon 放弃` 会因 `-` 开头（`^[A-Za-z]` 要求字母开头）被丢弃；`## 词汇表` 也被丢弃。**只有当 MD 里的正文行恰好是纯文本行格式时才能导入**。

---

## 4. ✅ 已有的解析实现（唯一一处）

`src/lib/customBanks.ts:50-84` 的 `parseWords()` —— 本项目**唯一**的用户输入解析器，84 行文件中的 35 行。

### 4.1 分支 1：JSON（`:54-68`）

```ts
if (text.startsWith('[') || text.startsWith('{')) {
  try {
    const data = JSON.parse(text)
    const arr = Array.isArray(data) ? data : data.words ?? []
    return arr.map(...).filter((w: WordItem) => /^[A-Za-z][A-Za-z'\- ]*$/.test(w.word))
  } catch {
    return []          // ← 静默返回空数组
  }
}
```

支持形态（`【实测·代码可读】`）：

| 输入 JSON | 结果 |
|---|---|
| `[{"word":"a","translation":"甲"}]` | ✅ |
| `[{"name":"a","meaning":"甲"}]` | ✅（别名） |
| `["a","b"]` | ✅（字符串数组，`translation` 为空） |
| `{"words":[{"word":"a"}]}` | ✅ |
| `{"items":[...]}` | ❌ 空数组（只认 `words` 键） |
| 非法 JSON | ❌ 空数组，无错误提示原因 |

### 4.2 分支 2/3：行文本（`:70-84`）

分隔符正则（`:75`）：

```ts
/^([A-Za-z][A-Za-z'\- ]*?)\s*(?:=|,|\||:|：|\t| {2,})\s*(.+)$/
```

| 输入行 | 解析结果 |
|---|---|
| `abandon = 放弃` | `{word:'abandon', translation:'放弃'}` |
| `abandon,放弃` | 同上 |
| `abandon:放弃` / `abandon：放弃` | 同上 |
| `abandon\|放弃` | 同上 |
| `abandon    放弃`（2+ 空格） | 同上 |
| `abandon 放弃`（**1 个空格**） | 走 `:77-80` 的分支 → `{word:'abandon', translation:'放弃'}` |
| `abandon`（无释义） | `{word:'abandon', translation:''}` |

**词形约束**（`:64` 与 `:83` 各一次）：`/^[A-Za-z][A-Za-z'\- ]*$/` —— 只接受 ASCII 字母 / 撇号 / 连字符 / 空格，且必须以字母开头。含重音符号（`café`）、中日韩字符、数字开头的词全部丢弃。

---

## 5. 📐 待建：格式支持的规划建议

> 以下全部为**建议**，非实测事实。当前代码零实现。

### 5.1 建议的支持优先级

按「实现成本 / 用户收益」排序（**建议**，来自缺口分析而非实测）：

| 优先级 | 格式 | 理由 | 建议实现方式 |
|---|---|---|---|
| P1 | CSV（完整 RFC 4180） | 用户导出的词表最常见 | 约 60 行手写状态机，或引入 `papaparse`（~45 KB min） |
| P1 | Anki 导出 txt（tab 分隔） | Anki 用户的迁移路径 | 几乎零成本：现有 `\t` 分支已可解析，只需处理 `#separator:` 元数据行 |
| P2 | TXT（半结构化：音标/词性/例句） | 提升导入质量 | 需引入字段识别启发式 |
| P2 | 编码探测（GBK/BIG5） | 中文用户痛点 | 引入 `TextDecoder('gbk')`（浏览器原生，零依赖） |
| P3 | SRT / VTT / LRC | 依赖字幕链路先建 | 见 `07-media/SUBTITLE.md` |
| P4 | PDF / DOCX | 需要字体与版式处理，成本高 | `pdf.js`（~1 MB）/ `mammoth`（~200 KB） |
| P4 | MP3 / MP4 | 依赖媒体链路 | 见 `07-media/MEDIA_PIPELINE.md` |
| ❌ | `.apkg` | SQLite 压缩包，需 WASM sqlite | 不建议自研 |

### 5.2 建议的统一中间表示

无论来源格式是什么，建议全部先转为**同一中间形状**再入库（**建议**）：

```ts
interface ParsedEntry {
  word: string
  translation: string
  phonetic?: string
  definition?: string
  /** 来源定位（文件 + 行号），用于错误提示与去重归因 */
  origin?: { file: string; line: number }
}
```

这个形状**恰好等于**内容层白名单（`normalize.mjs:46` 的 `FIELD_WHITELIST`；**P1.6-E** 起为 4 个字段，原 `partOfSpeech` 因全库零数据已移除），从而让「用户导入」与「内容包」共享字段语义。

### 5.3 建议的格式探测策略

**不依赖扩展名与 MIME**（两者都不可信），建议按内容嗅探（**建议**）：

```
1. 剥离 BOM，尝试 TextDecoder('utf-8', { fatal: true }) → 失败则试 gbk
2. 首非空白字符是 [ 或 { → JSON 分支
3. 含 SRT/VTT/LRC 时间轴标记（--> / [mm:ss.xx]） → 字幕分支
4. 含 tab 且首行以 # 开头（Anki 元数据） → Anki 分支
5. 含逗号且各行列数一致 → CSV 分支
6. 否则 → 行文本分支
```

### 5.4 与需求文档对照

需求文档提到的 Anki、SRT/VTT/LRC 均未实现（§2 表 #8-10、#13）。若这些是 P1 目标，建议**先建字幕链路**（`07-media/SUBTITLE.md`），因为 SRT/VTT/LRC 的解析器属于该链路而非导入链路。

---

## 6. 结论

- **实测支持：JSON ✅ + 纯文本行 ✅**，两者共用 `parseWords()` 35 行实现。
- **`accept=".txt,.json,.csv,.md"` 造成困惑**：它列出 4 种扩展名但只有 1 个解析器 ⇒ `.csv`/`.md` 的成功率取决于内容是否恰好落入行格式。
- **9 个格式零实现**：PDF/DOCX/SRT/VTT/LRC/MP3/MP4/Anki(.apkg) + 完整 CSV。
- **无编码探测**是中文用户的直接痛点：GBK 文件会静默变成空数组。
- **规划建议**见 §5，全部标注为建议而非事实。
