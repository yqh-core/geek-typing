# Stage 2 第一阶段 = CLOSED / 验证完成（2026-10-02）

> 裁定（评审第七轮）：**暂不上课程/章节实体化。第一阶段样板链路已全量验证，实现边界锁在 `5a71b33` 不动。**
> 这一步的性质变了：**从工程验证进入产品验证**。
> 当前最重要的不是「为了完善架构而完善架构」，而是**保护已经形成的稳定基线**。

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

## §3 第二阶段准入条件（就一句）

> **只有当 O1/O2/O3 的实际 UI/使用验证证明「现有跨包结构不足以表达课程 → 章节关系」时，才开 Course/Lesson 实体化。**

届时一次性做：`content/course/<id>/manifest.json` → `registry.ts` → 判据 2 → 判据 5 → check-bundle → e2e → CI。

这样做的价值：**每一刀都有「真实产品需求 → 明确代码变化 → 明确验证代价」**，而不是提前为「可能的需求」付成本。

---

## §4 本阶段明确不做（写死）

1. 不建 `content/course/*`、`content/lesson/*`；
2. 不改 `registry.ts`，不增判据 2 / 判据 5 探测项；
3. 不改主 chunk 预算、不动 5 个文本判据、不碰 `scripts/`、`tests/`、`content/`；
4. 不重新打开 N5（codegen）——维持「不做」；
5. 不批量导入 IELTS / CET4/6 / TOEFL / 考研 / 新概念。
