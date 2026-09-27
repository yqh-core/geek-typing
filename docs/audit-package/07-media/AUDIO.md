# 音频（AUDIO）

> 状态：📐 待建（本文分节标注）
>
> ✅ **已有**（发音能力，非音频资源）：Web Speech API 单词朗读（`speech.ts`，88 行）+ Web Audio 实时合成音效（`sound.ts`，205 行）
> 📐 **待建**（音频资源体系）：音频内容、音频元数据、例句音频、句子音频、课文音频 —— **全部零实现，零文件**
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`src/lib/speech.ts`、`src/lib/sound.ts`、`src/App.tsx`、`content/vocabulary/*/manifest.json`

---

## 1. 一句话事实

**本项目有「发声能力」，但没有「音频资源」。** 这是两个完全不同的东西：

| 维度 | 发声能力（✅ 已有） | 音频资源体系（📐 待建） |
|---|---|---|
| 本质 | 浏览器实时合成，**零文件** | 真实音频文件（mp3/wav/m4a） |
| 依赖 | `speechSynthesis` / `AudioContext` | 文件存储 + CDN / R2 |
| 内容 | 只有单词朗读 + 6 类 UI 音效 | 例句、句子、课文、听力材料 |
| 元数据 | 无 | 时长 / 采样率 / 语言 / 说话人 / 许可 |
| 文件实测 | **0 个音频文件** | — |

**实测**：

```bash
$ find . -path ./node_modules -prune -o -type f \( -name "*.mp3" -o -name "*.wav" -o -name "*.m4a" -o -name "*.ogg" \) -print
（无输出）
```

**全仓库零音频文件。**

---

## 2. ✅ 已有：Web Speech API 单词发音

### 2.1 实现（`src/lib/speech.ts`，88 行）

| 能力 | 函数 | 行号 |
|---|---|---|
| 支持探测 | `speechSupported()` | `:39-41` |
| 朗读单词 | `speak(word, rate = 0.85)` | `:68-78` |
| 打断朗读 | `stopSpeak()` | `:80-82` |
| 预热引擎 | `warmSpeech()` | `:62-65` |
| 读取口音偏好 | `getVoicePref()` | `:24-26` |
| 设置口音偏好 | `setVoicePref(p)` | `:29-37` |

`speak()` 全文（`:67-78`）：

```ts
/** 朗读一个英文单词 */
export function speak(word: string, rate = 0.85) {
  if (!speechSupported() || !word) return
  const u = new SpeechSynthesisUtterance(word.replace(/[-_]/g, ' '))
  const v = pickVoice()
  if (v) u.voice = v
  u.lang = v?.lang ?? voicePref
  u.rate = rate
  u.pitch = 1
  window.speechSynthesis.cancel() // 打断上一句，避免排队
  window.speechSynthesis.speak(u)
}
```

**四个设计点**：

| 点 | 说明 | 行号 |
|---|---|---|
| `word.replace(/[-_]/g, ' ')` | 连字符/下划线换成空格 —— 让 `well-known` 被读成两个词而非拼读符号 | `:70` |
| `rate = 0.85` | **默认语速放慢**（正常为 1.0），适合学习者 | `:68` |
| `cancel()` 在 `speak()` 前 | **打断上一句，避免排队堆积** | `:76` |
| 无 voice 时退化为 `voicePref` | 找不到具体 voice 仍能朗读 | `:73` |

### 2.2 口音偏好（en-US / en-GB）

`speech.ts:9`：

```ts
export type VoicePref = 'en-US' | 'en-GB'
```

持久化在 `localStorage` key `gt.voice`（`speech.ts:7`），默认 en-US（`:15`）。

**选声逻辑**（`pickVoice()`，`:43-60`）：

```ts
function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice
  const voices = window.speechSynthesis.getVoices?.() ?? []
  if (voicePref === 'en-GB') {
    // 英音偏好：先找 en-gb，再退回任意英文声
    cachedVoice =
      voices.find((v) => v.lang?.toLowerCase() === 'en-gb') ??
      voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ??
      null
  } else {
    cachedVoice =
      voices.find((v) => v.lang?.toLowerCase() === 'en-us' && /google|samantha|natural/i.test(v.name)) ??
      voices.find((v) => v.lang?.toLowerCase().startsWith('en-us')) ??
      voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ??
      null
  }
  return cachedVoice
}
```

**三级降级链**：

| 偏好 | 优先级 1 | 优先级 2 | 优先级 3 |
|---|---|---|---|
| en-GB | 精确 `en-gb` | 任意 `en*` | `null`（用 `voicePref` 作 lang） |
| en-US | `en-us` **且**名字含 `google`/`samantha`/`natural` | 任意 `en-us` | 任意 `en*` |

**`/google|samantha|natural/i` 是在优选「音质更好的声」**：Chrome 的 Google 声、macOS 的 Samantha、以及标称 natural 的声。这是一个务实的启发式（无标准 API 可判定音质）。

**缓存**：`cachedVoice` 模块级变量（`:11`），`setVoicePref` 时置 `null` 强制重选（`:31`）。

### 2.3 调用点（实测）

| 调用点 | 代码 | 场景 |
|---|---|---|
| `App.tsx:36` | `import { speak, warmSpeech }` | — |
| `App.tsx:315` | `warmSpeech()` | 应用启动预热（注释 `:313`：「某些浏览器首次 getVoices 为空」） |
| `App.tsx:396` | `if (mode === 'spell' \|\| autoSpeak) speak(current.word)` | 换词时自动发音 |
| `App.tsx:734` | `onSpeak={mode === 'code' ? undefined : () => speak(current.word)}` | 手动发音按钮（code 模式禁用） |
| `Memorize.tsx:124` | `speak(item.word)` | 背单词页发音 |
| `Memorize.tsx:264` | `if (flipped && item) speak(item.word)` | 翻卡时发音 |
| `Memorize.tsx:380` | `speak(item.word)` | 发音按钮（`memorize-speak`） |
| `CommandPalette.tsx:215` | `if (want !== getVoicePref()) ok(() => setVoicePref(want))` | 命令面板切换口音 |

**朗读范围仅限单词** —— 没有任何地方朗读句子或段落。

---

## 3. ✅ 已有：Web Audio 合成音效（`src/lib/sound.ts`，205 行）

**全部实时合成，零外部音频文件**（`sound.ts:2-3` 原文）：

> 机械键盘音效引擎
> 全部使用 Web Audio API 实时合成，**零外部音频文件**，秒开无加载。

### 3.1 三类合成器

| 方法 | 波形/源 | 用途 | 行号 |
|---|---|---|---|
| `click(freq, dur, gainVal, q)` | 白噪声 + 带通滤波 | 清脆键声 | `:36-55` |
| `thock(freq, dur, gainVal)` | 正弦（频率下滑至 0.62×） | 厚实底座触底感 | `:58-70` |
| `blip(freq, dur, gainVal)` | 方波（频率上滑至 1.5×） | 8-bit 复古游戏音 | `:73-86` |

**白噪声预生成一次**（`ensure()`，`:24-29`）：

```ts
// 预生成一段白噪声，用于模拟机械轴体的"咔哒"声
const len = Math.floor(this.ctx.sampleRate * 0.25)
const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
const data = buf.getChannelData(0)
for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
this.noiseBuffer = buf
```

**0.25 秒的白噪声缓冲，复用于所有 click 声。**

### 3.2 六类音效

| 方法 | 事件 | 实现 | 行号 |
|---|---|---|---|
| `correct()` | 敲对字母 | 按主题分支（8bit→blip / thock→thock+click / 默认→click+thock） | `:89-102` |
| `error()` | 敲错字母 | 8bit→blip(150Hz) / 默认→锯齿波 190→90Hz 下滑 | `:105-124` |
| `complete()` | 整词完成 | 上行双音（8bit: 660/880/1170；默认: 784/1175） | `:127-145` |
| `milestone()` | 连击里程碑 | 三音（523/659/784） | `:148-165` |
| `fanfare()` | 一轮通关 | 上行音阶 6 音（523→1047） | `:174-193` |
| `tap()` | UI 按钮 | `click(3200, 0.025, 0.045)` | `:196-201` |

另有 `correctOrError(ok)`（`:168-171`，spell 模式用）。

### 3.3 三种音色主题

`sound.ts:6`：

```ts
export type SoundTheme = 'mech' | 'thock' | '8bit'
```

主题差异（以 `correct()` 为例，`:93-101`）：

```ts
if (this.theme === '8bit') {
  this.blip(ctx, 620 + Math.random() * 180, 0.07, 0.05)
} else if (this.theme === 'thock') {
  this.thock(ctx, 210, 0.075, 0.16)
  this.click(ctx, 1400, 0.03, 0.05, 0.8)
} else {
  this.click(ctx, 2600 + Math.random() * 700, 0.045, 0.11)
  this.thock(ctx, 180, 0.05, 0.07)
}
```

**`mech` 主题给 click 频率加了随机抖动**（`2600 + Math.random() * 700`）—— 让连续按键听起来不机械重复。

主题与开关持久化在 `gt.soundTheme` / `gt.sound`（`App.tsx:307-308`），并同步到引擎（`App.tsx:337-340`）：

```ts
useEffect(() => {
  sound.enabled = soundEnabled
  sound.theme = soundTheme
}, [soundEnabled, soundTheme])
```

### 3.4 AudioContext 生命周期

`ensure()`（`:17-33`）：

```ts
private ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!this.ctx) {
    const Ctor = window.AudioContext ?? (window as AnyWindow).webkitAudioContext
    if (!Ctor) return null
    this.ctx = new Ctor()
    ... // 预生成噪声
  }
  if (this.ctx.state === 'suspended') void this.ctx.resume()   // ← 自动恢复
  return this.ctx
}
```

**三个防御**：

| 防御 | 说明 | 行号 |
|---|---|---|
| `typeof window === 'undefined'` | SSR / 非浏览器环境安全 | `:18` |
| `webkitAudioContext` 兜底 | 兼容旧 Safari | `:20` |
| `state === 'suspended'` 时 `resume()` | **浏览器自动播放策略**会导致 AudioContext 挂起，这里每次使用前恢复 | `:31` |

**单例导出**（`:204`）：`export const sound = new SoundEngine()`

**调用密度实测**：`src/` 中 `sound.` 调用 **20+ 处**，集中在 `Header.tsx`（10 处）、`CommandPalette.tsx`（3 处）、`Memorize.tsx`（4 处）、`App.tsx`。

---

## 4. 📐 待建：音频资源体系

### 4.1 零实现清单

| 能力 | 现状 | 说明 |
|---|---|---|
| 音频文件 | ❌ **0 个** | `find` 实测无 mp3/wav/m4a/ogg |
| 音频内容类型 | 📐 `PLANNED_TYPES` 含 `audio`，但 `packages=0 / items=0` | `catalog.ts:52-64` |
| 音频元数据 | ❌ 无 | 无 `duration` / `sampleRate` / `speaker` / `language` 字段 |
| 例句音频 | ❌ 无 | 全库词条**无 `example` 字段**（`04-content/CONTENT_QUALITY.md`） |
| 句子音频 | ❌ 无 | 无句子内容类型 |
| 课文音频 | ❌ 无 | 无 lesson 类型 |
| 听力材料 | ❌ 无 | `listening` 类型 `packages=0` |
| AssetRef 声明 | ❌ 无 | `manifest.assets` 在 10 个包中**全部不存在**（`validate.mjs:343-344` 恒跳过） |
| 音频播放器 | ❌ 无 | 零 `<audio>` 元素、零播放器组件 |
| 音频 CDN / 存储 | ❌ 无 | `content/assets/` **目录不存在** |

### 4.2 内容层已预留的槽位（但未使用）

**`AssetRef` 模型已定义**（`content/README.md:237-244`）：

```
AssetRef { assetId, kind, url, mime?, bytes?, checksum?, license? }
assetId 形态：asset:<kind>:<namespace>:<localId>（不用 content: 前缀）
AssetKind = 'audio' | 'image' | 'document' | 'subtitle' | 'other'
```

**关键设计**（`content/README.md:243-244` 原文）：

> Content 回答「这个东西是什么」，Asset 回答「文件在哪」。
> 将来 本地 → Cloudflare R2 → CDN → GitHub Releases 切换时，**Content 模型一行都不用改**。

**这是「媒体接入不需要改架构」的预留** —— 但**资产目录与字段都没有落地**（`content/README.md:74-76` 明确：「`content/assets/` 目前**并不存在**」）。

**`Audio` 类型的特有字段**（`content/README.md:231`）：

| 类型 | 特有字段 |
|---|---|
| Audio | `audioUrl / duration / transcript / segments / speaker / difficulty` |

**这是文档中的规划，不在任何代码里**（实测无 `audioUrl` / `duration` 字段）。

### 4.3 📐 建议：音频资源体系设计

> 以下全部为**建议**，非实测事实。

#### 建议的 AssetRef 落地形状

```jsonc
// content/vocabulary/ielts/assets.json（建议，当前不存在）
{
  "assets": [
    {
      "assetId": "asset:audio:ecdict-ielts:abandon-us",
      "kind": "audio",
      "url": "/assets/audio/ecdict-ielts/abandon-us.mp3",
      "mime": "audio/mpeg",
      "bytes": 12345,
      "checksum": "sha256:...",
      "duration": 1.2,
      "language": "en-US",
      "speaker": "TTS-Google",
      "license": { "spdx": "CC0-1.0", "name": "CC0 1.0", "attributionRequired": false }
    }
  ]
}
```

#### 建议的元数据字段（**当前均不存在**）

| 字段 | 必要性 | 理由 |
|---|---|---|
| `duration` | 🔴 必须 | 进度条、时长统计、听力题设计 |
| `mime` | 🔴 必须 | 浏览器解码判定 |
| `bytes` | 🟠 建议 | 体积预算（对比 manifest 的 8 KiB 门禁思路） |
| `checksum` | 🔴 必须 | 与内容层一致的「可复现」原则 |
| `language` / `accent` | 🟠 建议 | en-US vs en-GB（现有 `speech.ts` 已支持双口音） |
| `speaker` | 🟡 可选 | 版权与音色选择 |
| `license` | 🔴 必须 | 门禁第 7 项已要求结构化 license，音频同样需要 |
| `transcript` | 🟠 建议 | 与字幕联动（见 `SUBTITLE.md`） |

#### 建议的实现顺序

| 阶段 | 内容 | 依赖 |
|---|---|---|
| M1 | 建 `content/assets/` + `AssetRef` 类型落地 + `assets/manifest.json` | 无 |
| M2 | 打通 `manifest.assets` 使得 validate 第 12(f) 项真正执行（当前恒跳过） | M1 |
| M3 | 第一批音频：单词发音（**可用现有 TTS 离线批量生成**，避免版权问题） | M2 |
| M4 | 例句音频：**需先给词条加 `example` 字段**（当前全库无） | M2 + 内容字段扩展 |
| M5 | 课文 / 听力音频 + 播放器 UI | M3 |

> ⚠️ **建议优先解决版权**：需求文档强调「绝对不能把 GitHub 素材直接塞进网站」（`GAP_ANALYSIS.md:175`）。单词/例句音频建议**用 TTS 生成自有音频**，而不是采集第三方音频 —— 后者需要逐条核验许可，成本极高。
>
> 现有 `speech.ts` 的 Web Speech API **可离线批量调用**（Node 侧可用 `say` / `espeak` / 云 TTS），这是一条**零版权风险**的音频来源路径。**建议将其作为 M3 的首选方案。**

#### 建议的播放策略

| 场景 | 建议 | 理由 |
|---|---|---|
| 单词发音 | **保留 Web Speech API**（不改为文件） | 零流量、离线可用、无需版权审核 |
| 例句 / 句子 / 课文 | 用音频文件 | TTS 朗读长句质量不稳定，且需要统一音色 |
| 听力题 | 用音频文件 + **必须固定音色与语速** | 考试真实性要求 |

**这是一条重要的建议**：**不要为了「统一」把所有发音都改成音频文件** —— 单词发音用 TTS 已经很好（秒开、零流量、零版权），改造反而会推高体积并引入版权问题。

---

## 5. 与需求文档的对照

| 需求 | 实测状态 |
|---|---|
| 音频学习 | 📐 零实现（无音频文件、无播放器） |
| 单词发音 | ✅ 已有（Web Speech API，**非音频文件**） |
| 音效 | ✅ 已有（Web Audio 合成，**非音频文件**） |
| 例句音频 | 📐 零实现（且无 `example` 字段） |
| 课文 / 听力音频 | 📐 零实现 |
| 音频元数据 | 📐 零实现（模型有 AssetRef，字段未落地） |
| 音频版权 | 📐 零治理（无 AssetRef，无 license 声明） |

---

## 6. 结论

- **必须严格区分两件事**：本项目**有发声能力**（Web Speech API 单词朗读 + Web Audio 合成音效，共 293 行代码，零音频文件），**但没有音频资源体系**（零文件、零元数据、零播放器、零 AssetRef 落地）。
- **已有部分是「零流量、零版权、秒开」的实现**，工程上优于「预生成音频文件」的方案 —— 尤其 `speech.ts` 的 `cancel()` 打断、0.85 语速、双口音、三级选声降级链，都是经过考虑的设计。
- **待建部分的预留是充分的**：`AssetRef` 模型（含 `kind: 'audio'`）、`PLANNED_TYPES` 的 `audio` 槽位、`Audio` 类型的字段清单都已写明 —— **接入音频不需要改架构**，但**目录、字段、门禁执行全部未落地**（validate 第 12(f) 项恒跳过）。
- **建议**（📐）见 §4.3：单词发音**保留 TTS**（不改为文件），长音频用文件 + 固定音色，首批音频优先用 TTS 离线生成以规避版权风险。
