# P18-J `_extra/` —— 波次顶层之外的人工证据

顶层证据根（`<WAVE>-<TASK>-<ts>-R<attempt>.txt` + `evidence-matrix.*`）由
`node scripts/evidence-run.mjs --wave=P18-J` 生成，orphan 判据（P18* 严格）要求
**顶层恰好等于 matrix 引用集**，因此下面这批「matrix 覆盖不到、但本波必须留证」的产物
统一放子目录 `_extra/`：扫描 orphan 时 `readdirSync` 非递归，子目录不计入判定。

| 文件 | 内容 | 为什么 matrix 没有 |
|---|---|---|
| `P18-J-E2E.txt` | `npm run test:e2e` 尾部计数（**170 项 / 170 通过**） | P18 族任务表**不含 TEST-E2E**（实测过：矩阵 23 项无 e2e），e2e 打 `vite preview` 读 `dist`，必须在 build 之后单独跑 |
| `P18-J-CHECK-BUNDLE-03-05.txt` | 干净态判据 3（预热 gzip 预算 330.02 KiB ≤ 600 KiB）与判据 5（13 个 lazy 包探测串命中 0）逐包明细 | matrix 的 `CHECK-BUNDLE` 只留整门摘要，逐包明细不进顶层 |
| `P18-J-INJECT-A-LOAD-TO-WORDS.txt` | 注入 A：registry 把 `load:` 改回 `words:`（不 rebuild）⇒ **判据 5 不红**（探测集从 13 包缩到 12 包，frontend 被静默摘出），判红的是 `content:validate` 判据 20 | 本波判据 5 的证伪必须落在真实文件上，不能只跑内置 `--falsify` |
| `P18-J-INJECT-B-REAL-LEAK.txt` | 注入 B：保留 `load:` 同时静态导入 frontend 词表 + rebuild（真泄漏）⇒ 判据 2 FAIL + 判据 5 UNKNOWN（frontend 部分命中 7/8）⇒ 门红 | 同上，且证明判据 5 在泄漏态不再被自己的探测集卡死 |
| `P18-J-WARMUP-UNTOUCHED.txt` / `P18-J-WARMUP-COMMENT.txt` | 预热三处（registry `WARMUP_IDS` / `check-bundle` `WARMUP_MAX_IDS` / `warmup-ids-baseline.json`）改前改后逐值对照 + 结论注释摘录 | 「本波不动预热」是决策，需要可复核对账，不是口头结论 |

## 两条注入的还原

两条注入结束后均 `cp` 回干净 `registry.ts` 并 `CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build`
重新构建，复跑 `npm run check:bundle` ⇒ **PASS：6 项全部通过**，工作树 `git status` 仅剩本目录未跟踪。
证据文本里的「注入后」输出即当时的真实终端输出，未做美化。
