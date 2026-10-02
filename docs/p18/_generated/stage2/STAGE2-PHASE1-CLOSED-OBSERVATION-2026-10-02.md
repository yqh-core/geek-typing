# Stage 2 第一阶段 = CLOSED / 验证完成（2026-10-02）

> 裁定（评审第七轮）：**暂不上课程/章节实体化。第一阶段样板链路已全量验证，实现边界锁在 `5a71b33` 不动。**
> 这一步的性质变了：**从工程验证进入产品验证**。
> 当前最重要的不是「为了完善架构而完善架构」，而是**保护已经形成的稳定基线**。
>
> 评审第八轮终裁（2026-10-02）进一步收窄了口径：这份观察验收**可以作为 Stage 2 第一阶段的正式 CLOSED**，
> 并且**不授权 Course/Lesson 实体化、也不解除 Stage 1 的工程基线**。执行时必须严格按 §0.1 的状态树理解。

---

## §0 锁定的边界

以下六项在观察期结束后、第二阶段开启前，**一律不动**：

1. `content/course/<id>/` —— 不建；
2. `content/lesson/<id>/` —— 不建；
3. `src/core/content/registry.ts` —— 不碰（三处变更：manifest import / loader / `packages[]` 项）；
4. **判据 2 计数** —— 保持 15，不升 16；
5. **判据 5 探测集** —— 不增；
6. **主 chunk 余量** —— 保持 12.6% / 15.9%，不再下降。

理由就一句：N5 刚裁「不做 codegen，registry 保持手写单一事实源」，
现在又为了「看起来更像课程」去碰它，**收益与风险明显不匹配**。

---

## §0.1 状态口径（2026-10-02 终裁钉死，防止后人误读成「Stage 2 已打开、可随便改」）

原稿 §0 说「第二阶段开启前一律不动」、§3 又说「准入条件成立，但开的是另一刀」，
两处并列容易被读成「Stage 2 已经打开」。**真实裁决不是这样**，严格按下面这棵树理解：

```
Stage 1  CLOSED                          ← 工程基线仍生效，未被本观察解除
├── 基线冻结                              ← §0 六项 + 判据 2=15 + 判据 5 探测集 + 主 chunk 余量
│    └── registry.ts 冻结、N5-codegen 不重开、Course/Lesson 未授权
└── Stage 2 = 产品探索                    ← 唯一下一刀
     ├── 学习单元聚合页 ← 下一刀（产品层，方案/原型级）
     └── Course/Lesson ← 暂不做（等真实 N 单元分组需求）
```

三条执行纪律（每次动手前对照一遍）：

1. **Stage 1 基线不解绑**：O2 发现的是**产品缺口**，不是工程缺陷。它触发的是「下一刀做什么」，
   不是「允许改哪些基线」。§0 六项在下一刀完成后仍然逐条有效。
2. **Stage 2 不是自由区**：它是**有单一目标的受限探索**——目标只一条：
   「用户是否需要一个真正的『学习单元』作为核心消费入口？」下一刀 = 学习单元聚合页，仅此一条。
3. **Course/Lesson 保持未授权**：O2 成立 ≠ 实体化授权。顺序恒为
   ① 学习单元聚合页 → ② relation 数据落地 → ③ 真实 N 单元/分组需求 → ④ 实体化。

---

## §1 第一阶段已经跑通的东西（实测，不是计划）

```
现有 IELTS / audio / subtitle / exercise
        ↓  标准化内容链路（不改 src / scripts / tests / content）
content:validate ✅  18 包全部通过（含判据 20 策略一致性）
build ✅           6.24s
check-bundle ✅    exit 0
e2e 171/171 ✅     共 171 项，通过 171，失败 0（2m22s）
CI 4/4 ✅          门禁①②③ + 部署到 Cloudflare Pages 全 success
```

判据层面取到的硬数字（提交 `5a71b33` 的 `dist` 实测）：

- 判据 1：主 chunk **384.21 KiB raw / 119.06 KiB gzip**，余量 **12.6% / 15.9%**，binding 源 `absolute`
- 判据 2：`数据 chunk 15 个（words 7 + items 8）≥ registry lazy 包 15 个`
- 判据 5：`registry 全部 15 个 lazy 包的探测串在主 chunk 命中 0 次`
- 判据 6：预热清单 `[kaoyan, toefl]`，长度 2 ≤ 上限 2

**这一条就够了**：内容标准化链路在**零源码改动**的前提下已经完整跑通。

---

## §2 观察验收 O1 / O2 / O3（下一步就做这个，用真机证据回答）

这一阶段不再是工程验证，是**产品验证**——要回答的是「现有跨包结构够不够用」，不是「技术上跑没跑起来」。

| # | 要回答的问题 | 怎么量 | 判什么 |
|---|---|---|---|
| **O1** | 用户能不能把现有内容**理解成一个学习单元** —— `IELTS ├ vocabulary ├ audio ├ subtitle └ exercise` 在 UI 上能否形成自然的学习流程 | 真机跑一遍完整学习流程（选词库 → 打字 → 切练习 → 返回），记录每一步 UI 给你的心智提示 | 能自然形成 ⇒ 实体层不是刚需 |
| **O2** | 内容之间的**关联是否真的缺失** —— 如果 UI 实测发现「没有 course/lesson 实体，我根本没法自然组织一个完整学习单元」，那才是启动第二阶段的真实证据 | 查 UI 侧有没有把 `demo-audio-01` / `demo-listening-01` / `demo-exercise-01` 与 `ielts` 关联起来的任何一处 | **这条是第二阶段的唯一触发依据**，O1/O3 只是佐证 |
| **O3** | lazy 机制是否符合真实使用：首屏是否仍轻、点 IELTS 内容是否正常加载、audio / subtitle / exercise 是否正常、返回/切换是否正常、离线策略是否符合预期 | 真机测首屏 FCP/LCP + 冷启动主包大小 + 逐次交互后的 chunk 加载与报错 | 任一项在真实使用下不成立 ⇒ 即使 O2 不成立，也要先修 O3 |

> **O2 _exception_ clause**：O2 是**唯一**能开启第二阶段的入口。
> 反过来，如果通过 metadata / package / UI grouping 已经能很好地组织，
> **就没有必要为了架构形式再增加一层实体**。

---

## §2.5 真机证据（2026-10-02 18:00–18:20，headless Chrome + CDP 实跑，**23/23 PASS**）

- 被测：`dist/` 静态服务 `http://127.0.0.1:4188/`；Chrome `--headless=new`，**临时 profile（每次新建）**、`Network.setCacheDisabled`，本地地址走 `--no-proxy-server --proxy-bypass-list=<-loopback>`。
- 四道护栏：调试端口传 `0` 由 Chrome 自选、每个 CDP 调用 30s 上限 + 整轮 180s 看门狗、`taskkill /PID /T /F` 杀整棵进程树、每次删临时 profile。
- **先跑服务自检再验页面**：自检 `/assets/index-AbO-FC5O.js` → `HTTP 200 ct=text/javascript served=393432 == disk 393432` 才开验。

### O3 lazy 机制（首屏 / 切库 / 断网）

| 项 | 实测 |
|---|---|
| first-paint / first-contentful-paint | **44ms / 192ms** |
| 首屏 `.js` 请求 | 主 chunk **1 个**（`index-AbO-FC5O.js`，393432 B）+ `words-*` 预热 chunk **2 个**；其它 0 |
| 首屏 JS 传输合计 | **1352296 B = 1320.60 KiB**（主 chunk 393432 + 预热 483087 + 475777） |
| 切到 IELTS | 新增 lazy chunk `words-CZ5ER7rC.js`（**lazy 生效**） |
| 键盘输入 | `Input.dispatchKeyEvent` 敲 `e/a`，正确率 100% → **0%**，PracticePanel 正常接收 |
| 断网 + 重载 | SW ready=ok / active=**active**，页面完整渲染（precache 生效） |
| 全流程控制台 error | **0** |

> ⚠️ 一个**不在判据里、但真实存在**的事实：首屏 JS 里 **2/3 是预热词包**（`WARMUP_IDS=['kaoyan','toefl']`），raw 合计 1320.6 KiB。判据 3 量的是预热**gzip ≤ 600 KiB**（实测 330.02），两者口径不同、都成立；但「首屏到底轻不轻」这个问题，真实答案是 **主 chunk 轻量（384.21 KiB）、首屏总 JS 并不轻**。这条记下来，不属于本次改动范围（判据与预算一行未动）。

### O1 学习流程（实走通）

`词库下拉选「雅思核心 IELTS 3000 词」→ 打字页 → 敲键 → 背单词页 → 复习页 → 进度页 → 回首页`，全程无报错、无白屏。页签恰好 5 个：`今日 / 打字练习 / 背单词 / 复习 / 进度`。

**但完整学习单元里只有「词汇」一种内容。** 首页三张卡（到期复习 / 弱项专项 / 新词练习）**全部由词库驱动**，没有任何一个入口指向 audio / listening / exercise。

### O2 关联真的缺失（三重证据，全部实测 0）

| 探测 | 结果 |
|---|---|
| UI 页签命中内容类型词 | 0（页签集合恒为 5 个学习动作） |
| UI 渲染文本：「音频 / 听力 / 字幕 / 课程 / 单元」 | **0 / 0 / 0 / 0 / 0** |
| DOM 中出现 `demo-audio-01` / `demo-listening-01` / `demo-exercise-01` | **0 / 0 / 0** |
| 全部可点控件（`button/a/[role=tab]/select`，共 15 个）命中内容类型词 | **0** |

代码侧对得上：

- `src/core/content/relation/relation.ts:11` 明写「当前（V4.1-P0）**不产出任何 relations.json**：无 topic/audio 内容前建关系是空数据」；`RELATION_TARGET_TYPES` 里 `appears_in → audio/listening/reading` 这张表**已经画好了，但一个数据点都没有**。
- UI 只消费 `getVocabularyPackages()`（`src/data/wordBanks.ts:58` → `src/hooks/useBank.ts:64` `banks = WORD_BANKS + customBanks`），8 个非 vocabulary 包（audio / listening / exercise / reading / topic / writing / speaking / collection）**在 UI 层零入口**。

### O1 / O2 / O3 结论

- **O1 ✅**：现有内容**能**被理解成一个学习单元 —— 只是这个单元 = **一个词库**，流程完整、无断点。
- **O2 ✅（触发依据成立）**：关联**确实**缺失，而且不是「弱」，是**零**。
- **O3 ✅**：lazy 机制符合真实使用；唯一要记住的是首屏总 JS 1320.6 KiB（其中预热词包占 2/3）。

### ⚠️ 但 O2 成立 ≠ 该开「course/lesson 实体化」

实测证明缺的不是「course/lesson 这层数据结构」—— `CONTENT_TYPES` 白名单里 `course`/`lesson` **早就有了**（`scripts/content/license-policy.mjs:54-58`），i18n 文案（`type.course.label=课程`、`type.lesson.label=单元`）也早就有了，`CONTENT_TYPE_REGISTRY` 全表已就位。

**真缺的是产品层**：没有任何页面把 vocabulary / audio / subtitle / exercise 聚合成一个可进入的学习单元。

> 所以如果现在就上实体化，得到的是「有 course → lesson 结构、但 UI 依然点不进音频和练习」的空壳 ——
> 数据结构会更"像课程"，产品体验一个字没变。**这是个比实体化更前置的缺口。**

---

## §3 第二阶段准入条件（就一句，2026-10-02 终裁后为**不成立**，不是「待定」）

> ~~只有当 O1/O2/O3 的实际 UI/使用验证证明「现有跨包结构不足以表达课程 → 章节关系」时，才开 Course/Lesson 实体化。~~

**该条件已被 O2 实测满足，但满足它的后果被终裁改判了**（见 §0.1）：

- 原设想：O2 成立 ⇒ 开 course/lesson 实体化。
- 终裁：O2 成立 ⇒ **只开启 Stage 2 产品探索**，实体化**继续未授权**。
- 所以「准入条件」这一节在本文中被**作废**，不再作为任何改动的前置依据。
  任何要动 `registry.ts` / 建 `content/course|lesson` 的动议，前置条件改为 §0.1 状态树里的第 3 条：
  **必须出现「一个课程里有 N 个单元、需要分组导航」的真实产品需求**，且需重新评审。

### 2026-10-02 实跑后的判定：**准入条件成立，但开的是另一刀**

O2 实测通过（跨包关联为零，详见 §2.5），准入条件这一条**已经满足**。
但按 §2.5 末尾的警告，正确的下一刀是：

1. **先开「学习单元聚合页」**（产品层）：一个页面把 vocabulary + audio + subtitle + exercise 放到同一个可进入的学习流程里，让 `demo-audio-01` / `demo-listening-01` / `demo-exercise-01` 第一次真正可达。
2. **再让 relation 数据落地**：`relation.ts:11` 那句「无 topic/audio 内容前建关系是空数据」停止成立；`appears_in → audio` 这条边第一次有数据点。
3. **course/lesson 实体化排在最后**——只有出现「一个课程里有 N 个单元、需要分组导航」的**真实产品需求**（不是数据结构需求）时才做。

**这一刀仍然不碰 `registry.ts` 的结构**（第 1、2 步都不必然改它），所以 Stage 1 已 CLOSED 的基线依旧保得住；判据 2 保持 15、判据 5 不增、主 chunk 余量不动。

这样做的价值：**每一刀都有「真实产品需求 → 明确代码变化 → 明确验证代价」**，而不是提前为「可能的需求」付成本。

---

## §3.1 首屏 1320.60 KiB：记录观察，**不整改、不重新打开 Stage 1**

§2.5 实测到一个工程判据看不见的事实：主 chunk 预算合格（384.21 raw / 119.06 gzip，余量 12.6% / 15.9%）、
预热 gzip 也合格（330.02 ≤ 600），但**首屏真实 JS 合计 1320.60 KiB，其中 2/3 是 `WARMUP_IDS=['kaoyan','toefl']` 的预热词包**。

> 工程预算合格 ≠ 用户感知上的首屏足够轻。这是一个**有价值的产品性能观察**，不是工程缺陷。

终裁处置（写死，防止后面有人拿它当理由重新打开 Stage 1）：

1. **保持现在的处理方式，不动**：不改 `WARMUP_IDS`、不调预热策略、不动 `scripts/check-bundle.mjs:63-64` 的预算常量；
2. **不重新打开 Stage 1**：这条观察不构成任何 Stage 1 判据的 FAIL，判据 6 条一行未动；
3. **要和下一刀一起观察才有结论**：等做学习单元聚合页时，统一测量下面这条完整链路
   `首屏 → 进入 IELTS → 打开学习单元 → 加载音频 / 字幕 / 练习`，
   届时才能判断「预热策略」到底是产品问题还是压根不在首屏关键路径上。

**在这条链路被实测之前，任何人不得以 1320.6 KiB 为由改动 `scripts/check-bundle.mjs` 或预热清单。**

---

## §4 本阶段明确不做（写死）

1. 不建 `content/course/*`、`content/lesson/*`；
2. 不改 `registry.ts`，不增判据 2 / 判据 5 探测项；
3. 不改主 chunk 预算、不动 5 个文本判据、不碰 `scripts/`、`tests/`、`content/`；
4. 不重新打开 N5（codegen）——维持「不做」；
5. 不批量导入 IELTS / CET4/6 / TOEFL / 考研 / 新概念。
