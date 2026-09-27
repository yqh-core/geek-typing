# 媒体流水线（MEDIA_PIPELINE）

> 状态：📐 待建
>
> 📐 **待建**：媒体处理流水线 —— **零实现**（无脚本、无资产目录、无媒体门禁执行）
> ✅ **已有**（可参照的范本）：**文本词表**的流水线（Raw→Normalize→Validate→Canonical→Build），可作为媒体流水线的设计模板
>
> 基线 commit：`4152eb2`　｜　实测日期：2026-09-27
> 证据来源：`scripts/content/*.mjs`、`scripts/build-*.mjs`、`content/README.md`、`scripts/check-bundle.mjs`

---

## 1. 一句话事实

**媒体流水线零实现，但项目里有一条成熟的文本流水线可作为设计范本。**

```bash
$ ls scripts/
audit-capture.mjs   build-bank.mjs      build-cet-defs.mjs
build-cet-phonetics.mjs  build-ielts.mjs   check-bundle.mjs
gen-icons.mjs       stress-review.mjs   content/

$ ls content/
README.md  vocabulary/

# 无 media/、无 assets/、无媒体处理脚本
$ find scripts -iname "*media*" -o -iname "*audio*" -o -iname "*video*" -o -iname "*subtitle*"
（无输出）
```

**零媒体脚本、零资产目录。** 但 `scripts/` 下 9 个脚本 + `scripts/content/` 5 个脚本，构成了**文本流水线的完整范本**。

---

## 2. ✅ 已有：文本流水线（作为范本）

详见 `05-import/IMPORT_PIPELINE.md`。此处只提炼**可复用于媒体流水线的设计原则**：

| # | 原则 | 文本流水线的实现 | 对媒体的可复用性 |
|---|---|---|---|
| 1 | **五阶段分离** | Raw → Normalize → Validate → Canonical → Build | 🟢 高 —— 媒体同样需要「落盘 → 归一 → 校验 → 指纹 → 派生」 |
| 2 | **序列化与指纹唯一实现** | `canonical.mjs`（135 行） | 🟢 高 —— 媒体资产同样需要 checksum 溯源 |
| 3 | **派生而非手写** | `build.mjs` 自动派生 `stats` / `checksum` / 版本三元组 | 🟢 高 —— 媒体的 `duration` / `bytes` / `mime` 同样应派生 |
| 4 | **门禁可执行 + 退出码** | `validate.mjs` 20 项，FAIL → `exit 1` | 🟢 高 —— 媒体需独立门禁（时长/体积/格式） |
| 5 | **体积预算硬约束** | 门禁第 18/19/21/22 项（manifest ≤ 8 KiB、inline ≤ 64 KiB、主 chunk ≤ 420 KiB、预热 ≤ 600 KiB） | 🔴 **媒体必须重设阈值** —— 音视频体积比词表大 3-5 个数量级 |
| 6 | **跳过必留痕** | 无 `assets` 字段 → 打印「跳过」，不伪造通过 | 🟢 高 |
| 7 | **幂等** | `build.mjs` 内容未变时「一个字节都不改」 | 🟢 高 —— 媒体转码同样应幂等（避免重复转码） |
| 8 | **来源溯源 + 许可** | `sources[]` 结构化 license，外部来源必须 SPDX（门禁第 7 项） | 🟢 **极高** —— 媒体版权风险更高 |
| 9 | **离线批处理、非运行时** | 全部脚本在 Node 侧运行，不进产品运行时 | 🟢 高 —— 媒体转码同理 |

### 2.1 可借鉴的三个具体机制

**机制 A —— 派生 stats（`build.mjs:181-186`）**：

```js
stats: {
  ...m.stats,
  items: words.length,
  phonetic: words.filter((w) => w.phonetic).length,
  definition: words.filter((w) => w.definition).length,
},
```

**媒体版建议**：`stats: { items, totalBytes, totalDuration, formats: {...} }` —— 全部从资产清单派生，禁止手写。

**机制 B —— 版本三元组（`build.mjs:105-160`）**：`contentRevision`（审计号，单调递增）+ `contentVersion`（契约版本，同 checksum 复用）+ `contentChecksum`（内容身份）。

**媒体版建议**：完全复用同一套 —— 媒体包同样需要「回滚到上一版有确定答案」。

> ⚠️ **但媒体需要额外的一个字段**：`assetChecksum`（单个资产的指纹）与 `contentChecksum`（清单的指纹）应区分。因为一个视频包可能含数十个音频文件，**改一个文件不应让整包 checksum 语义模糊**。

**机制 C —— 策略一致性（门禁第 20 项，`validate.mjs:394-421`）**：manifest 的 `offline.policy` 必须与 `registry.ts` 实际加载方式一致，通过扫 TS 源码文本判定。

**媒体版建议**：保留该机制，但媒体包**全部应为 `lazy` 或 `runtime`** —— 音视频绝不 inline。

### 2.2 已有的媒体相关门禁（当前恒跳过）

| 门禁项 | 实现 | 当前状态 |
|---|---|---|
| 第 12(f) broken asset | `validate.mjs:342-351` —— `manifest.assets` 存在时校验 `url` 格式 | **恒跳过**（10 包均无 `assets`） |

`validate.mjs:342-351`：

```js
//   (f) broken asset —— 只有 manifest 存在 assets 字段才校验
if (manifest.assets === undefined) {
  console.log('  · manifest 无 assets 字段，跳过 asset 校验')
} else if (!Array.isArray(manifest.assets)) {
  fail('manifest.assets 必须为数组')
} else {
  const broken = manifest.assets.filter((a) => !a?.url || !/^(https?:\/\/|\/)/.test(a.url))
  if (broken.length === 0) ok(`assets ${manifest.assets.length} 项 url 合法`)
  else fail(`broken asset ${broken.length} 项：${broken.slice(0, 3).map((a) => a?.url).join(', ')}`)
}
```

> ⚠️ **这一项的校验深度远不足以覆盖媒体**：它只查 `url` 是否以 `http(s)://` 或 `/` 开头。
> 不查：文件是否存在、`mime` 是否与扩展名一致、`bytes` 是否与实际字节数相符、`checksum` 是否匹配、`duration` 是否合理。**媒体接入时必须扩展。**

---

## 3. 📐 建议：媒体流水线设计

> 以下全部为**建议**，非实测事实。当前零实现。

### 3.1 建议的流水线形态

**建议**照搬文本流水线的五阶段结构，但增加「转码」与「资产指纹」两个媒体特有阶段：

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  阶段 0        阶段 1        阶段 2        阶段 3       阶段 4      阶段 5   阶段 6│
│  Acquire  ──▶ Normalize ──▶ Transcode ──▶ Validate ──▶ Fingerprint ─▶ Build ─▶ List│
│  (采集)        (归一)        (转码)        (门禁)       (指纹)        (派生)   (清单)│
└──────────────────────────────────────────────────────────────────────────────────┘
     │             │              │              │            │            │
  下载/自产      格式/命名      统一编解码      时长/体积      sha256      manifest
  版权核验       元数据补全      采样率/码率     格式合法性    逐资产       自动派生
                 （元数据）      （媒体特有）    （媒体特有）  （媒体特有）
                                                             ↘
                                                          ↙ 复用
                                          canonical.mjs（序列化与指纹范本）
```

**新增的两个阶段**：

| 阶段 | 职责 | 为什么媒体需要而文本不需要 |
|---|---|---|
| **Transcode** | 统一编码（H.264/AAC、统一采样率与码率） | 素材来源编码杂乱，浏览器兼容性要求统一；文本无此问题 |
| **Fingerprint（逐资产）** | 每个资产独立 checksum | 一个媒体包含多个文件，需逐文件指纹以便增量更新 |

### 3.2 建议的资产清单形状

```jsonc
// content/assets/manifest.json（建议，当前不存在；content/README.md:633 记为 P3 后置项）
{
  "schemaVersion": 1,
  "assets": [
    {
      "assetId": "asset:audio:curated-nce:lesson-01",
      "kind": "audio",                       // audio | video | subtitle | image | document | other
      "url": "/assets/audio/curated-nce/lesson-01.mp3",
      "mime": "audio/mpeg",
      "bytes": 4915200,
      "checksum": "sha256:...",              // 逐资产指纹
      "duration": 312.5,                     // 秒
      "language": "en",
      "accent": "en-GB",                     // 与 speech.ts 的 VoicePref 对齐
      "speaker": "BBC-Reader-01",
      "sampleRate": 44100,
      "bitrate": 128000,
      "license": { "spdx": "CC-BY-4.0", "name": "CC BY 4.0", "attributionRequired": true, "commercialUse": true },
      "source": { "origin": "self-produced", "acquiredAt": "2026-10-01" },
      "derivedFrom": "asset:video:curated-nce:lesson-01"   // 转码/抽取来源
    }
  ]
}
```

**字段设计要点**（📐 建议）：

| 字段 | 必要性 | 理由 |
|---|---|---|
| `assetId` | 🔴 必须 | 稳定引用；形态 `asset:<kind>:<namespace>:<localId>`（**不用 `content:` 前缀**，避免被 `parseContentId` 误解析，`content/README.md:240`） |
| `kind` | 🔴 必须 | 区分媒体类型；**建议扩展加 `video` / `transcript`**（`AUDIO.md` / `VIDEO.md` / `TRANSCRIPT.md` 均记录此缺口） |
| `url` | 🔴 必须 | 定位 |
| `mime` | 🔴 必须 | 浏览器解码判定 |
| `bytes` | 🔴 必须 | 体积预算（媒体体积是首屏的核心约束） |
| `checksum` | 🔴 必须 | 可复现、增量更新、防篡改 |
| `duration` | 🔴 必须（音视频） | 进度条、听力题设计 |
| `language` / `accent` | 🟠 建议 | 与现有 `speech.ts` 的 en-US/en-GB 双口音对齐 |
| `sampleRate` / `bitrate` | 🟡 可选 | 转码溯源 |
| `license` | 🔴 必须 | **门禁第 7 项已要求外部来源必须有 SPDX** —— 媒体沿用同一规则 |
| `derivedFrom` | 🟠 建议 | 转码链溯源（如「音频从视频抽出」） |

### 3.3 建议的媒体门禁（新增，当前不存在）

**建议**新增一组媒体门禁（编号 M-1 ~ M-9，**不在现有 20 项内**）：

| # | 断言 | 建议阈值 | 对应文本门禁 |
|---|---|---|---|
| M-1 | 每项资产文件存在且可读 | — | 第 1 项 |
| M-2 | `mime` 与实际文件头一致 | — | （无对应） |
| M-3 | `bytes` === 实际字节数 | — | 第 5 项（stats 一致） |
| M-4 | `checksum` === `sha256(文件字节)` | — | 第 6/15 项 |
| M-5 | `duration` 与实际时长偏差 ≤ 1% | — | （无对应） |
| M-6 | `license` 结构化且外部来源有 SPDX | 同文本 | 第 7 项 |
| M-7 | **单资产体积上限** | 建议视频 ≤ 200 MiB / 音频 ≤ 10 MiB | 第 18 项（manifest 体积） |
| M-8 | **单包资产总体积上限** | 建议 ≤ 2 GiB | 第 18 项 |
| M-9 | **`offline.policy` 不得为 `inline`** | 强制 | 第 19/20 项 |

> **M-9 是最重要的一条**（📐 建议）：文本侧实测证明 inline 是「首屏体积的直通车」（1:1.0005 传导比，`content/README.md:557-567`）。音视频包若误设 inline，主 chunk 会立刻膨胀到 GB 级 ⇒ **必须硬禁**。

### 3.4 建议的存储分层

**建议**采用「清单入库 + 文件外部存储」的分层（📐）：

```
content/                             ← 入 git 仓库（轻）
└── assets/
    └── manifest.json                ← 资产清单（只含元数据，不含文件）

R2 / CDN / GitHub Releases           ← 外部存储（重）
└── audio|video|subtitle/...
```

**依据**（`content/README.md:243-244` 原文）：

> Content 回答「这个东西是什么」，Asset 回答「文件在哪」。
> 将来 本地 → Cloudflare R2 → CDN → GitHub Releases 切换时，**Content 模型一行都不用改**。

**这个分层的好处**：
1. 清单可入库（可 diff、可审计、可版本化）；
2. 媒体文件不入 git（避免仓库膨胀）；
3. 存储后端可切换（改 `url` 即可，模型不变）。

**建议的清单体积门禁**（📐）：清单只含元数据，建议同样设上限（如全库 ≤ 200 KiB），避免清单随资产数线性膨胀进主 chunk —— 这与文本侧「manifest 常驻主 chunk」的担忧（`validate.mjs:360-363`）同理。

### 3.5 建议的处理脚本清单

| 脚本（建议名） | 职责 | 对应文本侧 |
|---|---|---|
| `scripts/media/normalize.mjs` | 文件名归一、元数据补全、时长探测 | `content/normalize.mjs` |
| `scripts/media/transcode.mjs` | 统一编码（**需 ffmpeg**） | （无对应） |
| `scripts/media/validate.mjs` | M-1 ~ M-9 门禁 | `content/validate.mjs` |
| `scripts/media/fingerprint.mjs` | 逐资产 sha256 | `content/canonical.mjs` |
| `scripts/media/build.mjs` | 派生清单（stats / checksum / 版本） | `content/build.mjs` |
| `scripts/media/list.mjs` | 清单展示 | `content/list.mjs` |

**依赖提示**（📐）：`transcode.mjs` 需要 **ffmpeg**（本机未检测到相关调用，当前零实现）。这是一个**外部系统依赖** —— 与现有纯 Node 脚本（零外部依赖）不同，建议在 package.json 中显式声明并在文档中说明。

### 3.6 ⚠️ 建议优先解决的三个前置问题

| # | 问题 | 为什么必须先解决 | 关联文件 |
|---|---|---|---|
| 1 | **版权来源** | 媒体版权风险远高于文本；先做流水线可能做出「无合法内容是播的播放器」 | `11-legal/*` |
| 2 | **`AssetKind` 扩展** | 当前无 `video` / `transcript` 取值 ⇒ 无法表达 | `AUDIO.md` §3.1、`VIDEO.md` §3.1、`TRANSCRIPT.md` §3.1 |
| 3 | **体积预算重设** | 现有阈值（8 KiB / 40 KiB / 64 KiB / 420 KiB）是**文本尺度**的，媒体需重设 3-5 个数量级 | `content/README.md:579-591` |

### 3.7 ⚠️ 建议避免的陷阱

| 陷阱 | 说明 |
|---|---|
| 把媒体文件塞进 git | 仓库膨胀、clone 变慢；应放 R2/CDN |
| 媒体包设 `inline` | 主 chunk 立刻膨胀（文本侧已实测 1:1 传导） |
| 清单与文件不分离 | 清单会随资产线性膨胀进主 chunk |
| 逐资产无 checksum | 无法增量更新，改一个文件要全量重传 |
| 复用文本门禁的阈值 | 8 KiB / 64 KiB 等阈值对媒体无意义 |
| 运行时转码 | 静态站无后端；转码应离线完成 |
| 媒体不做 license 门禁 | 媒体的版权风险高于文本，门禁应更严而非更松 |
| 手写 `duration` / `bytes` | 应派生（同文本侧 `stats` 的自动派生原则） |

---

## 4. 与需求文档的对照

| 需求 | 实测状态 |
|---|---|
| 媒体处理流水线 | 📐 零实现（零脚本、零资产目录） |
| 音频/视频采集与转码 | 📐 零实现 |
| 资产清单 | 📐 零实现（`content/README.md:633` 记为 P3 后置项） |
| 媒体门禁 | 📐 零实现（第 12(f) 项恒跳过，且校验深度不足） |
| 媒体版权溯源 | 📐 零实现（`AssetRef.license` 模型已定义，未落地） |

---

## 5. 结论

- **媒体流水线完成度 = 0%**：零脚本、零资产目录、零门禁执行。`content/README.md:633` 已明确把 `AssetManifest` 推到 **P3**。
- **但项目有极好的范本**：`scripts/content/` 的五阶段流水线（Raw→Normalize→Validate→Canonical→Build）是**同类项目中少见的严谨实现** —— 序列化与指纹唯一、派生而非手写、门禁有退出码、跳过必留痕、幂等防假变化。**建议媒体流水线照搬这套结构**，只增加 `Transcode` 与 `Fingerprint（逐资产）` 两个阶段。
- **五个可直接复用的机制**（📐 建议）：① 五阶段分离；② canonical 式指纹；③ 派生 stats；④ 退出码门禁；⑤ 离线批处理（不进运行时）。
- **三个必须先解决的前置问题**（📐 建议）：① **版权来源**（媒体风险远高于文本）；② **`AssetKind` 扩展**（无 `video` / `transcript`）；③ **体积预算重设**（现有阈值是文本尺度的）。
- **最重要的单条约束**（📐 建议）：**媒体包禁止 `inline`**。文本侧已用对照实验证明 inline 是首屏体积的直通车（1:1.0005 传导比），音视频若误设会导致 GB 级主 chunk。
