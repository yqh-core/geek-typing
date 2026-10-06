# P19 · 首页落地页静态化 + 产品页完善

本目录是 P19 阶段的方案与证据。**不在 `docs/audit-package/` 内**（INV-1 冻结区，`verify:p17-frozen` 判红）。

## 文件

| 文件 | 内容 |
|---|---|
| `HOME-LANDING-SYSTEM-DESIGN.md` | 架构方案（3 条路线核算 + 选型 + 信息架构 + 文案 + 文件清单 + 任务分解 + 共享知识 + 待明确事项） |
| `HOME-LANDING-EVIDENCE.md` | 证据矩阵（三态，UNKNOWN 视为不通过） |
| `sequence-diagram.mermaid` | 构建期 + 运行期完整调用时序 |
| `class-diagram.mermaid` | 数据结构与模块关系 |

## 一句话结论

构建后把一个**自带内联样式、位于 `#root` 之外**的中文静态落地块注入 `dist/index.html`；
主 chunk raw/gzip 增量**恰为 0 B**，不新增任何依赖，不改任何 `src/` 文件，因此不触碰 INV-2 的 21 条 UI 契约断言。

## 本轮实测基线（设计的依据，非估算）

| 项 | 实测值 |
|---|---|
| 主 chunk | 426,052 B raw / 130,283 B gzip |
| 门禁阈值 | raw 450,000 B / gzip 145,000 B（absolute 卡住） |
| 余量 | raw 23.39 KiB / gzip 14.37 KiB |
| React 19 对静态节点的行为 | `#root` 内 → **被清空**；`#root` 外 → **存活**（真机 Chrome 实测） |
| 落地块体积 | 7 区块实测 1,256 B raw / 776 B gzip |