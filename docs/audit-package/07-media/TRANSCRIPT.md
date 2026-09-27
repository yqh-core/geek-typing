# 转写（TRANSCRIPT）

> 状态：📐 待建
>
> 📐 **待建**：转写能力 —— **零实现，零文件，零 ASR 集成**
> ✅ **已有**（相关但独立）：TTS **输出**能力（Web Speech API 朗读单词）、`AssetKind` 中的 `'document'` 取值
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：全仓实测、`src/lib/speech.ts`、`content/README.md:232`

---

## 1. 一句话事实

**转写（transcript）是「音频/视频 → 文本」的能力，本项目零实现。**

**但有一个容易混淆的点必须先澄清**：本项目有 **TTS（文本 → 语音）**，方向**相反**：

| 能力 | 方向 | 现状 |
|---|---|---|
| **TTS**（Text-to-Speech） | 文本 → 语音 | ✅ 已有（`speech.ts` 单词朗读） |
| **ASR**（Automatic Speech Recognition） | 语音 → 文本 | 📐 零实现 |
| **转写**（transcript） | 语音 → **带时间轴的文本** | 📐 零实现 |

**「有朗读能力」不等于「有转写能力」。** 本项目只有前者。

---

## 2. 📐 零实现清单（逐项实测）

| 能力 | 现状 | 实测依据 |
|---|---|---|
| ASR / 语音识别 | ❌ 无 | `grep -rn "SpeechRecognition\|webkitSpeechRecognition\|whisper\|asr"` 无命中 |
| 转写文件 | ❌ 0 个 | `find` 无 `.txt` / `.json` 转写产物 |
| 转写字段 | ❌ 无 | 全库词条无 `transcript` 字段 |
| 转写内容类型 | ❌ 无 | `PLANNED_TYPES` 无 `transcript`（见 §3.2） |
| 转写 ↔ 时间戳 | ❌ 无 | 无任何时间轴结构 |
| 转写 ↔ 音频对齐 | ❌ 无 | 无音频资源（见 `AUDIO.md`） |
| 转写 ↔ 字幕互转 | ❌ 无 | 无字幕（见 `SUBTITLE.md`） |
| 转写 ↔ 词条关联 | ❌ 无 | 无 `relations.json` |
| 音频批量转写流水线 | ❌ 无 | 无脚本 |

### 2.1 与 `speech.ts` 的关键区别

`src/lib/speech.ts` 使用 `window.speechSynthesis`（**语音合成**），而非 `SpeechRecognition`（**语音识别**）：

```ts
export function speak(word: string, rate = 0.85) {
  if (!speechSupported() || !word) return
  const u = new SpeechSynthesisUtterance(word.replace(/[-_]/g, ' '))   // ← 合成，非识别
  ...
  window.speechSynthesis.speak(u)
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window   // ← 检测合成支持
}
```

**两个 API 是独立的**：

| API | 方向 | 浏览器支持 | 本项目 |
|---|---|---|---|
| `speechSynthesis` | 文本 → 语音 | Chrome/Edge/Safari/Firefox 均支持 | ✅ 已用 |
| `SpeechRecognition` | 语音 → 文本 | **Chrome/Edge 支持；Firefox 不支持；Safari 部分** | ❌ 未用 |

> 📌 **`SpeechRecognition` 在浏览器端的支持度远不如 `speechSynthesis`**，且在 Chrome 上依赖云端服务（需要网络）。**这解释了为什么本项目只做了 TTS 而没做 ASR** —— 前者是纯本地能力，后者不是。

---

## 3. 已有的「间接预留」

### 3.1 `AssetKind` 的 `'document'`

`content/README.md:241`：

```ts
AssetKind = 'audio' | 'image' | 'document' | 'subtitle' | 'other'
```

**没有 `transcript` 取值。** 转写若接入，可能归入：

| 方案 | 说明 | 评价 |
|---|---|---|
| `document` | 转写是文本文件 | 🟠 语义宽泛，但可行 |
| `subtitle` | 转写若带时间轴，本质等同字幕 | 🟠 时间轴精度要求不同（转写常需词级时间戳，字幕只需句级） |
| **扩展 `AssetKind` 加 `'transcript'`** | 显式区分 | 🟢 **建议**（转写与字幕的精度与用途不同） |

### 3.2 `Audio` 类型的 `transcript` 字段（规划，未落地）

`content/README.md:231`（内容类型特有字段表）：

| 类型 | 特有字段 |
|---|---|
| Audio | `audioUrl / duration / **transcript** / segments / speaker / difficulty` |

**注意 `transcript` 与 `segments` 是两个独立字段**：

| 字段 | 语义（推断） |
|---|---|
| `transcript` | **纯文本**全文 |
| `segments` | **带时间轴的分段**（≈ `SUBTITLE.md` §4.1 的 `SubtitleSegment[]`） |

**这暗示了设计者的模型**：转写（纯文本）+ 分段（时间轴）分离。**这是一个合理的分层**：

```
音频/视频
   ├─ transcript（纯文本，用于搜索/复制/生词比对）
   └─ segments（带时间轴，用于同步播放/跳转）
```

**建议**（📐）：`segments` 与 `SubtitleSegment` **应是同一模型**（避免两套时间轴结构），`transcript` 则是 `segments.map(s => s.text).join(' ')` 的派生量 —— 即**不建议把 `transcript` 作为独立存储字段**（会产生「两个真相」），除非需要表达分段之外的元信息（如说话人总览）。

### 3.3 与 `listening` 类型的关系

`PLANNED_TYPES`（`catalog.ts:52-64`）含 `'listening'`：

```ts
const PLANNED_TYPES = [
  'vocabulary', 'listening', 'reading', 'audio', 'topic',
  'exercise', 'writing', 'speaking', 'grammar', 'document', 'collection',
]
```

**`listening` 与 `audio` 都在槽位中**，但 `packages=0 / items=0`（`04-content/CONTENT_TYPES.md` 实测）。

**`listening` 是转写最自然的归属类型** —— 听力材料的转写是听力题的基础（听写、填空、理解题都需要文本）。

---

## 4. 📐 建议：转写能力设计

> 以下全部为**建议**，非实测事实。当前零实现。

### 4.1 建议的两个来源（区分「已有转写」与「生成转写」）

| 来源 | 说明 | 成本 |
|---|---|---|
| **A. 素材自带转写** | 字幕文件（SRT/VTT）本身即转写；播出方提供的 transcript | 🟢 低（只需解析） |
| **B. 自动生成转写（ASR）** | 用 ASR 把音频转成文本 | 🔴 高（需 ASR 服务/模型） |

**建议优先 A**（📐）：若素材自带字幕（大量公开课、CC 授权视频都有 VTT），**从 VTT 派生转写是零成本的** —— 只需把 `SubtitleSegment[]` 的 `text` 拼接或保留分段。

**这样可以让「转写」能力先落地，而不必先解决 ASR。**

### 4.2 建议的 ASR 方案对比

若确实需要 B（自动生成），**建议**评估以下方案：

| 方案 | 运行位置 | 成本 | 隐私 | 评价 |
|---|---|---|---|---|
| **浏览器 `SpeechRecognition`** | 客户端 | 免费（Chrome 走云端） | 🟠 音频上传至浏览器厂商 | 🟠 支持度差（Firefox 不支持）、需网络、精度一般 |
| **云端 ASR API**（OpenAI Whisper API / 阿里云 / 讯飞） | 服务端 | 按量付费 | 🔴 音频出本机 | 🟢 精度高、支持时间戳；**但本项目无后端** |
| **自建 Whisper**（whisper.cpp / faster-whisper） | 本地/自托管 | 一次部署 + 算力 | 🟢 数据不出本机 | 🟢 **建议**（离线批量处理，不引入运行时依赖） |
| **第三方字幕服务** | 外包 | 按量 | 🔴 | 🔴 素材外泄风险 |

**强烈建议**（📐）：**走「离线批量转写」而不是「运行时 ASR」**：

```
音频/视频（素材） ──▶ [离线：whisper.cpp] ──▶ 转写产物（JSON/VTT） ──▶ 入库为 content/ 内容
                       ↑ 一次性处理，不进产品运行时
```

**理由**：
1. 本项目是**纯静态站、无后端**（`GAP_ANALYSIS.md:158`）—— 运行时 ASR 无处部署；
2. 转写是**一次性的内容加工**，与词表导入同性质 ⇒ 应复用 `05-import/IMPORT_PIPELINE.md` 的「离线批处理」模式；
3. 离线处理**不引入运行时依赖**，不推高首屏体积。

### 4.3 建议的转写产物形状

**建议**直接复用字幕模型（避免两套时间轴）：

```jsonc
// content/listening/<ns>-<id>/transcript.json（建议，当前不存在）
{
  "language": "en",
  "audio": "asset:audio:<ns>:<id>",
  "quality": "human",            // human | asr
  "asrEngine": "whisper-large-v3",  // 仅 quality=asr 时
  "segments": [
    { "segmentId": "lec-01-0", "start": 0.0,  "end": 3.2, "text": "Good morning.", "translation": "早上好。", "speaker": "A" },
    { "segmentId": "lec-01-1", "start": 3.4,  "end": 7.8, "text": "Today we...", "translation": "今天我们…", "speaker": "A" }
  ]
}
```

**建议增加的两个字段**（相对 `SubtitleSegment`）：

| 字段 | 必要性 | 理由 |
|---|---|---|
| `quality` | 🟠 建议 | **ASR 产物必须有质量标注** —— 用户需知道「这是机器转写，可能有错」。这是诚实原则的落实（对比 `catalog.ts:9-13` 的「诚实原则：未接入的一律返回 0，不许编造数字」） |
| `asrEngine` | 🟡 可选 | 溯源（与 `manifest.build.toolVersion` 同思路） |

**`quality` 字段是本文件最重要的建议** —— 自动转写必然有错（人名、专有名词、口音），若不加标注会让用户误以为文本是权威原文。这与 `validate.mjs:275-276`「绝不用『假装通过』凑绿」是同一原则。

### 4.4 建议的转写用途

| 用途 | 依赖 | 优先级 |
|---|---|---|
| 字幕/同步播放 | `segments` + 时间轴 | 🔴 高（与 `SUBTITLE.md` 合并实现） |
| 全文搜索 | `text` 拼接 | 🟠 中（需接入 `contentIndex`） |
| **生词提取**（转写 × 词库比对） | `segments` + `contentQuery` | 🔴 高（**这是「视频学习」的核心价值**） |
| 听写练习 | `segments` + 遮蔽 UI | 🟠 中 |
| 阅读理解题 | `text` + 题目模型 | 🟡 低（需 `exercise` 类型） |
| 复制/导出 | `text` | 🟡 低 |

**生词提取值得单列**（🔴 高优先级）：把转写文本与现有 9346 词比对，标出「本视频中你还没掌握的词」 —— **这是本项目建设「视频学习差异化」最有价值的路径**，且不依赖任何新媒体技术（只需文本 + 词库比对）。

**注意**：它依赖 Learning 层的掌握度（`mastery.ts`）与内容查询（`contentQuery`）。由于 UI 目前直读词数组（`GAP_ANALYSIS.md` A-1），建议在实现前先完成 `contentQuery` 接线。

### 4.5 ⚠️ 建议避免的陷阱

| 陷阱 | 说明 | 依据 |
|---|---|---|
| **用运行时 ASR** | 本项目无后端，静态站无法承载 | `GAP_ANALYSIS.md:158` |
| **转写不带时间轴** | 无法做同步播放与逐句跳转，价值大打折扣 | §4.3 |
| **转写与字幕两套模型** | 两个真相，必然漂移 | §3.2 |
| **ASR 产物不加质量标注** | 用户会误信机器文本 | §4.3 |
| **把 `transcript` 作为独立存储字段** | 与 `segments` 重复（建议派生） | §3.2 |
| 版权：转写第三方音频 | 转写仍是衍生作品，需原始授权 | `11-legal/*` |

---

## 5. 与需求文档的对照

| 需求 | 实测状态 |
|---|---|
| 转写 | 📐 零实现 |
| 音频/视频转文本 | 📐 零实现 |
| 转写驱动生词提取 | 📐 零实现（依赖转写 + 词库比对） |
| 听写练习 | 📐 零实现 |
| TTS 朗读 | ✅ 已有（**方向相反**，非转写） |
| ASR | 📐 零实现（且无后端可承载） |

---

## 6. 结论

- **转写能力完成度 = 0%**：零 ASR、零转写文件、零字段、零时间轴。唯一相关的是**反向能力** TTS（`speech.ts` 单词朗读）。
- **一个关键的可行性判断**（📐 建议）：本项目是**纯静态站、无后端**（`GAP_ANALYSIS.md:158`），因此**不应做运行时 ASR**。转写的正确形态是**离线批处理**（whisper.cpp 等），产出物作为 `content/` 的一部分入库 —— 这与现有 `05-import/IMPORT_PIPELINE.md` 的「离线内容加工」模式完全一致。
- **一条低成本落地路径**（📐 建议）：**从字幕派生转写**。若素材自带 VTT/SRT，转写是零成本派生的 ⇒ 可以先落转写能力而不碰 ASR。
- **一个高价值用途**（📐 建议）：**转写 × 词库比对的生词提取** —— 这是「视频学习差异化」最有价值的路径，且只依赖文本与词库，不依赖新媒体技术。
- **最重要的设计建议**（📐）：转写产物**必须带 `quality` 标注**（`human` / `asr`），避免用户误信机器文本 —— 与项目既有的诚实原则（`catalog.ts:9-13`、`validate.mjs:275-276`）一致。
