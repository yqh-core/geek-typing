# Stage 2 第一批标准化内容包 · 样板方案（2026-10-02）

> 裁定（评审第六轮）：**样板素材 = 现有 `ielts` 包；第一阶段不新建内容包、不做生成器、不扩 schema、不批量导入。**
> 从现有 IELTS 骨架中取最小完整单元，跑通
> **内容包 → validate → lazy loading → check-bundle → e2e**，再作为后续 IELTS / CET4/6 / TOEFL / 考研批量导入的模板。

---

## §0 先摆一个事实：「课程 → 章节」这一层今天在仓库里是空的

裁定里写的链路是 `IELTS → Course → Chapter → vocabulary/text/metadata/audio/subtitle/exercises`。
实测三件事：

1. **`CONTENT_TYPES` 里已经有 `course` 和 `lesson`**（`scripts/content/license-policy.mjs:54-58`）
   —— 所以「课程/章节」**不需要扩 schema**，类型本来就在白名单里；
2. **但 `content/course/` 与 `content/lesson/` 两个目录都不存在**（`ls` 实测报 No such file），
   这两个类型**零包**；
3. 今天能跑的「章节元素」只有**已注册的那几个 demo 类型包**（`ielts` 词汇 + `demo-audio-01` 音频 +
   `demo-listening-01` 听力/字幕 + `demo-exercise-01` 练习），它们**分散、彼此无关联**，
   没有一个实体把「一个章节 = 词汇 + 音频 + 字幕 + 练习」串起来。

> **结论**：把「课程/章节」落成实体 ⇒ **必然新增 1 个内容包 + 改 `registry.ts` +
> 判据 2 的 lazy 计数 +1 + 判据 5 的探测集 +1 包**。
> 而 N5 刚裁定「registry.ts 保持手写单一事实源、5 个文本判据一律不改」，本轮又定「保护 Stage 1 的 CLOSED」。
>
> ⇒ 两处纪律叠起来的答案是：**课程/章节实体化排到第二阶段；第一阶段跑「现有包跨包串联」这条零改动的链路。**
> 这也正好落在裁定那句「第一样板的价值在于验证**现有内容能不能被标准化**，而不是从零造一个漂亮 demo」上。

---

## §1 第一阶段样板：一个「章节」= 现有 4 个 lazy 包的标准化串联（零改动）

沿用现有 18 包，不改一行内容、不改 registry、不改 schema，验证的是
**「现有内容按标准化方式组织 + 整条链路能不能跑通」**：

| 章节元素 | 用哪个现有包 | 类型 | 现状 |
|---|---|---|---|
| 词汇（word bank） | `ielts` | vocabulary | lazy，`content:vocabulary:ecdict-ielts:ielts` |
| 音频 | `demo-audio-01` | audio | lazy |
| 字幕 / 听力 | `demo-listening-01` | listening | lazy |
| 练习 | `demo-exercise-01` | exercise | lazy,`stats.items = 5` |

链路命令（每条都要过，缺一不可）：

```bash
node scripts/content/validate.mjs          # 内容侧 22 项判据（含策略一致性判据 20）
node scripts/content/license-policy.mjs    # 许可 / checksum
CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build
node scripts/check-bundle.mjs              # 判据 5：这些 lazy 包是否闯进主 chunk
npm run test:e2e                           # 171 项，含预热探针（清单内 chunk 真的被 SW 缓存）
```

> `ielts` 的素材授权是干净的：`manifest.sources[0].license = MIT`（ECDICT，commercialUse=true、
> attributionRequired=false）—— 这是它能当第一样板的原因之一。
> **新概念不在第一阶段**：非自有/未明确授权的教材、音频、字幕不进仓库，只验证数据结构与导入机制。

---

## §2 第二阶段（下一刀）：课程/章节实体化的**精确代价**（先算清楚再动）

不再是「大概要改点东西」，是这 4 个确定项 + 2 个判据数：

1. `content/course/<courseId>/manifest.json` —— 新建目录（类型 `course` 已在白名单，**不用扩 schema**）；
2. `src/core/content/registry.ts` —— 加 manifest import + loader + `packages[]` 项（**3 处**）；
   `WARMUP_IDS` 不动（清单上限仍是 2）；
3. **判据 2**：lazy 包数 15 → 16（`check-bundle.mjs:805` 的 `lazyCount` 来自 `parseRegistryEntries`）；
4. **判据 5**：`collectLazyProbes` 多解析 1 个包，探测集 +1（若是纯 ASCII 英文包走主路径，
   若是骨架类走 `:348` 兜底）；
5. **预算**：主 chunk 余量 12.6% / 15.9% 再降一档 —— 新 manifest 只进主 chunk 的部分是**白名单投影后**的字段
   （`manifest-runtime.mjs` 裁掉 `sources / contentHistory / build` 共 12.04 KiB），单包开销可控但**要重跑 M1 确认**。

⇒ 第二阶段的准入条件：**M1–M7 七条机器判在改动后仍全绿**，且判据 2 的「数据 chunk 数 ≥ registry lazy 包数」不破。

---

## §3 本阶段明确不做（写死，防止顺手扩展）

1. **不做 codegen / 生成器**（N5 已裁不做）；
2. **不扩 schema** —— `course` / `lesson` 已在白名单，实体化不需要改 schema 字段；
3. **不批量导入** —— IELTS / CET4/6 / TOEFL / 考研一个都不加；
4. **不引入新概念等授权不明素材**；
5. **不动 `registry.ts`、不动 5 个文本判据**，不破 Stage 1 的 CLOSED。

---

## §4 验收口径

第一阶段跑完要能同时说出这四句（缺一句就不算跑通）：

1. 内容侧 22 项判据全过（含判据 20 策略一致性：这些包 manifest 说的 policy 与 registry 实际加载方式一致）；
2. `check-bundle` 判据 5 PASS（这 4 个 lazy 包一个都没进主 chunk）；
3. e2e 仍是 `共 171 项，通过 171`（用例数不漂移）；
4. M5 / M6 仍 0 / 空（预算常量零改动、INV-1 冻结区零改动）。
