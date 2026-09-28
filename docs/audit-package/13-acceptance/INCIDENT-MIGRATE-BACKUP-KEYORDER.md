# INCIDENT-MIGRATE-BACKUP-KEYORDER · 迁移备份的 analytics 键序重排（回滚失保真）

| 项 | 内容 |
|---|---|
| 事故 ID | **INCIDENT-MIGRATE-BACKUP-KEYORDER** |
| 严重度 | **P1**（回滚保真度：`G3-6` 判据「旧键逐字节还原」被破） |
| 发现时间 | 2026-09-28（P1.5-S3 `browser-migration-e2e` **首跑**） |
| 修复时间 | 2026-09-28（同轮，S3 内） |
| 状态 | ✅ **CLOSED** |
| 关联门禁 | **G3-6**（回滚）+ **G3-3/G3-4**（纯函数 / 幂等，已复跑确认零破坏） |

---

## 1. 现象

`browser-migration-e2e` 的 `⑤ rollback 后 legacy 四键逐字节恢复` 判红：

```
gt.analytics.v1 分歧@2
  baseline = {"letters":{"t":{"hit":30,"miss":4},"e":…
  restored = {"words":{"treeshaking":{"done":5,"wrong":…
  len = 232 / 232
```

**长度完全相同（232/232），只是键序不同** —— `letters` 与 `words` 的位置被互换。

## 2. 根因（精确到字段）

`src/lib/learning/migrate.ts` 的 `splitSnapshot()` 在 `:151-158` 把 analytics **重构为
固定字段序**：

```ts
analytics: {
  words,            // ← 提到最前
  letters,
  totalKeys: …, totalCorrect: …, totalWords: …, bestWpm: …,
}
```

而 `:571` 的 backup 直接引用这个**重构后的对象**：

```ts
const backup = JSON.parse(JSON.stringify({ review, memorize, analytics: analytics ?? {}, customBanks }))
```

⇒ 回滚时 `JSON.stringify(backup.analytics)` 的键序 = **重构序**（words 在前），
≠ 迁移前原文（letters 在前）。review / memorize / customBanks 无字段重构，不受影响。

## 3. 为什么实验室测试没逮住（这条最值得记）

`tests/learning-storage.mjs` 的 G 段回滚测试是**自己构造 backup 对象**（`{review, memorize,
analytics, customBanks}` 原样），因此**从未断言过 migrate 真实产物的 backup** ——
测试与实现在这一点上**同源假设**，缝隙正好落在两者之间。

**只有「真实浏览器 + 真实源码 + 真实落盘顺序」的 e2e 才把这条顶出来** —— 这是 S3 存在的理由。

## 4. 修复（最小、零破坏）

`migrateV1toV2` 的 opts 新增**可选**注入点：

```ts
preserveBackupKeys?: Partial<Record<'analytics', string>>
```

backup 构造改为：

```ts
analytics: opts.preserveBackupKeys?.analytics
  ? JSON.parse(opts.preserveBackupKeys.analytics)   // 原文 parse ⇒ 键序 === 原文
  : (analytics ?? {}),                              // 不注入 ⇒ 旧行为（语义恢复）
```

调用方（浏览器 / S4 接线）注入 `localStorage.getItem('gt.analytics.v1')` 即得**逐字节还原**。

**为什么选「可选注入」而不是改 `splitSnapshot`**：
- `splitSnapshot` 的字段序是**迁移逻辑的既有契约**，改动它会影响三档分档与 `buildSourceKeys` 的
  多处消费点 —— 属于「为修一个回滚细节而动主干」，与「不大范围重构」的红线冲突。
- 可选注入让**不需要逐字节保真的路径**（SSR 门禁、合成数据）行为完全不变 ⇒ **零破坏**。

## 5. 证据链

| 环节 | 证据 | 结果 |
|---|---|---|
| 缺陷复现 | `browser-migration-e2e` 首跑 ⑤ 判红（分歧@2，len 232/232） | ❌ 复现 |
| 修复实现 | `git diff src/lib/learning/migrate.ts` | 见 `02-current-diff.patch` |
| **修复验证** | `browser-migration-e2e` 复跑 | ✅ **19/19 PASS**，`⑤ … 逐字节恢复 — byte-identical` |
| **零破坏（SSR 侧）** | `test:storage` / `test:migration` / `test:learning` 复跑 | ✅ **78/78** · **27/27** · 全绿 |
| 类型 / 构建 | `tsc -b` | 干净 |

## 6. 同轮附带发现（🟡 取证纪律，已写入脚本注释）

reload 后**真实 App 会重新挂载并自写 localStorage**（`gt.streak.v1` 当日初始化等）。
因此 rollback 后的取证**不能靠「事后再 dump 一次」** —— React 内存态随时可能把刚恢复的值
覆写回去，造成「看起来 rollback 没生效」的假阴性。

已在脚本内改为**同一 `evaluate` 的同步窗口内读取恢复值**：
`rollbackLearningV1()` 调用后**立即**在同一个 evaluate 里 `getItem` 带出结果。

> **S4 接线迁移时的浏览器验证必须沿用这条纪律** —— 否则会重踩同一个坑。
EOF
