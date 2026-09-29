# W2A 验证内容对照图（Verification Content Map）

> 用途：把已 CLOSED 的 W2A 证据链（matrix commit `e32a03a`，verify 49/49）与
> **实际验证了什么业务行为** 一一对应，供逐条审计。本文是审计索引，不是新证据；
> 原始断言输出见 `docs/audit-package/_generated/evidence/W2A/W2A-TEST-PERSISTENCE-BOUNDARY-20260929-233918-R01.txt`。

## 0. 统计口径（三个数字的关系，审计前先读）

| 数字 | 统计层级 | 含义 |
|------|----------|------|
| **49/49** | Evidence Chain 链路层 | 6 个 Evidence 任务 × 每任务 7 步链检查（RunId/文件名/存在/Hash/头部 RunId/Commit/ExitCode）+ Status⇔ExitCode + orphan 检查，合计 49 个验证项 |
| **53** | 测试断言层 | TEST-PERSISTENCE-BOUNDARY 单个测试任务**内部展开**的行为断言数；`53 = 7 + 24 + 6 + 15 + 1`（adapter 7 + namespace 24 + codec 6 + repository 15 + 真实快照 1） |

**二者统计层级不同，不应直接比较**：49/49 回答「证据链是否自洽」；53 回答「这个测试任务覆盖了哪些业务行为」。一个 Evidence 任务内部的断言数可以任意增减，不影响链路验证项数。

**注册表 20 静态键 vs 真实快照 16 键**：注册表收录的是**代码观测键**（src/ 全量扫描），非「当前快照存在的键」。二者关系（2026-09-29 实测）：

- 快照 16 键 ⊂ 注册表 20 静态键：**16/16 全部可被注册表识别，0 个遗漏**；
- 差集 4 键 = `gt.streak.v1` / `gt.diag.v1` / `gt.customBanks.v1` / `gt.voice`——来自代码触点校准（`src/lib/streak.ts` / `diagnostics.ts` / `customBanks.ts` / `speech.ts`），这些功能存在但本快照用户未触发写入，**并非台账虚报**；
- 另有动态族 `gt.learning.v3:<contentId>`（Wave 1 演练目标键族）不计入静态键数，注册表合计 21 族。

**漂移约束**：测试断言数或注册表键数变化时，本文 §2.2/§2.5 的分组算式必须与测试套件内的自校验断言（`注册表总量 = 21`）同步更新——数字漂移视为文档缺陷，不靠审计者心算兜底。

## 1. 六项 Evidence 任务各自证明什么

| Task | 证明内容 | 证明力边界 |
|------|----------|-----------|
| TSC | 四模块类型正确；裸 string 不可赋给 tagged 版本类型；接口契约成立 | 编译期，不证明运行时行为 |
| LINT | 无 lint 违规 | — |
| GATE-LEARNING-BOUNDARY | 新增模块未引入 UI→学习态直连的新违规（B02 门禁仍全绿） | 只覆盖学习域既有规则 |
| BUILD | 产物可构建 | — |
| TEST-PERSISTENCE-BOUNDARY | **本 Wave 核心**：53 项行为断言（§2 逐条映射） | Node 内存桩语义，真 IDB/浏览器行为未覆盖（本 Wave 无浏览器路径） |
| TEST-E2E | 169 项端到端断言全绿 → **增量模块对现有应用零行为回归** | 回归证明，不是新功能证明 |

## 2. TEST-PERSISTENCE-BOUNDARY 53 项逐组映射

### 2.1 StorageAdapter（7 项）——证明 localStorage 唯一入口的接口语义

| 断言 | 业务行为 |
|------|----------|
| 空读 → null | 不存在的键返回 null 而非 undefined/抛错（localStorage 语义同构） |
| set/get round-trip | 写后读一致（字符串保真） |
| has | 存在性判断与 get 独立成立 |
| keys 枚举 | 全量键枚举供域过滤使用 |
| remove 后 null | 删除生效且 has 同步为 false |
| LocalStorageAdapter set/get | 浏览器适配层直连 localStorage 行为一致 |
| LocalStorageAdapter keys/has/remove | 浏览器适配层枚举（length/key(i) 遍历）行为一致 |

### 2.2 namespace 注册表（24 项）——证明 gt.* 键台账的完整性与判红规则

| 断言组 | 业务行为 |
|--------|----------|
| 20 个实测键逐个 → owner/kind（learning 7 / analytics 1 / migration 1 / diagnostics 1 / content 1 / settings 9） | 每个线上键的**归属域与版本属性**被台账锁定——这是迁移三批（§1）的键位依据 |
| 动态键族 `gt.learning.v3:<contentId>` 可解析 | 未来版本化键族（Wave 1 演练产物）在台账中合法 |
| 注册表总量 = 21 | 台账数量自校验（新键必须显式登记，防漂移） |
| 未注册 gt 键 → null / 非 gt 键 → null | 解析函数对两类非法输入返回 null（不误判） |
| assertWritable 合法键通过 | 合法写入路径畅通 |
| assertWritable 未注册 → NamespaceError | **未注册键写入判红**（§1 冻结不变量） |
| assertWritable 非 gt → NamespaceError | 非 gt.* 键禁止经 persistence 层写入 |

### 2.3 codec（6 项）——证明读兼容存量、写可选 canonical

| 断言 | 业务行为 |
|------|----------|
| jsonCodec round-trip 与原生 JSON 序列化结果逐字节一致（断言：`jsonCodec.encode(v) === JSON.stringify(v)`，字符串严格相等）+ 值往返 `JSON.stringify(decode(encode(v))) === JSON.stringify(v)` | **存量线上格式逐字节兼容**——现有 19 个触点的数据不改格式即可继续读写。注：值往返用 `JSON.stringify` 比较，在键序一致的前提下字节相同；语义等价而非「任意键序都字节相同」——任意键序的字节稳定性由 canonicalCodec 承担 |
| canonicalCodec 键序置换 encode 相同 | JCS 规范化在写入侧生效（§7/§19-6） |
| canonicalCodec é 组合字符等值 | NFC 附加规范化生效（冻结强制测试） |
| canonicalCodec decode 兼容存量 JSON | canonical codec 读旧数据不炸（decode = JSON.parse） |
| jsonCodec decode 损坏 → CodecError | 数据损坏显式判红，不静默返回垃圾 |
| canonicalCodec encode NaN → CodecError | §7 判红规则（NaN/BigInt/unsafe int 等）在 codec 层透传 |

### 2.4 Repository（15 项）——证明按域分仓与跨域判红

| 断言 | 业务行为 |
|------|----------|
| 同域写读 round-trip | 业务域经 Repository 读写本域键正常 |
| 跨域读放行 | 迁移批次 / 审计可以读任意域（§1 迁移需要） |
| 跨域写判红 | settings 仓不得写 learning 键（**域隔离**，未来 UI 误接线的运行时防线） |
| 未注册键写判红 / 非 gt 键写判红 | Repository 层复验 namespace 规则（双保险） |
| 跨域删判红 | REMOVE OLD 也受域约束（§19-5 的运行时防线之一） |
| setRaw 过 namespace 但不经 codec | 迁移/审计原始通道：绕 codec 但不绕台账 |
| 跨域 setRaw 判红 | 原始通道同样受域约束 |
| 按次 codec 注入（canonical 写入） | 逐调用 codec 覆盖生效（迁移后新键用 canonical 格式的机制） |
| remove 同域放行 | 合法删除路径畅通 |
| keys() 只返回本域键 / settings keys() 域过滤 | 按域枚举正确（迁移批次① 只动 learning 域键的机制基础） |

### 2.5 真实快照校准（1 项）

| 断言 | 业务行为 |
|------|----------|
| 真实快照 16 键全部在注册表内 | **你的真实数据是台账的真值校准源**——本轮校准出漏扫键 gt.lang 并补登记 |

## 3. W2A 明确不覆盖（诚实边界）

1. **UI / 组件层行为**：W2A 是纯增量基础设施，应用代码零改动——不证明任何 UI 场景（由 E2E 回归间接覆盖）。
2. **静态 boundary gate**：`UI ❌→localStorage`、`业务域 ❌→StorageAdapter` 目前**只有运行时判红**（Repository/namespace），静态扫描 gate 属于 Wave 3（A-3 AST 三阶段）。
3. **quota.ts / diagnostics.ts 未实现**：§1 A-1 清单中的配额管理与诊断模块本 Wave 未建——将在迁移批次需要时落地，此处显式披露而非静默缺省。
4. **浏览器真 IDB / 多页签行为**：本 Wave 无 IDB 路径（W1A/W1B 已覆盖 Lock/Guard 的浏览器语义）。
5. **性能**：无性能断言（D 档基线属 Wave 5）。
6. **数据迁移本身**：W2A 只建台账与通道；三批迁移的执行与 R5 快照对照在 W2C+。

## 4. 这些模块在后续 Wave 如何被真实验证

| Wave | 验证方式 |
|------|----------|
| W2B Service Split | LearningService 10 职责域拆分后经 Repository 读写——现有 learning 套件（service 15 / storage / insights）必须全绿 = 接线正确 |
| W2C 迁移批次① | learning 域键经 Orchestrator（W1D）+ Repository 真实迁移，R5 快照对照真实数据 |
| Wave 3 AST Gate | `UI ❌→localStorage` / `业务域 ❌→StorageAdapter` 升级为 AST 静态门禁 |
| 每轮 Evidence | TEST-PERSISTENCE-BOUNDARY 进 W2 起固定任务清单，防回归 |

## 5. Acceptance Conclusion（W2A 收口结论）

**W2A CLOSED 的证明范围**：

1. Persistence 基础通道行为已通过 53 项行为断言验证（7 + 24 + 6 + 15 + 1）；
2. Evidence Chain：6/6 Evidence tasks 全 PASS、49/49 chain checks 全绿，matrix commit == HEAD（`e32a03a`）；
3. 真实快照 16/16 键均可由 namespace registry 识别，0 遗漏（差集 4 键为代码触点校准，见 §0）；
4. Repository 的跨域写/删边界已具备**运行时判红**；
5. §3 不覆盖项已显式列出，**不作为 W2A 的隐含证明**；
6. 后续 W2B（Service Split）/ W2C（迁移批次①）/ Wave 3（AST Boundary Gate）/ Wave 5（性能）各自承担自己的验证责任。

**因此：W2A = CLOSED，且不将未覆盖范围误计入 W2A 证明范围。**

（本节为结论钉死，不产生新证据；W2A 的全部证据仍以 `docs/audit-package/_generated/evidence/W2A/` 下的 6 份 artifact 与 verify 链输出为准。）
