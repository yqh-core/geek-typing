# P18 全量复跑留档（FINAL-TEST-OUTPUT）

> 生成时间：2026-10-01 04:05:14 UTC（本地 2026-10-01 12:05:14    ）
> HEAD：12de9c9c9422389482f2d31c20cd2406af69e9a9   短：12de9c9
> 工作区（跑之前）：1 项改动
> Node：v22.22.2
> 纪律：build 前先 `git clean -xdf dist`（本机 safe-delete shim 会拦 vite 的 emptyOutDir）；
> 所有 --falsify 一律重定向到文件，禁止 `| head`（SIGPIPE 会留下注入残留）。


## build（先清 dist 再构建）

```
$ git clean -xdf dist >/dev/null 2>&1; npm run build

> geek-typing@0.0.0 build
> tsc -b && vite build

[36mvite v8.3.1 [32mbuilding client environment for production...[36m[39m
transforming...
✓ 2000 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   2.00 kB │ gzip:   0.99 kB
dist/assets/index-BY9zjKPL.css   24.32 kB │ gzip:   5.62 kB
dist/assets/items-DmPF5pYO.js     0.28 kB │ gzip:   0.15 kB
dist/assets/items-DQGvlaRY.js     0.32 kB │ gzip:   0.16 kB
dist/assets/items-CPQpZdSj.js     0.33 kB │ gzip:   0.17 kB
dist/assets/items-BphUzBAL.js     0.34 kB │ gzip:   0.16 kB
dist/assets/items-C1gfAA7F.js     0.34 kB │ gzip:   0.18 kB
dist/assets/items-CWf1qPZM.js     0.35 kB │ gzip:   0.17 kB
dist/assets/items-DAoYvA5X.js     0.41 kB │ gzip:   0.19 kB
dist/assets/items-DjPFrbAC.js     0.44 kB │ gzip:   0.22 kB
dist/assets/index-BWml2sHn.js   436.90 kB │ gzip: 139.53 kB
dist/assets/words-uy6NfwIr.js   475.77 kB │ gzip: 170.27 kB
dist/assets/words-CZ5ER7rC.js   482.60 kB │ gzip: 173.99 kB
dist/assets/words-2QG2Fjtl.js   483.08 kB │ gzip: 173.94 kB

[33m[33m[INEFFECTIVE_DYNAMIC_IMPORT] [0msrc/core/content/query/content-query.ts is dynamically imported by src/core/content/registry.ts but also statically imported by src/core/content/index.ts, src/core/content/index/content-index.ts, dynamic import will not move module into another chunk.
[39m
[32m✓ built in 2.88s[39m
```

**EXIT=0**

## tsc -b --noEmit

```
$ npx tsc -b --noEmit
```

**EXIT=0**

## lint

```
$ npm run lint

> geek-typing@0.0.0 lint
> oxlint


  ! eslint(no-unused-vars): Identifier 'statSync' is imported but never used.
    ,-[scripts/ast/ui-contract-ast.mjs:56:23]
 55 | import { Node, Project, SyntaxKind, ts } from 'ts-morph'
 56 | import { readdirSync, statSync } from 'node:fs'
    :                       ^^^^|^^^
    :                           `-- 'statSync' is imported here
 57 | import { dirname, join, relative, resolve } from 'node:path'
    `----
  help: Consider removing this import.

  ! eslint(no-unused-vars): Identifier 'fileURLToPath' is imported but never used.
    ,-[scripts/ast/ui-contract-ast.mjs:58:10]
 57 | import { dirname, join, relative, resolve } from 'node:path'
 58 | import { fileURLToPath } from 'node:url'
    :          ^^^^^^|^^^^^^
    :                `-- 'fileURLToPath' is imported here
 59 | import { REPO_ROOT, foldString, walkSourceFiles } from './boundary-ast.mjs'
    `----
  help: Consider removing this import.

  ! react(only-export-components): Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components.
    ,-[src/i18n/index.tsx:68:17]
 67 | /** 取当前语言与切换函数 */
 68 | export function useLang(): { lang: Lang; setLang: (l: Lang) => void } {
    :                 ^^^^^^^
 69 |   return useContext(LangContext)
    `----

  ! react(only-export-components): Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components.
    ,-[src/i18n/index.tsx:73:17]
 72 | /** 取翻译函数 */
 73 | export function useT(): (key: string) => string {
    :                 ^^^^
 74 |   return useContext(LangContext).t
    `----

  ! eslint(no-unused-vars): Variable 'KeyFamilyRepository' is declared but never used. Unused variables should start with a '_'.
    ,-[tests/persistence-boundary.mjs:36:9]
 35 | const { jsonCodec, canonicalJsonCodec, CodecError } = codecMod
 36 | const { KeyFamilyRepository, createRepository } = repoMod
    :         ^^^^^^^^^|^^^^^^^^^
    :                  `-- 'KeyFamilyRepository' is declared here
 37 | 
    `----
  help: Consider removing this declaration.

  ! react-hooks(exhaustive-deps): React Hook useEffect has a missing dependency: 'currentWpm'
     ,-[src/hooks/useTypingRound.ts:380:6]
 309 |               // P1.6-C：完成段交给 App 接 Practice Engine（学习语义中枢）
 310 |               onCompleteWord(current.word, true, currentWpm())
     :                                                  ^^^^^|^^^^
     :                                                       `-- useEffect uses `currentWpm` here
 311 |               window.setTimeout(() => {
 312 |                 lockRef.current = false
 313 |                 setTyped('')
 314 |                 advance()
 315 |               }, 220)
 316 |             }
 317 |             return
 318 |           }
 319 |     
 320 |           /* ================= 经典 / 限时 / 代码模式：严格纠错 ================= */
 321 |           const next = typed + key
 322 |     
 323 |           // ✅ 敲对了（code 模式为原文比较，大小写敏感）
 324 |           if (target.startsWith(next)) {
 325 |             const nextCombo = statsRef.current.combo + 1
 326 |             sound.correct()
 327 |             setTyped(next)
 328 |             updateAnalytics((a) => learningService.applyKey(a, key, true))
 329 |             setErrorFlash(false)
 330 |             setStats((s) => ({
 331 |               ...s,
 332 |               keys: s.keys + 1,
 333 |               correct: s.correct + 1,
 334 |               combo: s.combo + 1,
 335 |               bestCombo: Math.max(s.bestCombo, s.combo + 1),
 336 |             }))
 337 |     
 338 |             // 🎉 连击里程碑提示
 339 |             if (MILESTONES.includes(nextCombo)) {
 340 |               sound.milestone()
 341 |               setMilestone(nextCombo)
 342 |               if (milestoneTimer.current) window.clearTimeout(milestoneTimer.current)
 343 |               milestoneTimer.current = window.setTimeout(() => setMilestone(null), 1400)
 344 |             }
 345 |     
 346 |             // 整个单词敲完
 347 |             if (next === target) {
 348 |               lockRef.current = true
 349 |               sound.complete()
 350 |               setHistory(recordWord())
 351 |               // P1.6-C：完成段交给 App 接 Practice Engine（学习语义中枢）
 352 |               const perfect = statsRef.current.errors === 0
 353 |               onCompleteWord(current.word, perfect, currentWpm())
 354 |               window.setTimeout(() => {
 355 |                 lockRef.current = false
 356 |                 setTyped('')
 357 |                 if (wordIndex + 1 >= queue.length) {
 358 |                   finishRound()
 359 |                 } else {
 360 |                   setWordIndex((i) => i + 1)
 361 |                 }
 362 |               }, 220)
 363 |             }
 364 |             return
 365 |           }
 366 |     
 367 |           // ❌ 敲错了：不允许跳过，必须敲正确的下一个字母
 368 |           sound.error()
 369 |           updateAnalytics((a) => learningService.applyKey(a, key, false))
 370 |           setWrongKey(key)
 371 |           setErrorFlash(true)
 372 |           if (flashTimer.current) window.clearTimeout(flashTimer.current)
 373 |           flashTimer.current = window.setTimeout(() => setErrorFlash(false), 280)
 374 |           setWrongWords((prev) => (prev.includes(targetLower) ? prev : [...prev, targetLower]))
 375 |           setStats((s) => ({ ...s, keys: s.keys + 1, errors: s.errors + 1, combo: 0 }))
 376 |         }
 377 |     
 378 |         window.addEventListener('keydown', handleKeyDown)
 379 |         return () => window.removeEventListener('keydown', handleKeyDown)
 380 | ,->   }, [
 381 | |       typed,
 382 | |       wordIndex,
 383 | |       queue,
 384 | |       targetLower,
 385 | |       target,
 386 | |       current,
 387 | |       finished,
 388 | |       startRound,
 389 | |       mode,
 390 | |       advance,
 391 | |       finishRound,
 392 | |       tab,
 393 | |       commandMode,
 394 | |       wrongWords,
 395 | |       updateAnalytics,
 396 | |       onCompleteWord,
 397 | |       setHistory,
 398 | `->   ])
 399 |     
     `----
  help: Either include it or remove the dependency array.

  ! eslint(no-unused-vars): Variable 'pressKey' is declared but never used. Unused variables should start with a '_'.
     ,-[scripts/audit-capture-full.mjs:238:9]
 237 |   }
 238 |   const pressKey = (key) => async (s) => {
     :         ^^^^|^^^
     :             `-- 'pressKey' is declared here
 239 |     const vk = { Escape: 27, Enter: 13, ' ': 32 }[key] ?? 0
     `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Variable 'typeInto' is declared but never used. Unused variables should start with a '_'.
     ,-[scripts/audit-capture-full.mjs:248:9]
 247 |   }
 248 |   const typeInto = (sel, text) => async (s) => {
     :         ^^^^|^^^
     :             `-- 'typeInto' is declared here
 249 |     await s.send('Runtime.evaluate', {
     `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Variable 'triggerError' is declared but never used. Unused variables should start with a '_'.
     ,-[scripts/audit-capture-full.mjs:391:9]
 390 |   /** 注入运行时错误以触发 ErrorBoundary */
 391 |   const triggerError = () => async (s) => {
     :         ^^^^^^|^^^^^
     :               `-- 'triggerError' is declared here
 392 |     await s.send('Runtime.evaluate', {
     `----
  help: Consider removing this declaration.

  ! eslint(no-control-regex): Unexpected control characters
    ,-[scripts/content/asset-rules.mjs:51:16]
 50 |     // 控制字符一律删除（\u0000-\u001F、\u007F）
 51 |     .replace(/[\u0000-\u001F\u007F]/g, '')
    :                ^^^|^^ ^^^|^^
    :                   |      `-- 'U+001F' is a control character.
    :                   `-- 'U+0000' is a control character.
 52 |     // `:` 与 `/` 会破坏 4 段式 ContentId 解析，退化成 `-`
    `----
  help: Avoid matching control characters in regular expressions. If intentional, disable this rule for the expression.

  ! eslint(no-control-regex): Unexpected control characters
    ,-[scripts/content/asset-rules.mjs:60:9]
 59 |   if (id.includes(':') || id.includes('/')) return false
 60 |   if (/[\u0000-\u001F\u007F]/.test(id)) return false
    :         ^^^|^^ ^^^|^^
    :            |      `-- 'U+001F' is a control character.
    :            `-- 'U+0000' is a control character.
 61 |   return normalizeLocalId(id) === id
    `----
  help: Avoid matching control characters in regular expressions. If intentional, disable this rule for the expression.

  ! eslint(no-unused-vars): Variable 'typesMod' is assigned a value but never used. Unused variables should start with a '_'.
     ,-[tests/learning-model.mjs:279:7]
 278 |   let migrateMod
 279 |   let typesMod
     :       ^^^^|^^^
     :           `-- 'typesMod' is declared here
 280 |   try {
 281 |     migrateMod = await server.ssrLoadModule('/src/lib/learning/migrate.ts')
 282 |     typesMod = await server.ssrLoadModule('/src/lib/learning/types.ts')
     :     ^^^^|^^^
     :         `-- it was last assigned here
 283 |   } catch (e) {
     `----
  help: Did you mean to use this variable?

  ! react-hooks(exhaustive-deps): React Hook useMemo has unnecessary dependency: tab
    ,-[src/hooks/useReviewFlow.ts:48:6]
 47 |     // 切页签时也刷新一次：背单词页的三键打分不在本组件内打点
 48 |   }, [reviewVersion, tab])
    :      ^^^^^^^^^^^^^^^^^^^^
 49 |   const reviewTotal = useMemo(() => {
    `----
  help: Either include it or remove the dependency array.

  ! react-hooks(exhaustive-deps): React Hook useMemo has unnecessary dependency: tab
    ,-[src/hooks/useReviewFlow.ts:52:6]
 51 |     return learningService.getReviewTotalCount()
 52 |   }, [reviewVersion, tab])
    :      ^^^^^^^^^^^^^^^^^^^^
 53 | 
    `----
  help: Either include it or remove the dependency array.

  ! react-hooks(exhaustive-deps): React Hook useMemo has unnecessary dependency: tab
    ,-[src/hooks/useReviewFlow.ts:55:63]
 54 |   /** Today's Practice 推荐快照：错题本变化（或切回页签）时重建 */
 55 |   const recommendation = useMemo(() => buildRecommendation(), [reviewVersion, tab])
    :                                                               ^^^^^^^^^^^^^^^^^^^^
 56 | 
    `----
  help: Either include it or remove the dependency array.

  ! react-hooks(exhaustive-deps): React Hook useMemo has unnecessary dependency: reviewVersion
    ,-[src/hooks/useReviewFlow.ts:55:63]
 54 |   /** Today's Practice 推荐快照：错题本变化（或切回页签）时重建 */
 55 |   const recommendation = useMemo(() => buildRecommendation(), [reviewVersion, tab])
    :                                                               ^^^^^^^^^^^^^^^^^^^^
 56 | 
    `----
  help: Either include it or remove the dependency array.

  ! eslint(no-unused-vars): Variable 'LETTER_KEYS' is declared but never used. Unused variables should start with a '_'.
    ,-[scripts/learning-stress.mjs:90:7]
 89 | const INTERVALS_DAYS = [1, 2, 4, 7, 15]
 90 | const LETTER_KEYS = { hit: 0, miss: 0 }
    :       ^^^^^|^^^^^
    :            `-- 'LETTER_KEYS' is declared here
 91 | const nowMs = Date.now()
    `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Variable 'MEASURE_ONE_SRC' is declared but never used. Unused variables should start with a '_'.
     ,-[scripts/learning-stress.mjs:297:7]
 296 | }
 297 | const MEASURE_ONE_SRC = MEASURE_ONE.toString()
     :       ^^^^^^^|^^^^^^^
     :              `-- 'MEASURE_ONE_SRC' is declared here
 298 | 
     `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Variable 'removed' is declared but never used. Unused variables should start with a '_'.
     ,-[scripts/learning-stress.mjs:621:9]
 620 |   const order = entries.slice().sort((a, b) => b.idx - a.idx)
 621 |   const removed = new Set()
     :         ^^^|^^^
     :            `-- 'removed' is declared here
 622 |   const jsonBytes = (removedSet) => {
     `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Variable 'mem' is declared but never used. Unused variables should start with a '_'.
     ,-[tests/migration-orchestrator.mjs:133:11]
 132 |   seed()
 133 |   const { mem, orch } = freshOrchestrator()
     :           ^|^
     :            `-- 'mem' is declared here
 134 |   // transform 丢一条记录（r2 缺失 → identity set 不等）
     `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Variable 'encodeStagedValue' is declared but never used. Unused variables should start with a '_'.
    ,-[tests/fenced-write.mjs:62:3]
 61 |   createMemoryFenceStore, FENCE_LOCK_KEY, stagingKey,
 62 |   encodeStagedValue, decodeStagedValue,
    :   ^^^^^^^^|^^^^^^^^
    :           `-- 'encodeStagedValue' is declared here
 63 | } = mod
    `----
  help: Consider removing this declaration.

  ! react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders
    ,-[src/hooks/useBank.ts:21:5]
 19 |   // 切换词库时顺带刷新一次自定义词库列表（导入新词库后会触发这里）
 20 |   useEffect(() => {
    :   ^^^^|^^^^
    :       `-- This is the containing effect
 21 |     setCustomBanks(loadCustomBanks())
    :     ^^^^^^^|^^^^^^
    :            `-- Avoid calling setState() directly within an effect
 22 |   }, [bankId])
    `----
  help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
  note: React Compiler skipped optimizing this component or hook. Additional guidance: https://react.dev/reference/eslint-plugin-react-hooks/lints/set-state-in-effect

  ! react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders
    ,-[src/hooks/useBank.ts:46:7]
 42 |   const [bankWords, setBankWords] = useState<WordItem[]>([])
 43 |   useEffect(() => {
    :   ^^^^|^^^^
    :       `-- This is the containing effect
 44 |     const ready = bankWordsOf(bank)
 45 |     if (ready.length > 0) {
 46 |       setBankWords(ready)
    :       ^^^^^^|^^^^^
    :             `-- Avoid calling setState() directly within an effect
 47 |       return
    `----
  help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
  note: React Compiler skipped optimizing this component or hook. Additional guidance: https://react.dev/reference/eslint-plugin-react-hooks/lints/set-state-in-effect

  ! eslint(no-unused-vars): Variable 'a' is declared but never used. Unused variables should start with a '_'.
    ,-[tests/migration-lock.mjs:84:9]
 83 |   const lock = new MigrationLock(store)
 84 |   const a = await lock.acquire('A', { leaseMs: lease, now: NOW })
    :         |
    :         `-- 'a' is declared here
 85 |   const exp = { ownerId: 'A', leaseUntil: NOW + lease, fencingToken: 1 }
    `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Variable 'OLD_GLOBAL_KEY' is declared but never used. Unused variables should start with a '_'.
    ,-[tests/fenced-write-browser.mjs:74:7]
 73 | 
 74 | const OLD_GLOBAL_KEY = 'gt.fence.old'
    :       ^^^^^^^|^^^^^^
    :              `-- 'OLD_GLOBAL_KEY' is declared here
 75 | 
    `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Parameter 'position' is declared but never used. Unused parameters should start with a '_'.
     ,-[tests/fenced-write-browser.mjs:182:56]
 181 |     const pageB = await newPage(context)
 182 |     const recovered = await pageB.evaluate(async ([db, position, keys]) => {
     :                                                        ^^^^|^^^
     :                                                            `-- 'position' is declared here
 183 |       const guardMod = await import('/src/core/persistence/migration-write-guard.ts')
     `----
  help: Consider removing this parameter.

  ! eslint(no-unused-vars): Variable 'lockMod' is declared but never used. Unused variables should start with a '_'.
     ,-[tests/fenced-write-browser.mjs:184:13]
 183 |       const guardMod = await import('/src/core/persistence/migration-write-guard.ts')
 184 |       const lockMod = await import('/src/core/persistence/migration-lock.ts')
     :             ^^^|^^^
     :                `-- 'lockMod' is declared here
 185 |       const store = await guardMod.createIdbFenceStore(db)
     `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Variable 'ignore' is declared but never used. Unused variables should start with a '_'.
    ,-[scripts/verify-p17-frozen.mjs:57:7]
 56 | let failures = 0
 57 | const ignore = (msg) => console.log(`   ignore: ${msg}`)
    :       ^^^|^^
    :          `-- 'ignore' is declared here
 58 | 
    `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Variable 'EMPTY_LEARNING' is declared but never used. Unused variables should start with a '_'.
     ,-[scripts/learning-consistency.mjs:126:7]
 125 | 
 126 | const EMPTY_LEARNING = { review: {}, memorize: {}, analytics: {} }
     :       ^^^^^^^|^^^^^^
     :              `-- 'EMPTY_LEARNING' is declared here
 127 | 
     `----
  help: Consider removing this declaration.

  ! eslint(no-control-regex): Unexpected control characters
    ,-[scripts/content/normalize.mjs:56:22]
 55 | const WS_RE = /[\s\u00A0]+/g // \s 已含空格 / \t / \r / \n / \v / \f
 56 | const CONTROL_RE = /[\u0000-\u001F\u007F]/g
    :                      ^^^|^^ ^^^|^^
    :                         |      `-- 'U+001F' is a control character.
    :                         `-- 'U+0000' is a control character.
 57 | 
    `----
  help: Avoid matching control characters in regular expressions. If intentional, disable this rule for the expression.

  ! eslint(no-useless-escape): Unnecessary escape character '-'
    ,-[src/lib/customBanks.ts:93:50]
 92 |       const parts = line.split(/\s+/)
 93 |       if (parts.length >= 2 && /^[A-Za-z][A-Za-z'\-]*$/.test(parts[0])) {
    :                                                  ^^
 94 |         return { word: parts[0], translation: parts.slice(1).join(' ') }
    `----
  help: Replace `\-` with `-`.

  ! eslint(no-unused-vars): Variable 'kib' is declared but never used. Unused variables should start with a '_'.
     ,-[scripts/gate-perf.mjs:152:7]
 151 | 
 152 | const kib = (b) => (b == null ? '—' : `${(b / 1024).toFixed(2)} KiB`)
     :       ^|^
     :        `-- 'kib' is declared here
 153 | 
     `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Variable 'cet4' is declared but never used. Unused variables should start with a '_'.
     ,-[scripts/build-cet-defs.mjs:137:7]
 136 | const afterWordCount = (lines.join('\n').match(/^\s*\{\s*word:/gm) ?? []).length
 137 | const cet4 = (lines.join('\n').match(/word:/g) ?? []).length
     :       ^^|^
     :         `-- 'cet4' is declared here
 138 | console.log(`\n========== 统计 ==========`)
     `----
  help: Consider removing this declaration.

  ! eslint(no-irregular-whitespace): Unexpected irregular whitespace
    ,-[src/core/persistence/channels.ts:12:67]
 11 |  *   settingsChannel     → settings  ：useSettings / i18n / speech 的偏好键
 12 |  *   diagnosticsChannel  → diagnostics（唯一允许 allKeys）　：learning/diagnostics.ts
    :                                                           ^^
 13 |  */
    `----
  help: Try to remove the irregular whitespace

  ! react(purity): Cannot call impure function during render
    ,-[src/components/ReviewPanel.tsx:55:15]
 54 | 
 55 |   const now = Date.now()
    :               ^^^^^|^^^^
    :                    `-- Cannot call impure function
 56 |   const entries = useMemo(() => [...views].sort((a, b) => a.entry.nextReviewAt - b.entry.nextReviewAt), [views])
    `----
  help: `Date.now` is an impure function. Calling an impure function can produce unstable results that update unpredictably when the component re-renders
  note: React Compiler skipped optimizing this component or hook. Additional guidance: https://react.dev/reference/eslint-plugin-react-hooks/lints/purity

  ! react(purity): Cannot call impure function during render
    ,-[src/components/ReviewPanel.tsx:50:73]
 49 | 
 50 |   const due = useMemo(() => views.filter((v) => v.entry.nextReviewAt <= Date.now()), [views])
    :                                                                         ^^^^^|^^^^
    :                                                                              `-- Cannot call impure function
 51 | 
    `----
  help: `Date.now` is an impure function. Calling an impure function can produce unstable results that update unpredictably when the component re-renders
  note: React Compiler skipped optimizing this component or hook. Additional guidance: https://react.dev/reference/eslint-plugin-react-hooks/lints/purity

  ! eslint(no-unused-vars): Identifier 'cpSync' is imported but never used.
    ,-[tests/ui-contract.mjs:46:10]
 45 |  */
 46 | import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
    :          ^^^|^^
    :             `-- 'cpSync' is imported here
 47 | import { dirname, join, relative, resolve } from 'node:path'
    `----
  help: Consider removing this import.

  ! eslint(no-unused-vars): Identifier 'readdirSync' is imported but never used.
    ,-[tests/ui-contract.mjs:46:43]
 45 |  */
 46 | import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
    :                                           ^^^^^|^^^^^
    :                                                `-- 'readdirSync' is imported here
 47 | import { dirname, join, relative, resolve } from 'node:path'
    `----
  help: Consider removing this import.

  ! eslint(no-unused-vars): Identifier 'statSync' is imported but never used.
    ,-[tests/ui-contract.mjs:46:56]
 45 |  */
 46 | import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
    :                                                        ^^^^|^^^
    :                                                            `-- 'statSync' is imported here
 47 | import { dirname, join, relative, resolve } from 'node:path'
    `----
  help: Consider removing this import.

  ! eslint(no-unused-vars): Parameter 's' is declared but never used. Unused parameters should start with a '_'.
     ,-[tests/ui-contract.mjs:496:90]
 495 |     { letter: 'A6', name: 'bypassFacadeImports 抬到 基线+1', mutate: (s) => ({ counts: { ...s.counts, bypassFacadeImports: s.baseline.bypassFacadeImports + 1 } }), expectFail: ['RATCHET-bypassFacadeImports'], expectUnknown: [] },
 496 |     { letter: 'A7', name: '扫描到 0 个文件（⇒ UNKNOWN，不通过）', mutate: (s) => ({ scanned: 0 }), expectFail: [], expectUnknown: ['SCAN-NONEMPTY'] },
     :                                                                            |
     :                                                                            `-- 's' is declared here
 497 |     {
     `----
  help: Consider removing this parameter.

  ! eslint(no-unused-vars): Variable 'KEY_MIGRATION' is declared but never used. Unused variables should start with a '_'.
    ,-[scripts/migration-dryrun.mjs:71:7]
 70 | const KEY_BACKUP = 'gt.learning.v2.backup'
 71 | const KEY_MIGRATION = 'gt.migration.v1'
    :       ^^^^^^|^^^^^^
    :             `-- 'KEY_MIGRATION' is declared here
 72 | 
    `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Variable 'NOT_IN_SCOPE_KEYS' is declared but never used. Unused variables should start with a '_'.
    ,-[scripts/migration-dryrun.mjs:76:7]
 75 | /** 读取但**不迁移**的键（§2.1 第 5 行：键是日期、不含词，与 Learning 层正交） */
 76 | const NOT_IN_SCOPE_KEYS = ['gt.streak.v1']
    :       ^^^^^^^^|^^^^^^^^
    :               `-- 'NOT_IN_SCOPE_KEYS' is declared here
 77 | const STREAK_NOT_IN_SCOPE_REASON = 'keys are dates, no word dimension'
    `----
  help: Consider removing this declaration.

  ! eslint(no-unused-vars): Parameter 'content' is declared but never used. Unused parameters should start with a '_'.
     ,-[scripts/migration-dryrun.mjs:803:33]
 802 |  * ========================================================================= */
 803 | function validateReport(report, content) {
     :                                 ^^^|^^^
     :                                    `-- 'content' is declared here
 804 |   const errors = []
     `----
  help: Consider removing this parameter.

  ! react(only-export-components): Fast refresh only works when a file only exports components. Use a new file to share constants or functions between components.
     ,-[src/components/BankManager.tsx:201:17]
 200 | /** 把自定义词库包装成标准 WordBank 结构 */
 201 | export function toWordBank(custom: CustomBank): WordBank {
     :                 ^^^^^^^^^^
 202 |   return {
     `----

  ! react(set-state-in-effect): Calling setState synchronously within an effect can trigger cascading renders
    ,-[src/components/BankManager.tsx:37:15]
 35 | 
 36 |   useEffect(() => {
    :   ^^^^|^^^^
    :       `-- This is the containing effect
 37 |     if (open) setBanks(loadCustomBanks())
    :               ^^^^|^^^
    :                   `-- Avoid calling setState() directly within an effect
 38 |   }, [open])
    `----
  help: Effects should synchronize React with external systems. Calling setState synchronously inside an effect starts another render and is usually unnecessary. Derive the value during render, initialize state directly, or update it from the event that caused the change. Use an effect only when synchronizing with an external system.
  note: React Compiler skipped optimizing this component or hook. Additional guidance: https://react.dev/reference/eslint-plugin-react-hooks/lints/set-state-in-effect

  ! eslint(no-unused-vars): Variable 'ROOT' is declared but never used. Unused variables should start with a '_'.
    ,-[scripts/content/license-policy.mjs:66:7]
 65 | 
 66 | const ROOT = path.resolve(process.cwd())
    :       ^^|^
    :         `-- 'ROOT' is declared here
 67 | 
    `----
  help: Consider removing this declaration.

  ! eslint(no-eval): eval can be harmful.
     ,-[tests/browser-migration-e2e.mjs:161:22]
 160 |     const sto = await import('/src/lib/learning/storage.ts')
 161 |     const provider = eval(providerSource)
     :                      ^^^^
 162 |     const raw = Object.fromEntries(Object.entries(localStorage))
     `----
  help: Avoid eval(). For JSON parsing use JSON.parse(); for dynamic property access use bracket notation (obj[key]); for other cases refactor to avoid evaluating strings as code.

  ! eslint(no-eval): eval can be harmful.
     ,-[tests/browser-migration-e2e.mjs:220:22]
 219 |     const sto = await import('/src/lib/learning/storage.ts')
 220 |     const provider = eval(providerSource)
     :                      ^^^^
 221 |     const raw = Object.fromEntries(Object.entries(localStorage))
     `----
  help: Avoid eval(). For JSON parsing use JSON.parse(); for dynamic property access use bracket notation (obj[key]); for other cases refactor to avoid evaluating strings as code.

  ! eslint(no-unused-vars): Identifier 'CONTENT_TYPES' is imported but never used.
    ,-[scripts/content/ingest.mjs:30:46]
 29 | import {
 30 |   LICENSE_POLICY_VERSION, PROVIDER_ORIGINAL, CONTENT_TYPES,
    :                                              ^^^^^^|^^^^^^
    :                                                    `-- 'CONTENT_TYPES' is imported here
 31 |   loadPackages, decidePackage, decideLicense, checksumPayload, resolveContentDir,
    `----
  help: Consider removing this import.

  ! eslint(no-unused-vars): Identifier 'decideLicense' is imported but never used.
    ,-[scripts/content/ingest.mjs:31:32]
 30 |   LICENSE_POLICY_VERSION, PROVIDER_ORIGINAL, CONTENT_TYPES,
 31 |   loadPackages, decidePackage, decideLicense, checksumPayload, resolveContentDir,
    :                                ^^^^^^|^^^^^^
    :                                      `-- 'decideLicense' is imported here
 32 | } from './license-policy.mjs'
    `----
  help: Consider removing this import.

  ! eslint(no-unused-vars): Parameter 'generatedAt' is declared but never used. Unused parameters should start with a '_'.
     ,-[scripts/content/ingest.mjs:201:26]
 200 |    * ⚠️ 两侧用同一方式构造 ⇒ 键序一致，可直接比字符串，不引入任何新的规范化依赖。 */
 201 |   const semanticsOf = ({ generatedAt, ...rest }) => JSON.stringify(rest)
     :                          ^^^^^|^^^^^
     :                               `-- 'generatedAt' is declared here
 202 |   let prev = null
     `----
  help: Consider removing this parameter.

  ! eslint(no-control-regex): Unexpected control characters
     ,-[src/core/content/model/content.ts:154:16]
 153 |     // 控制字符一律删除（\u0000-\u001F、\u007F）
 154 |     .replace(/[\u0000-\u001F\u007F]/g, '')
     :                ^^^|^^ ^^^|^^
     :                   |      `-- 'U+001F' is a control character.
     :                   `-- 'U+0000' is a control character.
 155 |     // `:` 与 `/` 会破坏 4 段式 ContentId 的解析，必须禁止，退化成 `-`
     `----
  help: Avoid matching control characters in regular expressions. If intentional, disable this rule for the expression.

  ! eslint(no-control-regex): Unexpected control characters
     ,-[src/core/content/model/content.ts:166:9]
 165 |   if (id.includes(':') || id.includes('/')) return false
 166 |   if (/[\u0000-\u001F\u007F]/.test(id)) return false
     :         ^^^|^^ ^^^|^^
     :            |      `-- 'U+001F' is a control character.
     :            `-- 'U+0000' is a control character.
 167 |   return normalizeLocalId(id) === id
     `----
  help: Avoid matching control characters in regular expressions. If intentional, disable this rule for the expression.

Found 53 warnings and 0 errors.
Finished in 89ms on 204 files with 116 rules using 16 threads.
```

**EXIT=0**

## verify:p17-frozen

```
$ node scripts/verify-p17-frozen.mjs
======================================================================
 P1.8 INV-1 — P1.7 冻结基线保护门（verify-p17-frozen.mjs）
======================================================================
 冻结 HEAD : 02e334ef81014dce38582bd6786b568174b4802f
 冻结路径  : docs/audit-package/

[A] 冻结 HEAD 存在 ................................ ✅
[B] 后代性（冻结 HEAD 是 HEAD 祖先）............... ✅
[C] 路径冻结（冻结区内 0 改动）.................... ✅
[C3] 工作树冻结（冻结区无未提交改动/新增）........ ✅
[C2] 冻结区目录存在 ............................... ✅
[D] 内容冻结（登记 artifact 逐字节 0 不符）........ ✅
      W4-HASH-MANIFEST.md => 33 文件 / 0 不符
      W5C-HASH-MANIFEST.md => 7 文件 / 0 不符
      W5D-HASH-MANIFEST.md => 29 文件 / 0 不符
      合计核对文件数 = 155；不符 = 0
    
    artifact 完整性：✅ PASS —— 所有 HASH-MANIFEST 登记的 artifact 逐字节匹配
──────────────────────────────────────────────────────────────────────
P1.7 冻结基线保护：✅ PASS —— 冻结区零改动、登记 artifact 逐字节一致
```

**EXIT=0**

## verify:manifests

```
$ node scripts/verify-manifest-hashes.mjs
  ✅ W2B-HASH-MANIFEST.md：15 份文件，0 处不符
  ✅ W2C-HASH-MANIFEST.md：22 份文件，0 处不符
  ✅ W3-HASH-MANIFEST.md：49 份文件，0 处不符
  ✅ W4-HASH-MANIFEST.md：33 份文件，0 处不符
  ✅ W5C-HASH-MANIFEST.md：7 份文件，0 处不符
  ✅ W5D-HASH-MANIFEST.md：29 份文件，0 处不符

汇总：
  W2B-HASH-MANIFEST.md => 15 文件 / 0 不符
  W2C-HASH-MANIFEST.md => 22 文件 / 0 不符
  W3-HASH-MANIFEST.md => 49 文件 / 0 不符
  W4-HASH-MANIFEST.md => 33 文件 / 0 不符
  W5C-HASH-MANIFEST.md => 7 文件 / 0 不符
  W5D-HASH-MANIFEST.md => 29 文件 / 0 不符
  合计核对文件数 = 155；不符 = 0

artifact 完整性：✅ PASS —— 所有 HASH-MANIFEST 登记的 artifact 逐字节匹配
```

**EXIT=0**

## content:validate

```
$ node scripts/content/validate.mjs
[content:validate] 9 个类型目录 / 18 个包：audio×1 collection×1 exercise×1 listening×1 reading×1 speaking×1 topic×1 vocabulary×10 writing×1
▸ audio/demo-audio-01
  ✓ 必填字段完整
  ✓ ContentId 规范（content:audio:demo-demo-audio-01:demo-audio-01）
  ✓ 无包内重复条目 id（5 条）
  ✓ stats.items 与实际一致（5）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（demo-demo-audio-01）
  ✓ packageId=demo-audio-01（与目录名一致）
  ✓ namespace 与 id 同源（demo-demo-audio-01）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（2ecf5d3b…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（hand-authored/1.0 @ 2026-09-30T00:00:00.000Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ collection/demo-study-set
  ✓ 必填字段完整
  ✓ ContentId 规范（content:collection:demo-demo-study-set:demo-study-set）
  ✓ 无包内重复条目 id（5 条）
  ✓ stats.items 与实际一致（5）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（demo-demo-study-set）
  ✓ packageId=demo-study-set（与目录名一致）
  ✓ namespace 与 id 同源（demo-demo-study-set）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（04ec8496…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（hand-authored/1.0 @ 2026-09-30T00:00:00.000Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  ✓ relations.json 7 条：端点合法且可达
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ exercise/demo-exercise-01
  ✓ 必填字段完整
  ✓ ContentId 规范（content:exercise:demo-demo-exercise-01:demo-exercise-01）
  ✓ 无包内重复条目 id（5 条）
  ✓ stats.items 与实际一致（5）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（demo-demo-exercise-01）
  ✓ packageId=demo-exercise-01（与目录名一致）
  ✓ namespace 与 id 同源（demo-demo-exercise-01）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（eba19d13…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（hand-authored/1.0 @ 2026-09-30T00:00:00.000Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ listening/demo-listening-01
  ✓ 必填字段完整
  ✓ ContentId 规范（content:listening:demo-demo-listening-01:demo-listening-01）
  ✓ 无包内重复条目 id（6 条）
  ✓ stats.items 与实际一致（6）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（demo-demo-listening-01）
  ✓ packageId=demo-listening-01（与目录名一致）
  ✓ namespace 与 id 同源（demo-demo-listening-01）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（a29d9535…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（hand-authored/1.0 @ 2026-09-30T00:00:00.000Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ reading/demo-reading-01
  ✓ 必填字段完整
  ✓ ContentId 规范（content:reading:demo-demo-reading-01:demo-reading-01）
  ✓ 无包内重复条目 id（6 条）
  ✓ stats.items 与实际一致（6）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（demo-demo-reading-01）
  ✓ packageId=demo-reading-01（与目录名一致）
  ✓ namespace 与 id 同源（demo-demo-reading-01）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（47fcb01c…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（hand-authored/1.0 @ 2026-09-30T00:00:00.000Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  ✓ relations.json 4 条：端点合法且可达
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ speaking/demo-speaking-01
  ✓ 必填字段完整
  ✓ ContentId 规范（content:speaking:demo-demo-speaking-01:demo-speaking-01）
  ✓ 无包内重复条目 id（5 条）
  ✓ stats.items 与实际一致（5）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（demo-demo-speaking-01）
  ✓ packageId=demo-speaking-01（与目录名一致）
  ✓ namespace 与 id 同源（demo-demo-speaking-01）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（149700fa…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（hand-authored/1.0 @ 2026-09-30T00:00:00.000Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ topic/demo-topic-01
  ✓ 必填字段完整
  ✓ ContentId 规范（content:topic:demo-demo-topic-01:demo-topic-01）
  ✓ 无包内重复条目 id（5 条）
  ✓ stats.items 与实际一致（5）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（demo-demo-topic-01）
  ✓ packageId=demo-topic-01（与目录名一致）
  ✓ namespace 与 id 同源（demo-demo-topic-01）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（d45684a7…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（hand-authored/1.0 @ 2026-09-30T00:00:00.000Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ vocabulary/ai-core
  ✓ 必填字段完整
  ✓ ContentId 规范（content:vocabulary:curated-ai-core:ai-core）
  ✓ 无包内重复词条（43 词）
  ✓ stats.items 与实际一致（43）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（curated-ai-core）
  ✓ packageId=ai-core（与目录名一致）
  ✓ namespace 与 id 同源（curated-ai-core）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（f3b2be10…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（content-build/1.1 @ 2026-09-26T13:59:06.551Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ vocabulary/cet4
  ✓ 必填字段完整
  ✓ ContentId 规范（content:vocabulary:ecdict-cet4:cet4）
  ✓ 无包内重复词条（84 词）
  ✓ stats.items 与实际一致（84）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（MIT）
  ✓ namespace 唯一（ecdict-cet4）
  ✓ packageId=cet4（与目录名一致）
  ✓ namespace 与 id 同源（ecdict-cet4）
  ✓ schemaVersion=4
  ✓ contentVersion=2
  ✓ contentChecksum 一致（3a59d975…）
  ✓ 版本三元组自洽（revision=2 version=2 history=2 条，命中 revision=2）
  ✓ build 溯源完整（content-build/1.1 @ 2026-09-28T17:47:50.117Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ vocabulary/cet6
  ✓ 必填字段完整
  ✓ ContentId 规范（content:vocabulary:ecdict-cet6:cet6）
  ✓ 无包内重复词条（69 词）
  ✓ stats.items 与实际一致（69）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（MIT）
  ✓ namespace 唯一（ecdict-cet6）
  ✓ packageId=cet6（与目录名一致）
  ✓ namespace 与 id 同源（ecdict-cet6）
  ✓ schemaVersion=4
  ✓ contentVersion=2
  ✓ contentChecksum 一致（4560e3f9…）
  ✓ 版本三元组自洽（revision=2 version=2 history=2 条，命中 revision=2）
  ✓ build 溯源完整（content-build/1.1 @ 2026-09-28T17:47:50.161Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ vocabulary/cloud-native
  ✓ 必填字段完整
  ✓ ContentId 规范（content:vocabulary:curated-cloud-native:cloud-native）
  ✓ 无包内重复词条（30 词）
  ✓ stats.items 与实际一致（30）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（curated-cloud-native）
  ✓ packageId=cloud-native（与目录名一致）
  ✓ namespace 与 id 同源（curated-cloud-native）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（cddaa3d0…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（content-build/1.1 @ 2026-09-26T13:59:06.638Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ vocabulary/frontend
  ✓ 必填字段完整
  ✓ ContentId 规范（content:vocabulary:curated-frontend:frontend）
  ✓ 无包内重复词条（20 词）
  ✓ stats.items 与实际一致（20）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（curated-frontend）
  ✓ packageId=frontend（与目录名一致）
  ✓ namespace 与 id 同源（curated-frontend）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（ae689a16…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（content-build/1.1 @ 2026-09-26T13:59:06.663Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ vocabulary/go-code
  ✓ 必填字段完整
  ✓ ContentId 规范（content:vocabulary:curated-go-code:go-code）
  ✓ 无包内重复词条（50 词）
  ✓ stats.items 与实际一致（50）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（curated-go-code）
  ✓ packageId=go-code（与目录名一致）
  ✓ namespace 与 id 同源（curated-go-code）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（6b22c0d9…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（content-build/1.1 @ 2026-09-26T13:59:06.689Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ vocabulary/ielts
  ✓ 必填字段完整
  ✓ ContentId 规范（content:vocabulary:ecdict-ielts:ielts）
  ✓ 无包内重复词条（3000 词）
  ✓ stats.items 与实际一致（3000）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（MIT）
  ✓ namespace 唯一（ecdict-ielts）
  ✓ packageId=ielts（与目录名一致）
  ✓ namespace 与 id 同源（ecdict-ielts）
  ✓ schemaVersion=4
  ✓ contentVersion=5
  ✓ contentChecksum 一致（bd904d23…）
  ✓ 版本三元组自洽（revision=5 version=5 history=4 条，命中 revision=5）
  ✓ build 溯源完整（content-build/1.1 @ 2026-09-28T18:33:12.616Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ vocabulary/kaoyan
  ✓ 必填字段完整
  ✓ ContentId 规范（content:vocabulary:ecdict-kaoyan:kaoyan）
  ✓ 无包内重复词条（3000 词）
  ✓ stats.items 与实际一致（3000）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（MIT）
  ✓ namespace 唯一（ecdict-kaoyan）
  ✓ packageId=kaoyan（与目录名一致）
  ✓ namespace 与 id 同源（ecdict-kaoyan）
  ✓ schemaVersion=4
  ✓ contentVersion=4
  ✓ contentChecksum 一致（fa6a9126…）
  ✓ 版本三元组自洽（revision=4 version=4 history=3 条，命中 revision=4）
  ✓ build 溯源完整（content-build/1.1 @ 2026-09-28T18:22:47.249Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ vocabulary/toefl
  ✓ 必填字段完整
  ✓ ContentId 规范（content:vocabulary:ecdict-toefl:toefl）
  ✓ 无包内重复词条（3000 词）
  ✓ stats.items 与实际一致（3000）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（MIT）
  ✓ namespace 唯一（ecdict-toefl）
  ✓ packageId=toefl（与目录名一致）
  ✓ namespace 与 id 同源（ecdict-toefl）
  ✓ schemaVersion=4
  ✓ contentVersion=5
  ✓ contentChecksum 一致（19f1dac9…）
  ✓ 版本三元组自洽（revision=5 version=5 history=4 条，命中 revision=5）
  ✓ build 溯源完整（content-build/1.1 @ 2026-09-28T18:33:12.666Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ vocabulary/ts-code
  ✓ 必填字段完整
  ✓ ContentId 规范（content:vocabulary:curated-ts-code:ts-code）
  ✓ 无包内重复词条（50 词）
  ✓ stats.items 与实际一致（50）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（curated-ts-code）
  ✓ packageId=ts-code（与目录名一致）
  ✓ namespace 与 id 同源（curated-ts-code）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（9f34b063…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（content-build/1.1 @ 2026-09-26T13:59:06.896Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
▸ writing/demo-writing-01
  ✓ 必填字段完整
  ✓ ContentId 规范（content:writing:demo-demo-writing-01:demo-writing-01）
  ✓ 无包内重复条目 id（5 条）
  ✓ stats.items 与实际一致（5）
  ✓ checksum 一致（canonical SHA-256）
  ✓ license 结构化（self）
  ✓ namespace 唯一（demo-demo-writing-01）
  ✓ packageId=demo-writing-01（与目录名一致）
  ✓ namespace 与 id 同源（demo-demo-writing-01）
  ✓ schemaVersion=4
  ✓ contentVersion=1
  ✓ contentChecksum 一致（a0032e0a…）
  ✓ 版本三元组自洽（revision=1 version=1 history=1 条，命中 revision=1）
  ✓ build 溯源完整（hand-authored/1.0 @ 2026-09-30T00:00:00.000Z）
  ✓ duplicate localId：无（第 4 项已判定）
  ✓ 无 duplicate normalized key（大小写/空白差异已并入 key）
  ✓ 无 duplicate source（1 条来源）
  · 无 relations.json，跳过 relation 校验（V4.1-P0 尚不产出该文件）
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 跨包无 duplicate ContentId（全库 9346 词扫描，namespace 唯一 ⇒ 兜底回归）
  ✓ manifest 体积（最大 1.78 KiB「ielts」，全库 24.29 KiB < 8/40 KiB）
  ✓ inline 预算（7 包：ai-core(43词/2.27KiB), cet4(84词/12.06KiB), cet6(69词/9.61KiB), cloud-native(30词/1.55KiB), frontend(20词/0.97KiB), go-code(50词/4.54KiB), ts-code(50词/5.17KiB) | Σ 346 词 / 36.17 KiB ≤ 1000 词 / 64 KiB）
  ✓ 策略一致性（manifest ↔ registry）：18 包一致（inline 7 / lazy 11）
  ✓ 二进制媒体检查（扫描 40 个文件，二进制媒体文件数 = 0）：扩展名白名单 + NUL 嗅探双通道通过

[content:validate] PASS：18 包全部通过
```

**EXIT=0**

## content:validate --falsify

```
$ node scripts/content/validate.mjs --falsify
[content:validate] 证伪自检 —— 证明 INV-4 二进制媒体判据能判红（不会失败的门等于没有门）
  隔离副本：C:\Users\ADMINI~1\AppData\Local\Temp\p18f-falsify-962WlZ（系统临时目录；真 content/ 只读、绝不被写）
  注入：fake-audio.mp3（mp3 扩展名 + NUL 字节）+ fake.json（合法 JSON 尾部追加 NUL —— 专证改扩展名伪装）

  ✓ 断言 1：offenders 恰好 = 2（多一个少一个都算失败）
  ✓ 断言 2：两类 why 都在（ext 白名单通道 / nul 嗅探通道）
  ✓ 断言 3：两个注入样本均被点名
  ✓ 断言 4：真实 content/ 零 offender 且零 error（注入未污染真实内容）
──────────────────────────────────────────────────────
content:validate Falsification：✅ PASS —— 4/4 断言通过，隔离副本已清理，真 content/ 未被写入
```

**EXIT=0**

## content:ingest（幂等：跑完工作区不应变脏）

```
$ node scripts/content/ingest.mjs

[ingest] 阶段 1/8 · DISCOVER
  ✓ 18 个包：audio×1 collection×1 exercise×1 listening×1 reading×1 speaking×1 topic×1 vocabulary×10 writing×1

[ingest] 阶段 2/8 · PARSE
  ✓ manifest 全部解析（载荷：18/18 有）

[ingest] 阶段 3/8 · CONTRACT
  ✓ audio/demo-audio-01 契约字段完整 + license 结构化
  ✓ collection/demo-study-set 契约字段完整 + license 结构化
  ✓ exercise/demo-exercise-01 契约字段完整 + license 结构化
  ✓ listening/demo-listening-01 契约字段完整 + license 结构化
  ✓ reading/demo-reading-01 契约字段完整 + license 结构化
  ✓ speaking/demo-speaking-01 契约字段完整 + license 结构化
  ✓ topic/demo-topic-01 契约字段完整 + license 结构化
  ✓ vocabulary/ai-core 契约字段完整 + license 结构化
  ✓ vocabulary/cet4 契约字段完整 + license 结构化
  ✓ vocabulary/cet6 契约字段完整 + license 结构化
  ✓ vocabulary/cloud-native 契约字段完整 + license 结构化
  ✓ vocabulary/frontend 契约字段完整 + license 结构化
  ✓ vocabulary/go-code 契约字段完整 + license 结构化
  ✓ vocabulary/ielts 契约字段完整 + license 结构化
  ✓ vocabulary/kaoyan 契约字段完整 + license 结构化
  ✓ vocabulary/toefl 契约字段完整 + license 结构化
  ✓ vocabulary/ts-code 契约字段完整 + license 结构化
  ✓ writing/demo-writing-01 契约字段完整 + license 结构化

[ingest] 阶段 4/8 · CHECKSUM
  ✓ audio/demo-audio-01 contentChecksum 一致
  ✓ collection/demo-study-set contentChecksum 一致
  ✓ exercise/demo-exercise-01 contentChecksum 一致
  ✓ listening/demo-listening-01 contentChecksum 一致
  ✓ reading/demo-reading-01 contentChecksum 一致
  ✓ speaking/demo-speaking-01 contentChecksum 一致
  ✓ topic/demo-topic-01 contentChecksum 一致
  ✓ vocabulary/ai-core contentChecksum 一致
  ✓ vocabulary/cet4 contentChecksum 一致
  ✓ vocabulary/cet6 contentChecksum 一致
  ✓ vocabulary/cloud-native contentChecksum 一致
  ✓ vocabulary/frontend contentChecksum 一致
  ✓ vocabulary/go-code contentChecksum 一致
  ✓ vocabulary/ielts contentChecksum 一致
  ✓ vocabulary/kaoyan contentChecksum 一致
  ✓ vocabulary/toefl contentChecksum 一致
  ✓ vocabulary/ts-code contentChecksum 一致
  ✓ writing/demo-writing-01 contentChecksum 一致

[ingest] 阶段 5/8 · PROVENANCE
  ✓ audio/demo-audio-01 溯源：1 自有 / 0 外部
  ✓ collection/demo-study-set 溯源：1 自有 / 0 外部
  ✓ exercise/demo-exercise-01 溯源：1 自有 / 0 外部
  ✓ listening/demo-listening-01 溯源：1 自有 / 0 外部
  ✓ reading/demo-reading-01 溯源：1 自有 / 0 外部
  ✓ speaking/demo-speaking-01 溯源：1 自有 / 0 外部
  ✓ topic/demo-topic-01 溯源：1 自有 / 0 外部
  ✓ vocabulary/ai-core 溯源：1 自有 / 0 外部
  ✓ vocabulary/cet4 溯源：0 自有 / 1 外部
  ✓ vocabulary/cet6 溯源：0 自有 / 1 外部
  ✓ vocabulary/cloud-native 溯源：1 自有 / 0 外部
  ✓ vocabulary/frontend 溯源：1 自有 / 0 外部
  ✓ vocabulary/go-code 溯源：1 自有 / 0 外部
  ✓ vocabulary/ielts 溯源：0 自有 / 1 外部
  ✓ vocabulary/kaoyan 溯源：0 自有 / 1 外部
  ✓ vocabulary/toefl 溯源：0 自有 / 1 外部
  ✓ vocabulary/ts-code 溯源：1 自有 / 0 外部
  ✓ writing/demo-writing-01 溯源：1 自有 / 0 外部

[ingest] 阶段 6/8 · LICENSE-MATRIX
  ✓ audio/demo-audio-01 许可决策 allowed
  ✓ collection/demo-study-set 许可决策 allowed
  ✓ exercise/demo-exercise-01 许可决策 allowed
  ✓ listening/demo-listening-01 许可决策 allowed
  ✓ reading/demo-reading-01 许可决策 allowed
  ✓ speaking/demo-speaking-01 许可决策 allowed
  ✓ topic/demo-topic-01 许可决策 allowed
  ✓ vocabulary/ai-core 许可决策 allowed
  ✓ vocabulary/cet4 许可决策 allowed
  ✓ vocabulary/cet6 许可决策 allowed
  ✓ vocabulary/cloud-native 许可决策 allowed
  ✓ vocabulary/frontend 许可决策 allowed
  ✓ vocabulary/go-code 许可决策 allowed
  ✓ vocabulary/ielts 许可决策 allowed
  ✓ vocabulary/kaoyan 许可决策 allowed
  ✓ vocabulary/toefl 许可决策 allowed
  ✓ vocabulary/ts-code 许可决策 allowed
  ✓ writing/demo-writing-01 许可决策 allowed

[ingest] 阶段 7/8 · REFERENCE
  ✓ collection/demo-study-set relations.json 7 条端点全部可达
  ✓ reading/demo-reading-01 relations.json 4 条端点全部可达

[ingest] 阶段 8/8 · EMIT
  · 产物语义未变，跳过写入（generatedAt 保持 2026-09-30T09:51:51.661Z）
  · 汇总：allowed=18 allowed+attribution=0 review_required=0 rejected=0

[ingest] PASS
```

**EXIT=0**

## gate:content-contract

```
$ node scripts/gate-content-contract.mjs
[gate:content-contract] 18 个包
▸ audio/demo-audio-01
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（items.json）
  ✓ ContentId 与包体一致（content:audio:demo-demo-audio-01:demo-audio-01）
▸ collection/demo-study-set
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（items.json）
  ✓ relations.json 7 条端点可达
  ✓ ContentId 与包体一致（content:collection:demo-demo-study-set:demo-study-set）
▸ exercise/demo-exercise-01
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（items.json）
  ✓ ContentId 与包体一致（content:exercise:demo-demo-exercise-01:demo-exercise-01）
▸ listening/demo-listening-01
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（items.json）
  ✓ ContentId 与包体一致（content:listening:demo-demo-listening-01:demo-listening-01）
▸ reading/demo-reading-01
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（items.json）
  ✓ relations.json 4 条端点可达
  ✓ ContentId 与包体一致（content:reading:demo-demo-reading-01:demo-reading-01）
▸ speaking/demo-speaking-01
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（items.json）
  ✓ ContentId 与包体一致（content:speaking:demo-demo-speaking-01:demo-speaking-01）
▸ topic/demo-topic-01
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（items.json）
  ✓ ContentId 与包体一致（content:topic:demo-demo-topic-01:demo-topic-01）
▸ vocabulary/ai-core
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（words.json）
  ✓ ContentId 与包体一致（content:vocabulary:curated-ai-core:ai-core）
▸ vocabulary/cet4
  ✓ license 全部 allowed（MIT）
  ✓ 载荷引用存在（words.json）
  ✓ ContentId 与包体一致（content:vocabulary:ecdict-cet4:cet4）
▸ vocabulary/cet6
  ✓ license 全部 allowed（MIT）
  ✓ 载荷引用存在（words.json）
  ✓ ContentId 与包体一致（content:vocabulary:ecdict-cet6:cet6）
▸ vocabulary/cloud-native
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（words.json）
  ✓ ContentId 与包体一致（content:vocabulary:curated-cloud-native:cloud-native）
▸ vocabulary/frontend
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（words.json）
  ✓ ContentId 与包体一致（content:vocabulary:curated-frontend:frontend）
▸ vocabulary/go-code
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（words.json）
  ✓ ContentId 与包体一致（content:vocabulary:curated-go-code:go-code）
▸ vocabulary/ielts
  ✓ license 全部 allowed（MIT）
  ✓ 载荷引用存在（words.json）
  ✓ ContentId 与包体一致（content:vocabulary:ecdict-ielts:ielts）
▸ vocabulary/kaoyan
  ✓ license 全部 allowed（MIT）
  ✓ 载荷引用存在（words.json）
  ✓ ContentId 与包体一致（content:vocabulary:ecdict-kaoyan:kaoyan）
▸ vocabulary/toefl
  ✓ license 全部 allowed（MIT）
  ✓ 载荷引用存在（words.json）
  ✓ ContentId 与包体一致（content:vocabulary:ecdict-toefl:toefl）
▸ vocabulary/ts-code
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（words.json）
  ✓ ContentId 与包体一致（content:vocabulary:curated-ts-code:ts-code）
▸ writing/demo-writing-01
  ✓ license 全部 allowed（self）
  ✓ 载荷引用存在（items.json）
  ✓ ContentId 与包体一致（content:writing:demo-demo-writing-01:demo-writing-01）

[gate:content-contract] PASS：18 包全部通过 Content Contract
```

**EXIT=0**

## gate:content-type-contract

```
$ node scripts/gate-content-type-contract.mjs
[gate:content-type-contract] 契约类型 14 个：word, vocabulary, listening, audio, reading, topic, exercise, writing, speaking, grammar, document, collection, course, lesson
  ✓ A 注册表穷尽 CONTENT_TYPES（14 个）
  ✓ B model/ 无类型散落（白名单 content.ts, vocabulary.ts, asset.ts, snapshot.ts）
  ✓ C1 zh/en 词条逐一对齐（各 217 条）
  ✓ C2 注册表引用的 28 个 i18n 键全部存在且无重复
  ✓ D Catalog 类型维度 == packageLevelTypes()（13 个）
  ✓ E queryEnabledTypes() == 查询层实际启用集（word, reading） [契约派生]
  ✓ F 注册表自洽（type 键一致 / itemType 已注册 / i18n 键声明完整）
  ✓ G 契约单元编译期零诊断（4 个文件；选项源=tsconfig.app.json；双向穷尽锁 + 注册表完整性锁成立）
  ✓ H1 构建侧类型白名单 == packageLevelTypes()（13 个；源 scripts/content/license-policy.mjs）
  ✓ H2 scripts/content/validate.mjs 未自建类型白名单副本（单一副本）
  ✓ H3 资产规则 TS⟷Node 双侧一致（parseAssetId 13 例 + isAssetOwnedBy 4 例；三条独立来源对齐：TS == 字面真值 == .mjs）
  ✓ I 启用即可达（2 个类型 word/reading：packagesOf 非空 + list 非空且不外溢 + count 同源 + id 可解析 + 非 word 族过滤中性）
  ✓ I2 检索声明可解析（14 个类型；word 族 exact/match ⊆ WORD_FIELDS {word, translation, phonetic, definition}；非 word 族 exact 仅 'id'）
  ✓ J1 键集合三者相等（14 个：CONTENT_TYPES == CORE == REGISTRY，双向）
  ✓ J2 逐值相等（14 个类型的 itemType / queryEnabled / query：CORE == REGISTRY）
  ✓ J3 反向守卫（CORE 14 键、含 word、packageLevel 类型 13 个 —— 比较对象非空，J2 不恒真）
──────────────────────────────────────────────────────
Content Type Contract：✅ PASS —— 类型契约唯一、无散落、i18n 完整、启用集一致、编译期穷尽
```

**EXIT=0**

## gate:content-type-contract --falsify

```
$ node scripts/gate-content-type-contract.mjs --falsify
[gate:content-type-contract] 证伪自检 —— 证明每条判据都能判红（不会失败的门等于没有门）
  用例 13 条；每条：植入故障 → 断言"命中集恰好等于预期" → 字节还原 → 逐条核对

  ✓ A 恰好判红（命中 {A,G,J}；还原=bytes）
      从运行时清单 CONTENT_TYPES 摘掉 lesson（注册表多出一个类型）
      ↳ 预期耦合：CONTENT_TYPES 摘掉成员同时破坏运行时穷尽(A) 与编译期"联合⊆数组"锁(G) —— 两把锁本就该同时响。P18-E′ 起再叠加一把：CONTENT_TYPES 与 CONTENT_TYPE_CORE 的键集合由 J1 对账（摘掉 lesson ⇒ CORE 仍 14 键而 CONTENT_TYPES 13 ⇒ J 判红）—— 同样是三把锁本该同时响，不是用例不隔离
  ✓ B 恰好判红（命中 {B}；还原=unlink）
      在 model/ 下新建 per-type 散落文件 audio.ts
  ✓ C 恰好判红（命中 {C}；还原=bytes）
      从 zh.ts 摘掉 type.reading.label 一行（en 仍有 → 不对齐 + 注册表引用落空）
  ✓ D 恰好判红（命中 {D}；还原=bytes）
      让 catalog 的类型维度多出 word（与 packageLevelTypes() 不一致）
  ✓ E 恰好判红（命中 {E,I}；还原=bytes）
      把 content-query.ts 的 SUPPORTED_TYPES 由 queryEnabledTypes() 换回手写数组 ['word']（守「将来有人优化回硬编码列表」）
      ↳ 预期耦合：把查询层的派生调用换回**手写数组**且漏掉已启用的 reading：E（启用集对账，:400 的正则分支此时命中）判红；同时 I（启用即可达）也判红 —— reading 在注册表里 queryEnabled:true 却不可达（list 为 []）。两把锁本该同时响（同 A 用例的 {A,G}），不是用例不隔离
  ✓ G 恰好判红（命中 {G}；还原=bytes）
      给 ContentType 联合加未同步到 CONTENT_TYPES 的成员 quiz（只有编译期锁能抓）
  ✓ H 恰好判红（命中 {H}；还原=bytes）
      从 license-policy.mjs 摘掉 lesson（契约加了类型、Node 构建/入库/校验不认）
  ✓ H 恰好判红（命中 {H}；还原=bytes）
      把 asset-rules.mjs 的 ASSET_SEPARATOR '#a:' 改成 '#a'（Node 侧 parseAssetId 与 TS 侧漂移 ⇒ H3 判红）
  ✓ I 恰好判红（命中 {I}；还原=bytes）
      把 scopePackages 的路由退回 vocabulary-only 并去掉 pkgs.filter(allowed) 那一行（reading 查询落到词库）
  ✓ I 恰好判红（命中 {I}；还原=bytes）
      去掉 poolEntries 的 `hasPhonetic && isWordHit(hit) && !hit.phonetic` 里的 isWordHit 守卫（非 word 族被静默筛成空）
  ✓ I 恰好判红（命中 {I}；还原=bytes）
      让 sortRows 的 field:'word' 对非 word 行改按 title 参与主序（desc 下非 word 族被整体反转）
  ✓ I2 恰好判红（命中 {I2}；还原=bytes）
      给 reading 的 descriptor.query.index 加 { field: 'body', mode: 'exact' }（非 word 族 exact 只允许 'id'）
  ✓ J 恰好判红（命中 {J}；还原=bytes）
      在 REGISTRY 的 reading 条目里于展开之后覆盖 queryEnabled:false（CORE 与 REGISTRY 两个面分家）

  对照组（还原后复绿）
  ✓ 全部判据复绿（还原后零命中）—— 证明上面每一轮的判红都来自植入，而非环境残留
──────────────────────────────────────────────────────
Falsification：✅ PASS —— 13/13 判据均恰好判红，工作树已字节还原，对照组复绿
```

**EXIT=0**

## gate:license

```
$ node scripts/gate-license.mjs
§4.1 覆盖矩阵（冻结 Plan 规则 → 判据 → 证伪用例）：
  · license.spdx 未知 / 缺失  →  license-policy:decideLicense  →  证伪 S2（owner gate:license）
  · spdx 非商用（如 CC-BY-NC）  →  license-policy:decideLicense  →  证伪 S3（owner gate:license）
  · commercialUse !== true（面向公开分发的内容）  →  license-policy:decideLicense  →  证伪 S5（owner gate:license）
  · attributionRequired === true 但无署名文本  →  license-policy:decideLicense  →  证伪 S6（owner gate:license）
  · provenance.origin/provider 缺失  →  gate-license:sourceProvenance  →  证伪 S7（owner gate:license）
  · checksum 缺失或与实体不符  →  gate-license:sourceChecksum  →  证伪 S8（owner gate:license）
  · Asset 缺 license 且无有效 licenseRef  →  asset-rules:checkAssetLicense  →  证伪 A1（owner gate:license）
  ✓ 对账通过：Plan §4.1 7 行 == 覆盖矩阵 7 行，每行证伪用例存在
▸ audio/demo-audio-01
  ✓ source(curated in-repo (B-2 试金石)) checksum == 载荷实体 SHA-256（sha256:2ecf5d3…）
  ✓ source(curated in-repo (B-2 试金石)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ collection/demo-study-set
  ✓ source(curated in-repo (B-2 试金石)) checksum == 载荷实体 SHA-256（sha256:04ec849…）
  ✓ source(curated in-repo (B-2 试金石)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ exercise/demo-exercise-01
  ✓ source(curated in-repo (B-2 试金石)) checksum == 载荷实体 SHA-256（sha256:eba19d1…）
  ✓ source(curated in-repo (B-2 试金石)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ listening/demo-listening-01
  ✓ source(curated in-repo (B-2 试金石)) checksum == 载荷实体 SHA-256（sha256:a29d953…）
  ✓ source(curated in-repo (B-2 试金石)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ reading/demo-reading-01
  ✓ source(curated in-repo (B-2 试金石)) checksum == 载荷实体 SHA-256（sha256:47fcb01…）
  ✓ source(curated in-repo (B-2 试金石)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ speaking/demo-speaking-01
  ✓ source(curated in-repo (B-2 试金石)) checksum == 载荷实体 SHA-256（sha256:149700f…）
  ✓ source(curated in-repo (B-2 试金石)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ topic/demo-topic-01
  ✓ source(curated in-repo (B-2 试金石)) checksum == 载荷实体 SHA-256（sha256:d45684a…）
  ✓ source(curated in-repo (B-2 试金石)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ vocabulary/ai-core
  ✓ source(curated in-repo (2026 AI 核心词库)) checksum == 载荷实体 SHA-256（sha256:f3b2be1…）
  ✓ source(curated in-repo (2026 AI 核心词库)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ vocabulary/cet4
  ✓ source(ECDICT) checksum == 载荷实体 SHA-256（sha256:3a59d97…）
  ✓ source(ECDICT) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ vocabulary/cet6
  ✓ source(ECDICT) checksum == 载荷实体 SHA-256（sha256:4560e3f…）
  ✓ source(ECDICT) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ vocabulary/cloud-native
  ✓ source(curated in-repo (云原生词库)) checksum == 载荷实体 SHA-256（sha256:cddaa3d…）
  ✓ source(curated in-repo (云原生词库)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ vocabulary/frontend
  ✓ source(curated in-repo (前端词库)) checksum == 载荷实体 SHA-256（sha256:ae689a1…）
  ✓ source(curated in-repo (前端词库)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ vocabulary/go-code
  ✓ source(curated in-repo (Go 代码词库)) checksum == 载荷实体 SHA-256（sha256:6b22c0d…）
  ✓ source(curated in-repo (Go 代码词库)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ vocabulary/ielts
  ✓ source(ECDICT) checksum == 载荷实体 SHA-256（sha256:bd904d2…）
  ✓ source(ECDICT) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ vocabulary/kaoyan
  ✓ source(ECDICT) checksum == 载荷实体 SHA-256（sha256:fa6a912…）
  ✓ source(ECDICT) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ vocabulary/toefl
  ✓ source(ECDICT) checksum == 载荷实体 SHA-256（sha256:19f1dac…）
  ✓ source(ECDICT) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ vocabulary/ts-code
  ✓ source(curated in-repo (TS 代码词库)) checksum == 载荷实体 SHA-256（sha256:9f34b06…）
  ✓ source(curated in-repo (TS 代码词库)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
▸ writing/demo-writing-01
  ✓ source(curated in-repo (B-2 试金石)) checksum == 载荷实体 SHA-256（sha256:a0032e0…）
  ✓ source(curated in-repo (B-2 试金石)) 许可判定 allowed
  · manifest 无 assets 字段，跳过 asset 校验
  ✓ 资产契约：无 assets[]，包级 licenses/provenance 不要求（条件未触发）
  ✓ 许可 / 资产判据全部通过
──────────────────────────────────────────────────────
License Gate: PASS —— packages 18, violations 0
```

**EXIT=0**

## gate:license --falsify

```
$ node scripts/gate-license.mjs --falsify
[gate:license] 证伪自检 —— 证明每条判据都能判红（不会失败的门等于没有门）
  用例 21 条（含 2 条判绿对照组）；每条：注入故障 → 断言"命中集恰好等于预期" → 字节还原 → 复验复绿
  隔离副本：D:\work\geek-typing\node_modules\.tmp\gate-license-falsify\content（gitignore；真 content/ 只读、绝不被写）
  边界用例 1 条改的是**真冻结 Plan**（.\docs\p18\P1.8-PLAN-v1.0-FROZEN.md，不在 INV-1 冻结区）：改完立刻按 sha256 字节还原，运行后 `git diff` 必须为空

  ✓ CTRL 恰好判绿（对照组）；还原=bytes；复验复绿 ✓
      对照组：合法资产 + 合法许可（本门**必须判绿**）
  ✓ S1 恰好判红（命中 {SOURCE_LICENSE_UNSTRUCTURED}）；还原=bytes；复验复绿 ✓
      source 无结构化 license（删掉 sources[0].license）
  ✓ S2 恰好判红（命中 {LICENSE_REJECTED}）；还原=bytes；复验复绿 ✓
      外部来源无 SPDX（provider 改外部、license 去掉 spdx）
  ✓ S3 恰好判红（命中 {LICENSE_REJECTED}）；还原=bytes；复验复绿 ✓
      CC-BY-NC（非商用 ⇒ rejected）
  ✓ S4 恰好判红（命中 {LICENSE_REVIEW_REQUIRED}）；还原=bytes；复验复绿 ✓
      CC-BY-SA（review_required ⇒ 在自动门里同判 FAIL）
  ✓ A1 恰好判红（命中 {ASSET_LICENSE_XOR}）；还原=bytes；复验复绿 ✓
      asset 缺许可（既无 license 也无 licenseRef）
  ✓ A2 恰好判红（命中 {ASSET_LICENSE_XOR}）；还原=bytes；复验复绿 ✓
      asset 双写许可（license 与 licenseRef 同时存在）
  ✓ A3 恰好判红（命中 {ASSET_LICENSE_REF_UNRESOLVED}）；还原=bytes；复验复绿 ✓
      licenseRef 解析不到（指向包级 licenses 里不存在的 id）
  ✓ A4 恰好判红（命中 {ASSET_ID_SHAPE}）；还原=bytes；复验复绿 ✓
      assetId 非法（无 #a: 分隔符）
  ✓ A5 恰好判红（命中 {ASSET_NOT_OWNED}）；还原=bytes；复验复绿 ✓
      asset 归属他人（宿主段是另一个包）
  ✓ A6 恰好判红（命中 {ASSET_URL_NOT_HTTPS}）；还原=bytes；复验复绿 ✓
      url 非 https（http 明文）
  ✓ A7 恰好判红（命中 {ASSET_CHECKSUM_SHAPE}）；还原=bytes；复验复绿 ✓
      checksum 形状错（非 sha256:<64 hex>）
  ✓ P1 恰好判红（命中 {PACKAGE_LICENSES_REQUIRED}）；还原=bytes；复验复绿 ✓
      有 assets 但缺包级 licenses 表
  ✓ P2 恰好判红（命中 {LICENSE_REJECTED}）；还原=bytes；复验复绿 ✓
      包级 licenses 表某条判红（CC-BY-NC）
  ✓ S5 恰好判红（命中 {LICENSE_REJECTED}）；还原=bytes；复验复绿 ✓
      source license.commercialUse=false（自有内容也一样拦）
  ✓ S5b 恰好判红（命中 {LICENSE_REJECTED}）；还原=bytes；复验复绿 ✓
      source license.commercialUse 字段缺失（缺失 = 不 true）
  ✓ S6 恰好判红（命中 {LICENSE_REJECTED}）；还原=bytes；复验复绿 ✓
      attributionRequired=true 但无署名文本（外部 MIT）
  ✓ S6b 恰好判绿（对照组）；还原=bytes；复验复绿 ✓
      对照组：attributionRequired=true **且**给出署名文本 → 复绿
  ✓ S7 恰好判红（命中 {SOURCE_PROVENANCE_MISSING}）；还原=bytes；复验复绿 ✓
      source 缺 provenance.origin（删掉 sources[0].origin）
  ✓ S8 恰好判红（命中 {SOURCE_CHECKSUM_MISMATCH}）；还原=bytes；复验复绿 ✓
      sources[].checksum 格式合法但与载荷实体不符
  ✓ M1 恰好判红（命中 {PLAN_4_1_COVERAGE_MISMATCH}）；还原=bytes；复验复绿 ✓
      给冻结 Plan §4.1 表格临时加一行「新规则（本波不应存在）」
──────────────────────────────────────────────────────
License Gate Falsification：✅ PASS —— 21/21 用例恰好判红（含 2 条判绿对照组），隔离副本已字节还原，真 content/ 未被写入
```

**EXIT=0**

## tests/content-query

```
$ node tests/content-query.mjs

【1】registry 契约
  ✅ 注册 10 个 vocabulary 包 — ai-core,cloud-native,frontend,cet4,cet6,ielts,kaoyan,toefl,ts-code,go-code
  ✅ 全库 Σitems = 契约基准（词数变化必须显式确认） — 9346 vs 9346
  ✅ getPackage 支持裸 id
  ✅ getPackage 支持 4 段式 ContentId
  ✅ getPackage 未知 id 返回 undefined
  ✅ listContent("vocabulary") 返回全部 manifest
  ✅ listContent("listening") 返回 1 个结构探针包（B-2 已接入）
  ✅ hasFeature 未知 feature 为 false 且不崩溃
  ✅ getRelations 恒为数组（关系模型就位、无数据）
  ✅ getPackage 支持「来源族-包」namespace 反查

【2】ContentId 规范（V4.1 4 段式 + namespace 每包唯一）
  ✅ ielts 包 id 为 content:vocabulary:ecdict-ielts:ielts — content:vocabulary:ecdict-ielts:ielts
  ✅ parseContentId 可逆解析
  ✅ wordId 保留原词形（与 buildHits 同源，禁止在 id 侧 lowercase）
  ✅ wordId 与 buildHits 生成口径一致（大写词不分歧）
  ✅ 非法 ContentId 解析为 null
  ✅ 10 个包 namespace 两两不同（词级 id 唯一性前提） — curated-ai-core,curated-cloud-native,curated-frontend,ecdict-cet4,ecdict-cet6,ecdict-ielts,ecdict-kaoyan,ecdict-toefl,curated-ts-code,curated-go-code

【3】加载缓存共享（兼容层与查询层同一份数据）
  ✅ 重复 loadPackage 返回同一引用（单份内存）
  ✅ ielts 实际词条数 = manifest.stats.items — 3000

【4】countWords
  ✅ countWords() 全库合计 = manifest 真值 — 9346 vs 9346
  ✅ countWords("ielts") = 3000

【5】searchWords
  ✅ 跨包检索 abandon 有多条来源 — cet4,toefl,ielts
  ✅ 精确命中 ContentId 落在自身包 namespace 下 — content:word:ecdict-cet4:abandon
  ✅ 跨包同词各自不同 ContentId（全局唯一） — 3 条命中 3 个 id
  ✅ 每条命中带包上下文
  ✅ 限定包检索只返回该包
  ✅ packageId 支持 4 段式
  ✅ 精确优先：首位为词形全等命中
  ✅ exact=true 不返回前缀命中 — 0
  ✅ exact=false 返回前缀命中 — abandon
  ✅ 空查询返回空数组
  ✅ limit 生效
  ✅ 中文按释义/翻译命中 — abandon=放弃；抛弃

【6】getWord（Word Detail 前置接口）
  ✅ 按 ContentId 取到词条 — content:word:ecdict-ielts:abbreviation → abbreviation
  ✅ 词条带翻译 — n. 缩写词, 缩写, 缩短, 节略
  ✅ 词条唯一归属 ielts 包 — content:vocabulary:ecdict-ielts:ielts
  ✅ 跨包同词 "considerate" 各自可寻址且归属不同包 — ielts / cet4
  ✅ 不存在的词返回 null
  ✅ 错误 type 返回 null
  ✅ 非 ContentId 返回 null

【7】listWords（分页 + 过滤）
  ✅ 第 1 页 10 条
  ✅ 第 2 页与第 1 页无交集
  ✅ id 落在包 namespace 内
  ✅ 未知包返回空数组
  ✅ hasPhonetic 过滤生效 — 84 条带音标

【8】contentQuery 统一 API
  ✅ contentQuery 暴露 search/list/get/count
  ✅ search({type:"word"}) 与 searchWords 结果一致 — 3 条
  ✅ type:'all' 包含 word 与 reading 两族结果（id 集合包含关系，不比长度） — word=53 reading=1 all=54
  ✅ type:'listening'（仍未放开）返回空数组
  ✅ search 默认 type 为 word
  ✅ search 精确排序保持：首位为词形全等 — abandon
  ✅ search 支持 4 段式 packageId
  ✅ contentQuery.get(contentId) 命中 — content:word:ecdict-ielts:abbreviation
  ✅ contentQuery.get 未放开类型返回 null
  ✅ contentQuery.get(reading ContentId) 命中且 type/itemId 正确（P18-E 放开） — content:reading:demo-demo-reading-01:reading-item-01
  ✅ contentQuery.get 非法 id 返回 null
  ✅ count({type:"word"}) = 全库合计 — 9346 vs 9346
  ✅ count({type:"listening"}) = 0
  ✅ count({packageId:"ielts"}) = 3000
  ✅ count({tags:["ielts"]}) = 3000
  ✅ list 分页生效（page1/page2 各 5 条且无交集）
  ✅ list tags 过滤生效 — 5 条
  ✅ list 未知 tag 返回空
  ✅ list 未知包返回空
  ✅ list 未放开类型返回空
  ✅ list hasPhonetic 过滤生效 — 0/43

【9】Catalog + Content Index
  ✅ catalog.types vocabulary = 10 包 — 10
  ✅ catalog.types vocabulary items = manifest 真值 — 9346 vs 9346
  ✅ catalog 已接入 listening（B-2 结构探针包，真实数字） — listening packages=1 items=6
  ✅ catalog 已接入 audio/reading/topic/exercise/writing/speaking/collection（B-2 各 1 探针包，真实数字） — audio=1p/5i reading=1p/6i topic=1p/5i exercise=1p/5i writing=1p/5i speaking=1p/5i collection=1p/5i
  ✅ catalog.totalItems = 全类型 manifest 真值合计 — 9388 vs 9388
  ✅ catalog.packages 覆盖 18 个包（10 vocabulary + 8 探针/组合） — 18
  ✅ catalog.schemaVersion 为数字 — 4
  ✅ getPackageCatalog("ielts") 字段正确 — {"localId":"ielts","contentId":"content:vocabulary:ecdict-ielts:ielts","title":"雅思核心 IELTS","type":"vocabulary","items":3000,"tags":["ielts","vocabulary"],"features":["phonetic","definition"],"offline":"lazy"}
  ✅ getPackageCatalog 未知 id 返回 null
  ✅ getCatalog 不加载词条（只读 manifest）
  ✅ ensureIndex() 后 entries = 全库（含 demo 包）合计 — 9388 vs 9388
  ✅ ensureIndex() 后 packages = 注册包数（省略参数 = 覆盖全库） — 18 vs 18
  ✅ ensureIndex 幂等（二次调用 entries 不变）
  ✅ byWord 收录词条的归一化 key — abbreviation
  ✅ byWord 归一：大写 / 首尾空格落到同一 key
  ✅ byPackage 按包聚合
  ✅ byTag 收录包级 tag
  ✅ invalidateIndex("ielts") 后 entries 降该包 items 数 — 6388 vs 6388
  ✅ invalidateIndex("ielts") 后 packages = 注册包数 - 1 — 17 vs 17
  ✅ 失效后 byPackage 不再含 ielts
  ✅ 失效后 byWord 不再含 ielts 词条
  ✅ 失效后 byTag 不再含 ielts 词条
  ✅ 重新 ensureIndex 恢复全量 — 9388 vs 9388
  ✅ 重建后 byWord 恢复 ielts 词条
  ✅ invalidateIndex() 全清
  ✅ ensureIndex(["ielts"]) 只建目标包
  ✅ 查询在部分索引下仍可用
  ✅ findByPackage("cet4") 与 byPackage 表一致 — 84 vs 84
  ✅ idsByPackage("cet4") 与 byPackage 表逐 id 一致
  ✅ findById(id) 命中同一对象（与 byId 引用相等） — content:word:ecdict-ielts:abbreviation
  ✅ findById 未知 id 返回 null
  ✅ findByWord 与 byWord 表一致 — abbreviation
  ✅ findByWord 未知词形返回空数组
  ✅ findByNamespace("ecdict-cet4") 命中 cet4 全包 — 84
  ✅ findByNamespace 未知 namespace 返回空数组
  ✅ findByTag("code") 与 byTag 表一致 — 100

【10】id 自洽性（生成侧 vs 寻址侧大小写口径）
   —— V4.1-P0.5 独立复核实测捕获：id 生成保留原词形大小写，若 get 用 lowercase 反查，
      9346 条里 93 条会「search 查得到、get 取不回」（go-code 41/50、ts-code 34/50）
  ✅ 全库 9346 条 id 均可按自身 id 取回（get ⇄ list 自洽） — 零漏取
  ✅ ts-code（大小写敏感）50 条全部可按自身 id 取回 — 漏 0
  ✅ go-code（大小写敏感）50 条全部可按自身 id 取回 — 漏 0
  ✅ ielts（大小写敏感）3000 条全部可按自身 id 取回 — 漏 0
  ✅ 大写词条按自身 id 命中（Oxford） — content:word:ecdict-ielts:Oxford
  ✅ lowercase id 走兜底仍可命中（兼容历史/手写 id）

【11】Query Scope（首页 / 搜索页 / 词库页 / Detail / 收藏页共用一套作用域）
  ✅ scope{type,packageId} 与平铺 packageId 结果一致 — 1 条：ielts
  ✅ scope.namespace:'ecdict-ielts' 只命中 ielts — 3000 条
  ✅ scope.tags:['code'] 命中 ts-code + go-code = 100 — 100 条 / go-code,ts-code
  ✅ 平铺参数覆盖 scope（packageId:cet4 胜出） — 84 条 / cet4
  ✅ count({scope:{namespace:'curated-ai-core'}}) = 43
  ✅ 空 scope 视为全库（缺省 = 无过滤） — 9346
  ✅ scope 未知包返回空

【12】Search Sort 契约（deterministic ⇒ 翻页不重不漏）
  ✅ sort:"word" 前 20 条按词形非降序 — abbreviation,abnormal,abolish,aboriginal,abort
  ✅ sort:"word" 前 20 条原始词形亦非降序（该区间无大小写混排）
  ✅ deterministic：同一 query 连续两次 id 序列完全相同 — 1000 条
  ✅ 分页不重不漏：page1..10 拼接 === pageSize:1000 一次取回的前 100 条
  ✅ 默认 sort 为 relevance：精确命中排在最前且不与其它组混排 — 1 条精确命中 / 共 3 条
  ✅ sort:"relevance" 显式与默认一致
  ✅ sort:"updated" 不报错、条数正确、顺序 deterministic（当前退化为包内数据顺序） — 84 条
  ✅ sort:{field:'word',order:'desc'} 降序生效 — zoology,zoo,zest,zero,youngster
  ✅ desc 顺序同样 deterministic，且与 asc 命中同一集合（翻页不漏项） — 3000 条双向一致
  ✅ sort:{field:'updated',order:'desc'} 不报错且条数不变 — 84 条

【13】ContentSnapshot 契约（V4.1-P0.6：哪个实体的哪个快照）
  ✅ snapshotOf 字段齐全（contentId/contentVersion/checksum/publishedAt 对得上） — {"contentId":"content:vocabulary:ecdict-cet4:cet4","contentVersion":7,"checksum":"sha256:aaa","schemaVersion":4,"publishedAt":"2026-09-26"}
  ✅ snapshotOf 带出 schemaVersion — schemaVersion=4
  ✅ snapshotOf 省略 publishedAt 时结果不含该键 — contentId,contentVersion,checksum,schemaVersion
  ✅ snapshotOf publishedAt 显式 undefined 时同样不含该键
  ✅ schemaVersion 省略时取 SCHEMA_VERSION 常量
  ✅ schemaVersion 为正整数且两次省略调用结果相同 — 4
  ✅ schemaVersion 可显式指定（覆盖常量）
  ✅ isSameSnapshot 同一对象 → true
  ✅ isSameSnapshot 内容完全相同的两份 → true
  ✅ isSameSnapshot checksum 不同 → false
  ✅ isSameSnapshot contentVersion 不同 → false
  ✅ isSameSnapshot contentId 不同 → false
  ✅ isSameSnapshot 仅 version+checksum 同但 contentId 不同 → false（不能只比 version/checksum）
  ✅ isSameSnapshot 任一侧为 null/undefined → false（宁可重学也不误判相同）
  ✅ findRevision 同一 checksum 出现两次 → 返回 revision 最大的那条（倒序扫描） — {"revision":3,"version":1,"checksum":"sha256:X","publishedAt":"2026-01-01"}
  ✅ findRevision 结果与正序第一条不同（证明口径不再是「首条命中」） — 倒序=3 / 正序=1
  ✅ findRevision 多条 history 中命中唯一 checksum 的条目
  ✅ findRevision 单条正常命中
  ✅ findRevision 空 history → null
  ✅ findRevision 非数组 history → null
  ✅ findRevision 无匹配 → null
  ✅ findRevision 空字符串 checksum → null
  ✅ cet4 manifest 已写入版本三元组（读不到即 FAIL，不跳过） — revision=2 version=2
  ✅ findRevision(cet4 history, contentChecksum).version === manifest.contentVersion — 2 vs 2
  ✅ findRevision(cet4 history, contentChecksum).revision === manifest.contentRevision — 2 vs 2
  ✅ cet4 contentHistory 按 revision 升序追加（findRevision 倒序扫描的前提） — 1,2

【14】queryWord —— UI 唯一需要的单条寻址入口
  ✅ 命中：返回 WordHit，id = content:word:<namespace>:<原词形> — content:word:ecdict-cet4:abandon
  ✅ 命中：translation 非空（证明拿到的不是「空释义占位对象」） — 放弃；抛弃
  ✅ 未命中：**严格返回 null**（不是空词条对象）—— 这是消灭静默空释义的前提 — got=null
  ✅ 对照组：换个存在的词立刻非 null（证明上面的 null 来自未命中，而非恒返回 null） — w=absolute
  ✅ 包不存在：返回 null 而不抛异常（C-5 口径：非法 id 返回 null，不抛）
  ✅ 空词形 / 纯空白：返回 null
  ✅ queryWord 与 getWord 口径一致（同一 id、同一 word、同一 translation） — content:word:ecdict-cet4:abandon === content:word:ecdict-cet4:abandon
  ✅ 大小写①：原词形精确命中（保留大写） — Oxford
  ✅ 大小写②：传 lowercase 仍命中同一 ContentId（norm 兜底生效） — content:word:ecdict-ielts:Oxford
  ✅ 大小写③：传全大写同样命中 — content:word:ecdict-ielts:Oxford
  ✅ 对照组：仓库里确实存在 lazy 包（否则下一条结论无意义） — ielts,kaoyan,toefl
  ✅ lazy 包 ielts：queryWord 结果与 loadPackage 数据一致（懒加载自证见 queryword-lazy.mjs） — eagle
  ✅ 二次调用：结果逐字节相同（索引缓存不改变语义）
  ✅ 已挂进 contentQuery 聚合导出（设计文档 §4.2 第 5 条）

【15】P18-E reading 放开（启用集 / 包路由 / 索引 / 结果形状）
  ✅ count({type:'reading'}) = reading 包 stats.items(6) — 6 vs 6
  ✅ list({type:'reading'}) 非空且每条 type='reading' / 归属 demo-reading-01 / title 为 string — 6 条
  ✅ list({type:'reading', hasPhonetic:true}) == list({type:'reading'})（非 word 族不参与音标筛选） — 6 vs 6
  ✅ count({type:'reading', hasPhonetic:true}) = readingItems（count 与 list 同源）
  ✅ list({type:'reading', sort:{field:'word',order:'desc'}}) == list({type:'reading'})（词形主序对非 word 族中性） — desc=reading-item-05,reading-item-02,reading-item-03,reading-item-04,reading-item-06,reading-item-01 / 默认=reading-item-05,reading-item-02,reading-item-03,reading-item-04,reading-item-06,reading-item-01
  ✅ list({type:'word', packageId:'demo-reading-01'}) = [] 且 count = 0（异族包被滤掉）
  ✅ list({type:'reading', packageId:'ielts'}) = []（反向同样不外溢）
  ✅ search({type:'reading', query:'tea'}) 非空且全部 type='reading' — 1 条：reading-item-01
  ✅ search({type:'reading', query:'zzz-not-present'}) = []
  ✅ search({type:'reading', query:'reading-item-02', exact:true}) 命中该条目（index.exact 走 id） — 1 条
  ✅ list({type:"reading",pageSize:2}) 两次调用 id 序列完全一致 — content:reading:demo-demo-reading-01:reading-item-05|content:reading:demo-demo-reading-01:reading-item-02
  ✅ page1 / page2 无交集 — 2/2
  ✅ index.byWord 不含任何 'content:reading:' 开头的 id（非 word 族不进倒排表） — byWord 共 9346 项
  ✅ 对照组：index.byId 含 reading 条目（证明索引确实覆盖 reading，上条非空转） — 6
  ✅ get(条目自身 ContentId) 命中同一条，且 parseContentId 解析出的 type = reading — content:reading:demo-demo-reading-01:reading-item-05

──────────────────────────────────────────────────────
共 179 项，通过 179，失败 0
──────────────────────────────────────────────────────
```

**EXIT=0**

## tests/ui-contract

```
$ node tests/ui-contract.mjs
== P18-D · UI 内容契约棘轮门（INV-2 · tests/ui-contract.mjs）==
扫描范围 = UI_SCOPE_RE ∪ UI_EXTRA_FILES(["src/lib/wordResolve.ts"])
扫描到 26 个文件；内容包 id 集合 18 个（从 content/ 派生）；AST 判定耗时 1803ms
基线 docs/p18/_generated/ui-contract-baseline.json（记录于 2026-10-01T03:52:02.912Z）

  ✅ SCAN-NONEMPTY [PASS] — 扫描到 26 个文件
  ✅ ZERO-tableJsonImports [PASS] — tableJsonImports = 0（硬零：CONTENT_CONTRACT §12.2①，单位=import 语句（静态 + 动态））
  ✅ ZERO-packageBranches [PASS] — packageBranches = 0（硬零：CONTENT_CONTRACT §12.2③，单位=BinaryExpression 边）
  ✅ RATCHET-wordTableSources [PASS] — wordTableSources 当前 13 ≤ 基线 13（余量 0）
  ✅ RATCHET-handleReads [PASS] — handleReads 当前 11 ≤ 基线 11（余量 0）
  ✅ RATCHET-bannedArrayOps [PASS] — bannedArrayOps 当前 11 ≤ 基线 11（余量 0）
  ✅ RATCHET-bypassFacadeImports [PASS] — bypassFacadeImports 当前 0 ≤ 基线 0（余量 0）
  ✅ ⑧-4 显式追加文件已纳入扫描（src/lib/wordResolve.ts） — 在扫描集内
  ✅ 对照组：探针扫描集与期望表**逐一对应**（无未登记探针） — 9 个探针文件
  ✅ 探针 _support/wordBanks.ts 命中数恰好等于预期 — 六桶全 0（放行样本）
  ✅ 探针 p1-table-json-import.probe.ts 命中数恰好等于预期 — {tableJsonImports=2}
  ✅ 探针 p2-package-branch.probe.ts 命中数恰好等于预期 — {packageBranches=1}
  ✅ 探针 p3-word-table-source.probe.ts 命中数恰好等于预期 — {wordTableSources=2, handleReads=2}
  ✅ 探针 p4-banned-array-ops.probe.ts 命中数恰好等于预期 — {wordTableSources=1, handleReads=1, bannedArrayOps=3}
  ✅ 探针 p5-handle-reads.probe.ts 命中数恰好等于预期 — {wordTableSources=2, handleReads=3}
  ✅ 探针 p6-bypass-facade.probe.ts 命中数恰好等于预期 — {bypassFacadeImports=1}
  ✅ 探针 p7-type-only-negative.probe.ts 命中数恰好等于预期 — 六桶全 0（放行样本）
  ✅ 探针 p8-false-positive-guards.probe.ts 命中数恰好等于预期 — 六桶全 0（放行样本）
  ✅ 对照组双向钳制成立（同时存在「期望非零」与「期望全零」样本） — 期望非零 6 个 / 期望全零 3 个 —— 缺任一侧都会让「恒放行」或「恒判红」的实现蒙过去
──────────────────────────────────────────────────────
共 19 项，通过 19，失败 0
UI Content Contract：✅ PASS —— 硬零 2/2、棘轮 4/4、探针 9 个全对；计数 tableJsonImports=0 packageBranches=0 wordTableSources=13 handleReads=11 bannedArrayOps=11 bypassFacadeImports=0
```

**EXIT=0**

## tests/ui-contract --falsify

```
$ node tests/ui-contract.mjs --falsify
[ui-contract] 证伪自检 —— 证明每条判据分支都能判红（不会失败的门等于没有门）
  三组用例：A 决策层各分支精确判红 / B 输入层 fail-closed（基线缺失·坏 JSON）/ C 探测器层字节注入→精确命中→字节还原→复绿
  隔离副本：node_modules/.tmp/ui-contract-falsify（gitignore；真仓库文件只读）

  ✓ A1 恰好判红（fail={ZERO-tableJsonImports} unknown={∅}）
      注入 tableJsonImports=1（硬零桶）
  ✓ A2 恰好判红（fail={ZERO-packageBranches} unknown={∅}）
      注入 packageBranches=1（硬零桶）
  ✓ A3 恰好判红（fail={RATCHET-wordTableSources} unknown={∅}）
      wordTableSources 抬到 基线+1
  ✓ A4 恰好判红（fail={RATCHET-handleReads} unknown={∅}）
      handleReads 抬到 基线+1
  ✓ A5 恰好判红（fail={RATCHET-bannedArrayOps} unknown={∅}）
      bannedArrayOps 抬到 基线+1
  ✓ A6 恰好判红（fail={RATCHET-bypassFacadeImports} unknown={∅}）
      bypassFacadeImports 抬到 基线+1
  ✓ A7 恰好判红（fail={∅} unknown={SCAN-NONEMPTY}）
      扫描到 0 个文件（⇒ UNKNOWN，不通过）
  ✓ A8 恰好判红（fail={∅} unknown={RATCHET-wordTableSources,RATCHET-handleReads,RATCHET-bannedArrayOps,RATCHET-bypassFacadeImports}）
      基线不可用（按 0 处理会全绿 ⇒ 必须走 Fatal）
      ↳ 四个棘轮桶全部退化为 UNKNOWN（不是 PASS）—— 证明「基线读不到 ⇒ 当 0 ⇒ 全绿」这条假绿路径不存在
  ✓ ACTRL 恰好判绿（对照组）
      对照组：不注入任何故障 ⇒ 九条判据全 PASS
  ✓ B1 恰好判 Fatal（exit 2），且**没有**把缺失当成计数 0
      基线文件缺失 ⇒ readBaseline ok=false ⇒ 入口 exit 2
      ↳ 基线文件读不到（D:\work\geek-typing\node_modules\.tmp\ui-contract-falsify\absent-baseline.json）— ENOENT: no such file or directory, open 'D:\work\geek-typing\node_modules\.tmp\ui-contract-falsify\absent-baseline.json'
  ✓ B2 恰好判 Fatal（exit 2），且**没有**把缺失当成计数 0
      基线 JSON 损坏 ⇒ readBaseline ok=false ⇒ 入口 exit 2
      ↳ 基线文件不是合法 JSON — Unexpected end of JSON input
  ✓ B3 恰好判 Fatal（exit 2），且**没有**把缺失当成计数 0
      基线桶集合不全（缺桶 ⇒ 不得当成 0）
      ↳ 基线 buckets.wordTableSources 缺失或不是非负整数（实测 undefined）
  ✓ C0 对照组：隔离副本 pristine 状态六桶全 0（基线 {tableJsonImports=0, packageBranches=0, wordTableSources=0, handleReads=0, bannedArrayOps=0, bypassFacadeImports=0}）
  ✓ C1 探测器恰好判红（增量 {tableJsonImports+1}）
      直读词表 JSON（静态 import）
      ↳ 字节还原 ✓，对照组复绿 ✓（增量归零）
  ✓ C2 探测器恰好判红（增量 {packageBranches+1}）
      内容包 id 分支
      ↳ 字节还原 ✓，对照组复绿 ✓（增量归零）
  ✓ C3 探测器恰好判红（增量 {wordTableSources+1}）
      词表来源点（X.words，无读操作）
      ↳ 字节还原 ✓，对照组复绿 ✓（增量归零）
  ✓ C4 探测器恰好判红（增量 {handleReads+1}）
      句柄读（按名锚点 bankWords.length，不掺 wordTableSources）
      ↳ 字节还原 ✓，对照组复绿 ✓（增量归零）
  ✓ C5 探测器恰好判红（增量 {bannedArrayOps+1}）
      WordItem[] 上的禁用算子（不掺 wordTableSources）
      ↳ 字节还原 ✓，对照组复绿 ✓（增量归零）
  ✓ C6 探测器恰好判红（增量 {bypassFacadeImports+1}）
      绕过门面直引 core/content/** 深路径
      ↳ 字节还原 ✓，对照组复绿 ✓（增量归零）
  ✓ CTRL 真仓库只读：真基线可读且未被改写，真探针夹具与副本逐字节一致
──────────────────────────────────────────────────────
✓ falsify: 20/20 恰好判红（含 1 条全 PASS 决策对照组 + 1 条 pristine 探测器对照组 + 1 条真仓库只读对照）
```

**EXIT=0**

## tests/relations

```
$ node tests/relations.mjs
──────────────────────────────────────────────────────
relations 端点可达性契约（P18-G0 · 共享模块 scripts/content/relations.mjs）
──────────────────────────────────────────────────────
  ✅ 对照组：真实 content/ 至少发现 1 个包（否则下面全是空转） — 18 个包
  ✅ 取样点存在（vocabulary/ai-core 与 reading/demo-reading-01 均已加载且带载荷） — vocab ns=curated-ai-core word=transformer / reading ns=demo-demo-reading-01 item=reading-item-01
  ✅ ① 词库端点可达：content:word:<ns>:<词形> — content:word:curated-ai-core:transformer
  ✅ ② reading 条目端点可达：content:reading:<ns>:<条目 id>（本波修复目标 —— 未修时此条判红） — content:reading:demo-demo-reading-01:reading-item-01
  ✅ ③ 不存在的 local 不可达（防可达性被写成恒真） — content:reading:demo-demo-reading-01:reading-item-99
  ✅ ④ 跨族不可达：把 reading 条目 id 放进 content:word:<同 ns> 下（词桶 ⇄ 条目桶不得串） — content:word:demo-demo-reading-01:reading-item-01
  ✅ ⑤ 包级 ContentId 可达（整包端点，先于条目桶命中） — content:vocabulary:curated-ai-core:ai-core
  ✅ ⑤b 对照组：非词库的包级 ContentId 同样可达 — content:reading:demo-demo-reading-01:demo-reading-01
  ✅ ⑥ 静态断言：scripts/gate-content-contract.mjs 引用共享模块 relations.mjs（防复制漂移）
  ✅ ⑥ 静态断言：scripts/content/ingest.mjs 引用共享模块 relations.mjs（防复制漂移）
  ✅ ⑥ 静态断言：scripts/content/validate.mjs 引用共享模块 relations.mjs（防复制漂移）

──────────────────────────────────────────────────────
共 11 项，通过 11，失败 0
──────────────────────────────────────────────────────
```

**EXIT=0**

## check:bundle

```
$ node scripts/check-bundle.mjs
[check-bundle] dist/assets：13 个文件
  1. ✓ PASS   主 chunk index-BWml2sHn.js：426.67 KiB raw / 134.84 KiB gzip ≤ 439.45/141.60 KiB（余量 2.9% / 4.8%；来源 absolute / absolute）
  2. ✓ PASS   数据 chunk 11 个（words 3 + items 8）≥ registry lazy 包 11 个
  3. ✓ PASS   预热预算（ielts→words-CZ5ER7rC.js(166.87 KiB)，kaoyan→words-2QG2Fjtl.js(166.85 KiB)，toefl→words-uy6NfwIr.js(163.17 KiB)）：gzip 合计 496.89 KiB ≤ 600 KiB（余量 17.2%）
  4. ✓ PASS   manifest runtime 投影（J1 PASS / J2 PASS / J3 PASS）
        J1 ✓ PASS   白名单 25 字段 ∪ 裁剪 3 字段 = 28；PackageManifest 28 字段；content 并集 25 字段；src/ 无 manifest.json?raw 回退
        J2 ✓ PASS   被裁字段 [sources, contentHistory, build] 的 10 个探测串在主 chunk 命中 0 次
        J3 ✓ PASS   保留字段探测串 5/5 命中（≥4，对照组有效）："stats:"=22, "description:"=20, "contentChecksum:"=20, "features:"=19, "offline:"=19
  5. ✓ PASS   lazy 语义（registry 声明 lazy 的包不得 inline 进主 chunk）：registry 全部 11 个 lazy 包的探测串在主 chunk 命中 0 次
      · ielts (vocabulary/load) probes=8 → ✓ 未进主 chunk
      · kaoyan (vocabulary/load) probes=8 → ✓ 未进主 chunk
      · toefl (vocabulary/load) probes=8 → ✓ 未进主 chunk
      · demo-listening-01 (items/loadData) probes=8 → ✓ 未进主 chunk
      · demo-audio-01 (items/loadData) probes=8 → ✓ 未进主 chunk
      · demo-reading-01 (items/loadData) probes=8 → ✓ 未进主 chunk
      · demo-topic-01 (items/loadData) probes=8 → ✓ 未进主 chunk
      · demo-exercise-01 (items/loadData) probes=8 → ✓ 未进主 chunk
      · demo-writing-01 (items/loadData) probes=8 → ✓ 未进主 chunk
      · demo-speaking-01 (items/loadData) probes=8 → ✓ 未进主 chunk
      · demo-study-set (items/loadData) probes=8 → ✓ 未进主 chunk

[check-bundle] PASS：5 项全部通过
```

**EXIT=0**

## check:bundle --falsify

```
$ node scripts/check-bundle.mjs --falsify
[check-bundle] --falsify 自带证伪自检（不会失败的门等于没有门）
  用例 6 条；每条：注入故障 → 断言「目标分支恰好 FAIL，其余分支状态不变」→ 整门必须非 PASS

  ✓ CTRL 基线对照：四分支 J1/J2/J3/lazy 全 PASS（断言非恒红）
  ✓ J1 目标分支 j1 恰好判红（命中集 {j1}），其余分支状态不变，整门 exit=1
      RUNTIME_MANIFEST_FIELDS 多一个不存在的字段（__NO_SUCH_FIELD__）
      白名单 26 字段 ∪ 裁剪 3 字段 = 29；PackageManifest 28 字段；content 并集 25 字段 —— 白名单多出（不在 PackageManifest 字段集，疑似写错字段名）：__NO_SUCH_FIELD__
  ✓ J1b 目标分支 j1 恰好判红（命中集 {j1}），其余分支状态不变，整门 exit=1
      src/ 下存在 manifest.json?raw 导入（J1 防回退子判据）
      白名单 25 字段 ∪ 裁剪 3 字段 = 28；PackageManifest 28 字段；content 并集 25 字段 —— src/ 下仍有 manifest.json?raw 导入（投影被撤销的回退）：src/core/content/registry.ts:41
  ✓ J2 目标分支 j2 恰好判红（命中集 {j2}），其余分支状态不变，整门 exit=1
      把被裁字段的探测串换成必然存在的保留字段串（stats:）
      sources 探测串 "stats:" 命中 22 次（上下文 …abulary`],icon:`Globe`,features:{phonetic:!0,definition:!0},stats:{phonetic:2986,definition:3e3,items:3e3},offline:{policy:`la…） —— 被裁字段不该出现在主 chunk（投影失效或字段被写回白名单）
  ✓ J2b 目标分支 j2 恰好判红（命中集 {j2}），其余分支状态不变，整门 exit=1
      把 ?raw 形态的 manifest JSON 塞进主 chunk（模拟投影被撤销退回 ?raw）
      sources 探测串 "\"sources\"" 命中 1 次（上下文 …window.setTimeout(()=>void e(),2e3)})}} var raw=`[{"id":"x","sources":[],"contentHistory":[],"build":{"toolVersion":"content-buil…）；contentHistory 探测串 "\"contentHistory\"" 命中 1 次（上下文 …eout(()=>void e(),2e3)})}} var raw=`[{"id":"x","sources":[],"contentHistory":[],"build":{"toolVersion":"content-build/1.1","builtAt":"20…）；build 探测串 "\"toolVersion\"" 命中 1 次（上下文 …r raw=`[{"id":"x","sources":[],"contentHistory":[],"build":{"toolVersion":"content-build/1.1","builtAt":"2026-09-28T00:00:00.000Z","s…）；build 探测串 "\"builtAt\"" 命中 1 次（上下文 …ntentHistory":[],"build":{"toolVersion":"content-build/1.1","builtAt":"2026-09-28T00:00:00.000Z","sourceChecksum":"sha256:00"}}]`…）；build 探测串 "\"sourceChecksum\"" 命中 1 次（上下文 …n":"content-build/1.1","builtAt":"2026-09-28T00:00:00.000Z","sourceChecksum":"sha256:00"}}]`; …） —— 被裁字段不该出现在主 chunk（投影失效或字段被写回白名单）
  ✓ J3 目标分支 j3 恰好判红（命中集 {j3}），其余分支状态不变，整门 exit=1
      把保留字段探测串换成必然不存在的串（__NO_SUCH_FIELD__:）
      保留字段探测串仅 0/1 命中（要求 ≥4）："__NO_SUCH_FIELD__:"=0 —— 探测本身无效：manifest 可能没进主 chunk，或探测串形态写得不对（J2 的"不存在"断言会因此空转）
  ✓ L5 目标分支 lazy 恰好判红（命中集 {lazy}），其余分支状态不变，整门 exit=1
      把某个 lazy 包的全部探测串塞进主 chunk 文本
      ielts 的 8 个探测串**全部**命中主 chunk（声明 lazy 却被 inline）
──────────────────────────────────────────────────────
✓ falsify: 6/6 恰好判红（含 1 条全 PASS 基线对照）
```

**EXIT=0**

## gate:perf

```
$ node scripts/gate-perf.mjs
== P1.7-Wave5 · D-2/D-3 Budget Gate（gate-perf）==
规则：effective = min-strict(baseline×1.15, absolute)，双基线（计划 a8d10c0 / 当前实测）取更严

  ✅ 主 chunk index-*.js raw       当前 436908 B ≤ effective 450000 B（来源 absolute；基线 计划 428324 B / 实测 445931 B）
  ✅ 主 chunk index-*.js gzip      当前 138079 B ≤ effective 145000 B（来源 absolute；基线 计划 — / 实测 138249 B）
  ✅ words-*.js 单个最大 raw          当前 483087 B ≤ effective 550000 B（来源 absolute；基线 计划 483087 B / 实测 483087 B）

---- baseline-only 行（D-3：Mobile 独立不共享桌面值；CI 不判红，供本机 bench 对照）----
  ℹ️ searchWords P95    基线 32.649 ms → derived(×1.15) 预算 37.547 ms
  ℹ️ queryWord P95      基线 0.005 ms → derived(×1.15) 预算 0.006 ms
  ℹ️ Boot Desktop P95   基线 112.6 ms → derived(×1.15) 预算 129.49 ms
  ℹ️ Boot Mobile P95    基线 316.6 ms → derived(×1.15) 预算 364.09 ms

✅ gate-perf PASS：3 行 bundle 预算全部通过
```

**EXIT=0**

## gate:architecture

```
$ node scripts/gate-architecture.mjs
== P1.7-W3 · Architecture Gate 汇总（A-4）==
已接入子门 5 个，计划内待落地 5 个（PENDING 不计 FAIL，但必打印）

  ✅ B02            learning-boundary  EXIT=0  UI→core/learning 唯一入口 / UI❌→lib/learning
  ✅ G4             g4                 EXIT=0  G4-1/2/3① 静态侧（键族入口 + 零静默 catch）
  ✅ A03            legacy-wordbank    EXIT=0  旧词库边界
  ✅ persistence    persistence        EXIT=0  UI❌→localStorage；core/learning❌→browser storage 直触
  ✅ practice-engine practice-engine    EXIT=0  练习引擎边界
  ✅ content-contract content-contract   EXIT=0  （已从 PENDING 转为已接入）Content 必须经 registry 注册
  ✅ content-type-contract content-type-contract EXIT=0  （已从 PENDING 转为已接入）类型契约唯一 / 禁 per-type 散落 / 注册表⟷查询层对账（INV-6）
  ✅ perf           perf               EXIT=0  （已从 PENDING 转为已接入）新依赖必须过 bundle budget
  ✅ license        license            EXIT=0  （已从 PENDING 转为已接入）资产/许可入库前置硬门（INV-5）
  ✅ ui-contract    ui-contract        EXIT=0  （已从 PENDING 转为已接入）UI 内容契约棘轮门（INV-2）：UI 只经 Catalog/Query/Learning 访问内容数据

共 10 项：通过 10，失败 0，未接入 0
失败子项：无
未接入子项：无

✅ Architecture Gate PASS
```

**EXIT=0**

## gate:todo

```
$ node scripts/gate-todo.mjs
== P1.7-W3 · TODO Gate（§14 登记式 allowlist）==
扫描范围：src / scripts / tests
exclude（目录段）：node_modules / dist / coverage / _generated / fixtures / vendor / docs
Tokens：TODO | FIXME | XXX | HACK | BLOCKED | UNIMPLEMENTED | TEMP（完整词匹配，大小写不敏感）
文件：176 个 —— AST 通道(ts-morph) 95 / 降级通道(正则) 81
allowlist：P1.7-DEFERRED.md —— 登记 12 条

命中总数 12 处 —— 注释 3 / 标识符 9 / 类型·成员名 0
已登记豁免 12 处，未登记违规 0 处

---- 已登记（豁免）----
  ⏸ scripts/build-cet-phonetics.mjs:111  XXX  （comment）
  ⏸ scripts/content/normalize.mjs:93  BLOCKED  （identifier）
  ⏸ scripts/content/normalize.mjs:102  BLOCKED  （identifier）
  ⏸ scripts/content/normalize.mjs:103  BLOCKED  （identifier）
  ⏸ scripts/content/normalize.mjs:162  BLOCKED  （identifier）
  ⏸ scripts/content/normalize.mjs:180  BLOCKED  （identifier）
  ⏸ scripts/content/normalize.mjs:181  BLOCKED  （identifier）
  ⏸ scripts/gate-practice-engine.mjs:77  XXX  （comment）
  ⏸ src/components/ReviewPanel.tsx:85  TODO  （identifier）
  ⏸ src/components/ReviewPanel.tsx:88  TODO  （identifier）
  ⏸ src/components/ReviewPanel.tsx:90  TODO  （identifier）
  ⏸ src/lib/customBanks.ts:58  XXX  （comment）

共 12 处命中：登记 12，违规 0

✅ TODO Gate PASS
```

**EXIT=0**

## gate:learning-boundary

```
$ node scripts/gate-learning-boundary.mjs
== P1.6-B02 · Learning Boundary Gate ==
  ✅ 消费者文件无学习模块静态值导入（防倒退） — 无
  ✅ 消费者文件无学习模块动态导入（import()/require()） — 无
  ✅ 消费者文件无学习键族字面量（键族唯一入口 = lib/learning/storage.ts） — 无
  ✅ 白名单为空或仅含已知待迁移项 — 无（白名单已清零，边界全收口）

共 4 项，通过 4，失败 0
```

**EXIT=0**

## test:e2e

```
$ npm run test:e2e

> geek-typing@0.0.0 test:e2e
> node tests/e2e.mjs

🚀 vite preview 已就绪（127.0.0.1:4173，pid 22124）
🌐 浏览器：C:\Program Files\Google\Chrome\Application\chrome.exe
🎯 目标：http://127.0.0.1:4173

【1】首屏与下拉导航
  ✅ 页面标题正确 — Geek Typing · 极客打字背单词
  ✅ 默认词库是 2026 AI 核心词库
  ✅ 统计栏四项齐全（中文标签）
  ✅ 顶栏只保留下拉导航
  ✅ 练习下拉含三模式
  ✅ 练习下拉含自动发音开关
  ✅ Esc 可关闭下拉
  ✅ 能读出当前单词 — 单词=grounding
  ✅ 虚拟键盘存在
  ✅ 虚拟键盘高亮首字母 — 高亮=g 应=g

【2】打字核心链路（严格纠错）
  ✅ 敲错被拦住（仍在第 1 词）
  ✅ 打完自动切到第 2 词
  ✅ 打卡「今日」计数 +1

【3】连击 / WPM / 虚拟键盘跟随
  ✅ COMBO 累积到两位数 — combo=55
  ✅ WPM > 0 — wpm=885
  ✅ 虚拟键盘跟随光标移动 — 高亮=a 光标=a

【4】皮肤 / 词库 / 音效（下拉内操作）
  ✅ 切换到「专注 IDE」
  ✅ 切换到「墨水屏」
  ✅ 切换到「黑客荧光」
  ✅ 词库下拉 8 本齐全（含考研/托福库）
  ✅ 词库下拉含导入词库入口
  ✅ 切到 CET-4 后正常出题
  ✅ 音效开关可切换

【5】本地持久化
  ✅ 刷新后仍是 CET-4

【6】拼写模式
  ✅ 拼写模式正常出词 — 词=constant
  ✅ 字母被遮罩成占位符 — 实际显示=········
  ✅ 拼错会标红
  ✅ Backspace 可删除错字母
  ✅ 拼错 120ms 时红闪仍在（用例前置条件成立）
  ✅ 拼错后不退格继续敲对 → 红闪即时消退（<120ms，非 280ms 定时器兜底） — 敲对后 16ms 消退；漏抄修复时应 ≈160ms
  ✅ 拼写正确后进入下一词

【7】限时模式
  ✅ 倒计时出现并递减 — 读数=⏱ 59s

【8】通关结算
  ✅ 20 词后弹出结算面板
  ✅ 结算含正确率/速度/用时/最高连击
  ✅ 结算显示今日累计

【8.5】发音与数据分析
  ✅ 单词发音按钮存在
  ✅ 自动发音开关存在（下拉内）
  ✅ 自动发音可切换 — 🔇 自动发音 → 🔊 自动发音
  ✅ 数据面板可打开
  ✅ 数据面板显示累计击键/总正确率
  ✅ 数据面板含易错键模块
  ✅ 弱项专攻按钮存在
  ✅ 弱项专攻可出题

【9】背单词模块
  ✅ 背单词卡片出现
  ✅ 打字相关 UI 已隐藏
  ✅ 发音按钮存在
  ✅ 翻面显示释义
  ✅ 三键齐全
  ✅ 不认识的词追加 2 次到队尾 — 本组进度：0/20 → 本组进度：1/22
  ✅ 全部完成后出现结算卡
  ✅ 结算含今日新学/复习/已掌握
  ✅ 刷新后背单词进度仍在（localStorage ≥20 词） — 记录数=20
  ✅ 刷新后背单词页可继续学（新卡组或已学完提示）

【10】中英双语切换
  ✅ en 即时生效
  ✅ en 模式无中文导航残留
  ✅ en 刷新保持

【11】移动端视口
  ✅ 移动端无横向溢出 — 溢出=0px

【11.5】命令面板（Esc + : 命令）
  ✅ Esc 打开命令面板
  ✅ 命令态打字引擎不吞键（字母进输入框） — 输入=hello
  ✅ Esc 关闭命令面板
  ✅ :typing 跳回打字页签
  ✅ :help 列出全部命令
  ✅ :theme ide 主题切换生效
  ✅ :mode spell 生效（mode-spell 存在 + 默写提示出现）
  ✅ 下拉打开时 Esc 不误开命令面板
  ✅ :bank 列出全部词库
  ✅ :bank 2 切到云原生词库
  ✅ 预置：已敲对 1 个字母
  ✅ :q 重开本轮（进度归零）
  ✅ 未知命令红字提示

【11.6】背单词键盘流（Space / 1 / 2 / 3 / Enter）
  ✅ :memorize 跳背单词页签
  ✅ Space 翻面显示释义
  ✅ 翻面后按键提示切换为打分
  ✅ 按 3 打分推进且追加 2 次 — 本组进度：1/22
  ✅ 按 1 认识推进 — 本组进度：2/22
  ✅ 按 2 模糊推进且追加 1 次 — 本组进度：3/23
  ✅ 纯键盘清完整组出现结算卡
  ✅ 勋章横幅渲染（今日修行完成 + 打卡天数）
  ✅ Enter 再来一组

【13】代码模式与发音增强
  ✅ :voice en-GB 切换生效（localStorage gt.voice）
  ✅ 刷新后 voice 偏好保持 en-GB
  ✅ :voice 非法参数红字提示
  ✅ :bank ts-code 切到 TS 骨架代码
  ✅ 练习下拉含 mode-code 项
  ✅ 下拉打开时 Esc 不误开命令面板
  ✅ 代码行原样渲染（首行 = useState 骨架行） — 行=const [state, setState] = useState(initialState);
  ✅ code 模式隐藏发音按钮
  ✅ 代码前缀输入推进（大小写敏感命中 10 字符）
  ✅ 未敲空格渲染为弱灰 ·
  ✅ 光标落在小写字母 t — 光标=t
  ✅ 大写 T 敲错被拦（正确数不变、光标不动）
  ✅ 代码行敲完自动切下一行
  ✅ 背单词卡片出现
  ✅ 按键提示含「K 重读」
  ✅ K 键重读无报错（卡片仍在）
  ✅ Space 翻面显示释义（翻面自动发音不报错）
  ✅ :typing 回打字页签，code 模式发音按钮仍隐藏

【14】错题本 + 命令面板模糊匹配
  ✅ 预置：跳到背单词页签
  ✅ 打开面板即常显列表，:t 过滤命中 theme/typing/soundtheme
  ✅ :t 不命中 bank 等无关命令
  ✅ 前缀命中排前面（默认选中 theme）
  ✅ ↓ 移动选中到 typing
  ✅ Tab 补全命令名进输入框
  ✅ Enter 执行选中命令（跳打字页签）
  ✅ :vo 回车补全 :voice+空格（不误执行、面板仍在）
  ✅ 补全后继续输参数执行生效
  ✅ 预置：classic 出词 — 词=abandon
  ✅ 敲错的词入库（wrongCount=1、间隔归 0、明天到期） — {"wrongCount":1,"correctStreak":0,"lastWrongAt":1790827766288,"nextReviewAt":1790906485537.953,"intervalIdx":0}
  ✅ 练习下拉含错题复习项，无到期时置灰
  ✅ StatsPanel 错题统计：总数 1 / 今日到期 1
  ✅ StatsPanel 含开始错题复习按钮
  ✅ :review 出现在命令列表
  ✅ :review 开复习轮且首词即到期词 — 首词=absolute
  ✅ 复习全对间隔推进（intervalIdx 0→1、nextReviewAt 顺延） — {"wrongCount":1,"correctStreak":1,"lastWrongAt":1790654967170,"nextReviewAt":1790993033214.254,"intervalIdx":1}
  ✅ 无到期时 :review 提示不开轮
  ✅ 毕业候选被拉进复习轮
  ✅ 走完 15 天间隔毕业移除条目 — 剩余=["content:word:ecdict-cet4:absolute"]

【15】考研/托福词库（懒加载分包）
  ✅ 下拉含考研条目且词数 3000
  ✅ 下拉含托福条目且词数 3000
  ✅ :bank kaoyan 切到考研词库
  ✅ 考研词库懒加载后正常出词 — 词=eagle
  ✅ 考研词库打字推进到下一词 — 下一词=pearl
  ✅ 考研词敲错入库（懒词库下错题本可用） — {"wrongCount":1,"correctStreak":0,"lastWrongAt":1790827776422,"nextReviewAt":1790905723095.573,"intervalIdx":0}
  ✅ 懒词库下 :review 拉出到期考研词 — 首词=overpass

【13】批8：Jitter 抗雪崩 + Quota 熔断
  ✅ recordWrong Jitter：1d 档落在 [0.85d, 1.15d] 窗口 — 漂移=0.905d
  ✅ 复习轮首词为注入的到期词 — 首词=overpass
  ✅ recordCorrect Jitter：2d 档落在 [1.8d, 2.2d] 窗口 — 漂移=1.869d
  ✅ 无释义的合成词不再靠空释义占位开轮：练习轮未被替换 — 命令已执行=true；轮首词 eagle → eagle
  ✅ 对照组：换成真实到期词立刻能开轮（证明上面「不开轮」源于未命中，而非复习入口整体失效） — 命令已执行=true；首词=overpass
  ✅ Quota 熔断：清洗重试后条目最终写入 — total=3
  ✅ Quota 熔断：清洗发生（条目数 < 7） — total=3
  ✅ Quota 熔断：无未捕获异常
  ✅ Quota 熔断：console.warn 可观测清洗行为
  ✅ Quota 全失败：UI 不受影响照常推进（内存态兜底） — 本组进度：1/22 → 本组进度：2/24
  ✅ Quota 全失败：无未捕获异常
  ✅ Quota 全失败：放弃写入有 warn

【14】批8：移动端手势 / 命令面板 / 预热
  ✅ 手势：未翻面点击卡片 → 翻面
  ✅ 移动端提示：翻面态显示滑动手势文案
  ✅ 手势：已翻面右滑 → 认识（进度推进） — 本组进度：0/20 → 本组进度：1/20
  ✅ 手势：左滑 → 不认识（队列追加 2） — 本组进度：2/22
  ✅ 手势：上滑 → 模糊（队列追加 1） — 本组进度：3/23
  ✅ 手势：下滑无效（回弹不打分）
  ✅ 手势：未翻面左右滑无效（不翻面）
  ✅ 移动端提示：未翻面态显示点击/上滑文案
  ✅ 手势：命令态下不响应（tap 不翻面）
  ✅ 移动端：open-cmd 打开命令面板
  ✅ 移动端：命令输入框字号 ≥16px（防 iOS 聚焦缩放） — 16px
  ✅ 移动端：:theme ide 生效
  ✅ 手势/移动端：无 console error
  ✅ 预热探针：SW 缓存含 ielts/kaoyan/toefl chunk — words-2QG2Fjtl.js, words-uy6NfwIr.js, words-CZ5ER7rC.js

【16】V3-P0a：五页签 IA / 今日推荐 / Review / Progress
  ✅ 默认进入 Home（HomePanel 渲染、打字面板不渲染、页签栏 5 项齐全）
  ✅ Home 组合：内容目录汇总渲染（18 词库 · 9388 词，复用 nav.banks / bank.wordsUnit，零新键） — text=18 词库 · 9388 词
  ✅ Daily Goal 进度条渲染（30/50 → 60%）+ streak 3 天 — style=width: 60%;
  ✅ 复习卡空态（空态文案 + 无开始按钮）
  ✅ 复习卡有态（1 个单词到期 + abandon 预览） — 到期复习1 个单词到期abandon开始复习
  ✅ 复习卡点击开复习轮（首词=到期词 abandon）
  ✅ 弱项卡空态（暂无弱项数据）
  ✅ 弱项卡展示 top 弱字母（q 90%） — 弱项专攻q 90%z 71%弱项专攻
  ✅ 弱项专攻点击开轮出词 — 词=adequate
  ✅ 新词卡（四级 CET-4 · 84 词）并可一键开轮 — 新词练习四级 CET-4 · 84 词开始练习
  ✅ Review 统计：错题总数 2 / 今日到期 2
  ✅ 掌握分布渲染 + 徽章两态（struggling / strong） — 挣扎中 1巩固 1
  ✅ 词条详情展开（音标 + 释义 + 个人进度 + 下次复习） — abandonə'bændən放弃；抛弃n. the trait of lacking restraint or control; reckless freed
  ✅ 单挑按钮开轮（切到打字页、首词=absolute）
  ✅ Review 置顶「开始复习」主按钮开轮（首词=到期词） — 按钮=true 首词=abandon
  ✅ Progress 热力图 14 格 + 累计统计卡
  ✅ Progress 弱字母/错词列表渲染
  ✅ :home / :progress 命令跳页
  ✅ V3-P0a 章节：无 console / page 运行时错误

【12】运行时报错
  ✅ 无 console / page 运行时错误

──────────────────────────────────────────────────────
共 170 项，通过 170，失败 0
──────────────────────────────────────────────────────
```

**EXIT=0**

## test:content

```
$ npm run test:content

> geek-typing@0.0.0 test:content
> node tests/content-query.mjs


【1】registry 契约
  ✅ 注册 10 个 vocabulary 包 — ai-core,cloud-native,frontend,cet4,cet6,ielts,kaoyan,toefl,ts-code,go-code
  ✅ 全库 Σitems = 契约基准（词数变化必须显式确认） — 9346 vs 9346
  ✅ getPackage 支持裸 id
  ✅ getPackage 支持 4 段式 ContentId
  ✅ getPackage 未知 id 返回 undefined
  ✅ listContent("vocabulary") 返回全部 manifest
  ✅ listContent("listening") 返回 1 个结构探针包（B-2 已接入）
  ✅ hasFeature 未知 feature 为 false 且不崩溃
  ✅ getRelations 恒为数组（关系模型就位、无数据）
  ✅ getPackage 支持「来源族-包」namespace 反查

【2】ContentId 规范（V4.1 4 段式 + namespace 每包唯一）
  ✅ ielts 包 id 为 content:vocabulary:ecdict-ielts:ielts — content:vocabulary:ecdict-ielts:ielts
  ✅ parseContentId 可逆解析
  ✅ wordId 保留原词形（与 buildHits 同源，禁止在 id 侧 lowercase）
  ✅ wordId 与 buildHits 生成口径一致（大写词不分歧）
  ✅ 非法 ContentId 解析为 null
  ✅ 10 个包 namespace 两两不同（词级 id 唯一性前提） — curated-ai-core,curated-cloud-native,curated-frontend,ecdict-cet4,ecdict-cet6,ecdict-ielts,ecdict-kaoyan,ecdict-toefl,curated-ts-code,curated-go-code

【3】加载缓存共享（兼容层与查询层同一份数据）
  ✅ 重复 loadPackage 返回同一引用（单份内存）
  ✅ ielts 实际词条数 = manifest.stats.items — 3000

【4】countWords
  ✅ countWords() 全库合计 = manifest 真值 — 9346 vs 9346
  ✅ countWords("ielts") = 3000

【5】searchWords
  ✅ 跨包检索 abandon 有多条来源 — cet4,toefl,ielts
  ✅ 精确命中 ContentId 落在自身包 namespace 下 — content:word:ecdict-cet4:abandon
  ✅ 跨包同词各自不同 ContentId（全局唯一） — 3 条命中 3 个 id
  ✅ 每条命中带包上下文
  ✅ 限定包检索只返回该包
  ✅ packageId 支持 4 段式
  ✅ 精确优先：首位为词形全等命中
  ✅ exact=true 不返回前缀命中 — 0
  ✅ exact=false 返回前缀命中 — abandon
  ✅ 空查询返回空数组
  ✅ limit 生效
  ✅ 中文按释义/翻译命中 — abandon=放弃；抛弃

【6】getWord（Word Detail 前置接口）
  ✅ 按 ContentId 取到词条 — content:word:ecdict-ielts:abbreviation → abbreviation
  ✅ 词条带翻译 — n. 缩写词, 缩写, 缩短, 节略
  ✅ 词条唯一归属 ielts 包 — content:vocabulary:ecdict-ielts:ielts
  ✅ 跨包同词 "considerate" 各自可寻址且归属不同包 — ielts / cet4
  ✅ 不存在的词返回 null
  ✅ 错误 type 返回 null
  ✅ 非 ContentId 返回 null

【7】listWords（分页 + 过滤）
  ✅ 第 1 页 10 条
  ✅ 第 2 页与第 1 页无交集
  ✅ id 落在包 namespace 内
  ✅ 未知包返回空数组
  ✅ hasPhonetic 过滤生效 — 84 条带音标

【8】contentQuery 统一 API
  ✅ contentQuery 暴露 search/list/get/count
  ✅ search({type:"word"}) 与 searchWords 结果一致 — 3 条
  ✅ type:'all' 包含 word 与 reading 两族结果（id 集合包含关系，不比长度） — word=53 reading=1 all=54
  ✅ type:'listening'（仍未放开）返回空数组
  ✅ search 默认 type 为 word
  ✅ search 精确排序保持：首位为词形全等 — abandon
  ✅ search 支持 4 段式 packageId
  ✅ contentQuery.get(contentId) 命中 — content:word:ecdict-ielts:abbreviation
  ✅ contentQuery.get 未放开类型返回 null
  ✅ contentQuery.get(reading ContentId) 命中且 type/itemId 正确（P18-E 放开） — content:reading:demo-demo-reading-01:reading-item-01
  ✅ contentQuery.get 非法 id 返回 null
  ✅ count({type:"word"}) = 全库合计 — 9346 vs 9346
  ✅ count({type:"listening"}) = 0
  ✅ count({packageId:"ielts"}) = 3000
  ✅ count({tags:["ielts"]}) = 3000
  ✅ list 分页生效（page1/page2 各 5 条且无交集）
  ✅ list tags 过滤生效 — 5 条
  ✅ list 未知 tag 返回空
  ✅ list 未知包返回空
  ✅ list 未放开类型返回空
  ✅ list hasPhonetic 过滤生效 — 0/43

【9】Catalog + Content Index
  ✅ catalog.types vocabulary = 10 包 — 10
  ✅ catalog.types vocabulary items = manifest 真值 — 9346 vs 9346
  ✅ catalog 已接入 listening（B-2 结构探针包，真实数字） — listening packages=1 items=6
  ✅ catalog 已接入 audio/reading/topic/exercise/writing/speaking/collection（B-2 各 1 探针包，真实数字） — audio=1p/5i reading=1p/6i topic=1p/5i exercise=1p/5i writing=1p/5i speaking=1p/5i collection=1p/5i
  ✅ catalog.totalItems = 全类型 manifest 真值合计 — 9388 vs 9388
  ✅ catalog.packages 覆盖 18 个包（10 vocabulary + 8 探针/组合） — 18
  ✅ catalog.schemaVersion 为数字 — 4
  ✅ getPackageCatalog("ielts") 字段正确 — {"localId":"ielts","contentId":"content:vocabulary:ecdict-ielts:ielts","title":"雅思核心 IELTS","type":"vocabulary","items":3000,"tags":["ielts","vocabulary"],"features":["phonetic","definition"],"offline":"lazy"}
  ✅ getPackageCatalog 未知 id 返回 null
  ✅ getCatalog 不加载词条（只读 manifest）
  ✅ ensureIndex() 后 entries = 全库（含 demo 包）合计 — 9388 vs 9388
  ✅ ensureIndex() 后 packages = 注册包数（省略参数 = 覆盖全库） — 18 vs 18
  ✅ ensureIndex 幂等（二次调用 entries 不变）
  ✅ byWord 收录词条的归一化 key — abbreviation
  ✅ byWord 归一：大写 / 首尾空格落到同一 key
  ✅ byPackage 按包聚合
  ✅ byTag 收录包级 tag
  ✅ invalidateIndex("ielts") 后 entries 降该包 items 数 — 6388 vs 6388
  ✅ invalidateIndex("ielts") 后 packages = 注册包数 - 1 — 17 vs 17
  ✅ 失效后 byPackage 不再含 ielts
  ✅ 失效后 byWord 不再含 ielts 词条
  ✅ 失效后 byTag 不再含 ielts 词条
  ✅ 重新 ensureIndex 恢复全量 — 9388 vs 9388
  ✅ 重建后 byWord 恢复 ielts 词条
  ✅ invalidateIndex() 全清
  ✅ ensureIndex(["ielts"]) 只建目标包
  ✅ 查询在部分索引下仍可用
  ✅ findByPackage("cet4") 与 byPackage 表一致 — 84 vs 84
  ✅ idsByPackage("cet4") 与 byPackage 表逐 id 一致
  ✅ findById(id) 命中同一对象（与 byId 引用相等） — content:word:ecdict-ielts:abbreviation
  ✅ findById 未知 id 返回 null
  ✅ findByWord 与 byWord 表一致 — abbreviation
  ✅ findByWord 未知词形返回空数组
  ✅ findByNamespace("ecdict-cet4") 命中 cet4 全包 — 84
  ✅ findByNamespace 未知 namespace 返回空数组
  ✅ findByTag("code") 与 byTag 表一致 — 100

【10】id 自洽性（生成侧 vs 寻址侧大小写口径）
   —— V4.1-P0.5 独立复核实测捕获：id 生成保留原词形大小写，若 get 用 lowercase 反查，
      9346 条里 93 条会「search 查得到、get 取不回」（go-code 41/50、ts-code 34/50）
  ✅ 全库 9346 条 id 均可按自身 id 取回（get ⇄ list 自洽） — 零漏取
  ✅ ts-code（大小写敏感）50 条全部可按自身 id 取回 — 漏 0
  ✅ go-code（大小写敏感）50 条全部可按自身 id 取回 — 漏 0
  ✅ ielts（大小写敏感）3000 条全部可按自身 id 取回 — 漏 0
  ✅ 大写词条按自身 id 命中（Oxford） — content:word:ecdict-ielts:Oxford
  ✅ lowercase id 走兜底仍可命中（兼容历史/手写 id）

【11】Query Scope（首页 / 搜索页 / 词库页 / Detail / 收藏页共用一套作用域）
  ✅ scope{type,packageId} 与平铺 packageId 结果一致 — 1 条：ielts
  ✅ scope.namespace:'ecdict-ielts' 只命中 ielts — 3000 条
  ✅ scope.tags:['code'] 命中 ts-code + go-code = 100 — 100 条 / go-code,ts-code
  ✅ 平铺参数覆盖 scope（packageId:cet4 胜出） — 84 条 / cet4
  ✅ count({scope:{namespace:'curated-ai-core'}}) = 43
  ✅ 空 scope 视为全库（缺省 = 无过滤） — 9346
  ✅ scope 未知包返回空

【12】Search Sort 契约（deterministic ⇒ 翻页不重不漏）
  ✅ sort:"word" 前 20 条按词形非降序 — abbreviation,abnormal,abolish,aboriginal,abort
  ✅ sort:"word" 前 20 条原始词形亦非降序（该区间无大小写混排）
  ✅ deterministic：同一 query 连续两次 id 序列完全相同 — 1000 条
  ✅ 分页不重不漏：page1..10 拼接 === pageSize:1000 一次取回的前 100 条
  ✅ 默认 sort 为 relevance：精确命中排在最前且不与其它组混排 — 1 条精确命中 / 共 3 条
  ✅ sort:"relevance" 显式与默认一致
  ✅ sort:"updated" 不报错、条数正确、顺序 deterministic（当前退化为包内数据顺序） — 84 条
  ✅ sort:{field:'word',order:'desc'} 降序生效 — zoology,zoo,zest,zero,youngster
  ✅ desc 顺序同样 deterministic，且与 asc 命中同一集合（翻页不漏项） — 3000 条双向一致
  ✅ sort:{field:'updated',order:'desc'} 不报错且条数不变 — 84 条

【13】ContentSnapshot 契约（V4.1-P0.6：哪个实体的哪个快照）
  ✅ snapshotOf 字段齐全（contentId/contentVersion/checksum/publishedAt 对得上） — {"contentId":"content:vocabulary:ecdict-cet4:cet4","contentVersion":7,"checksum":"sha256:aaa","schemaVersion":4,"publishedAt":"2026-09-26"}
  ✅ snapshotOf 带出 schemaVersion — schemaVersion=4
  ✅ snapshotOf 省略 publishedAt 时结果不含该键 — contentId,contentVersion,checksum,schemaVersion
  ✅ snapshotOf publishedAt 显式 undefined 时同样不含该键
  ✅ schemaVersion 省略时取 SCHEMA_VERSION 常量
  ✅ schemaVersion 为正整数且两次省略调用结果相同 — 4
  ✅ schemaVersion 可显式指定（覆盖常量）
  ✅ isSameSnapshot 同一对象 → true
  ✅ isSameSnapshot 内容完全相同的两份 → true
  ✅ isSameSnapshot checksum 不同 → false
  ✅ isSameSnapshot contentVersion 不同 → false
  ✅ isSameSnapshot contentId 不同 → false
  ✅ isSameSnapshot 仅 version+checksum 同但 contentId 不同 → false（不能只比 version/checksum）
  ✅ isSameSnapshot 任一侧为 null/undefined → false（宁可重学也不误判相同）
  ✅ findRevision 同一 checksum 出现两次 → 返回 revision 最大的那条（倒序扫描） — {"revision":3,"version":1,"checksum":"sha256:X","publishedAt":"2026-01-01"}
  ✅ findRevision 结果与正序第一条不同（证明口径不再是「首条命中」） — 倒序=3 / 正序=1
  ✅ findRevision 多条 history 中命中唯一 checksum 的条目
  ✅ findRevision 单条正常命中
  ✅ findRevision 空 history → null
  ✅ findRevision 非数组 history → null
  ✅ findRevision 无匹配 → null
  ✅ findRevision 空字符串 checksum → null
  ✅ cet4 manifest 已写入版本三元组（读不到即 FAIL，不跳过） — revision=2 version=2
  ✅ findRevision(cet4 history, contentChecksum).version === manifest.contentVersion — 2 vs 2
  ✅ findRevision(cet4 history, contentChecksum).revision === manifest.contentRevision — 2 vs 2
  ✅ cet4 contentHistory 按 revision 升序追加（findRevision 倒序扫描的前提） — 1,2

【14】queryWord —— UI 唯一需要的单条寻址入口
  ✅ 命中：返回 WordHit，id = content:word:<namespace>:<原词形> — content:word:ecdict-cet4:abandon
  ✅ 命中：translation 非空（证明拿到的不是「空释义占位对象」） — 放弃；抛弃
  ✅ 未命中：**严格返回 null**（不是空词条对象）—— 这是消灭静默空释义的前提 — got=null
  ✅ 对照组：换个存在的词立刻非 null（证明上面的 null 来自未命中，而非恒返回 null） — w=absolute
  ✅ 包不存在：返回 null 而不抛异常（C-5 口径：非法 id 返回 null，不抛）
  ✅ 空词形 / 纯空白：返回 null
  ✅ queryWord 与 getWord 口径一致（同一 id、同一 word、同一 translation） — content:word:ecdict-cet4:abandon === content:word:ecdict-cet4:abandon
  ✅ 大小写①：原词形精确命中（保留大写） — Oxford
  ✅ 大小写②：传 lowercase 仍命中同一 ContentId（norm 兜底生效） — content:word:ecdict-ielts:Oxford
  ✅ 大小写③：传全大写同样命中 — content:word:ecdict-ielts:Oxford
  ✅ 对照组：仓库里确实存在 lazy 包（否则下一条结论无意义） — ielts,kaoyan,toefl
  ✅ lazy 包 ielts：queryWord 结果与 loadPackage 数据一致（懒加载自证见 queryword-lazy.mjs） — eagle
  ✅ 二次调用：结果逐字节相同（索引缓存不改变语义）
  ✅ 已挂进 contentQuery 聚合导出（设计文档 §4.2 第 5 条）

【15】P18-E reading 放开（启用集 / 包路由 / 索引 / 结果形状）
  ✅ count({type:'reading'}) = reading 包 stats.items(6) — 6 vs 6
  ✅ list({type:'reading'}) 非空且每条 type='reading' / 归属 demo-reading-01 / title 为 string — 6 条
  ✅ list({type:'reading', hasPhonetic:true}) == list({type:'reading'})（非 word 族不参与音标筛选） — 6 vs 6
  ✅ count({type:'reading', hasPhonetic:true}) = readingItems（count 与 list 同源）
  ✅ list({type:'reading', sort:{field:'word',order:'desc'}}) == list({type:'reading'})（词形主序对非 word 族中性） — desc=reading-item-05,reading-item-02,reading-item-03,reading-item-04,reading-item-06,reading-item-01 / 默认=reading-item-05,reading-item-02,reading-item-03,reading-item-04,reading-item-06,reading-item-01
  ✅ list({type:'word', packageId:'demo-reading-01'}) = [] 且 count = 0（异族包被滤掉）
  ✅ list({type:'reading', packageId:'ielts'}) = []（反向同样不外溢）
  ✅ search({type:'reading', query:'tea'}) 非空且全部 type='reading' — 1 条：reading-item-01
  ✅ search({type:'reading', query:'zzz-not-present'}) = []
  ✅ search({type:'reading', query:'reading-item-02', exact:true}) 命中该条目（index.exact 走 id） — 1 条
  ✅ list({type:"reading",pageSize:2}) 两次调用 id 序列完全一致 — content:reading:demo-demo-reading-01:reading-item-05|content:reading:demo-demo-reading-01:reading-item-02
  ✅ page1 / page2 无交集 — 2/2
  ✅ index.byWord 不含任何 'content:reading:' 开头的 id（非 word 族不进倒排表） — byWord 共 9346 项
  ✅ 对照组：index.byId 含 reading 条目（证明索引确实覆盖 reading，上条非空转） — 6
  ✅ get(条目自身 ContentId) 命中同一条，且 parseContentId 解析出的 type = reading — content:reading:demo-demo-reading-01:reading-item-05

──────────────────────────────────────────────────────
共 179 项，通过 179，失败 0
──────────────────────────────────────────────────────
```

**EXIT=0**

## test:learning

```
$ npm run test:learning

> geek-typing@0.0.0 test:learning
> node tests/learning-model.mjs

==========================================================================
P1.5 · G2 门禁：Learning 数据模型
==========================================================================

内容真值：6713 个不同 word / 9346 条记录 / 10 包
source    synthetic
detail    合成数据（形状真实：键口径同真实 store）resolved=12 ambiguous=9 orphan=3 caseConflict=1 invalid=5 为**故意注入**

迁移三档：resolved=12 ambiguous=9 orphan=5 caseConflict=1 invalid=5

【G2-1】gt.learning.v2 顶层形状
  ✅ 所有 key 是合法 ContentId 或 legacy:* — content:*=12 legacy:*=15
  ✅ 所有 content:* 的 contentId 与 key 逐字符一致
  ✅ review.intervalIdx 是 0..4 整数
  ✅ memorize.status 是合法枚举
  ✅ content:* 记录都有 freshness
  ✅ legacy:* 记录 freshness 恒为 unknown
  ✅ legacy:* 记录不含 contentId（无归属是定义）

【G2-2】letters 与全局聚合必须拆出去
  ✅ gt.learning.v2 的 value 里不含 letters/totalKeys/totalCorrect/totalWords/bestWpm — leaked=0
  ✅ gt.letterStats.v1 被产出（含 letters 表） — letters 键数=26
  ✅ gt.totals.v1 被产出（4 个标量） — {"totalKeys":51234,"totalCorrect":48120,"totalWords":25,"bestWpm":92}
  ✅ letters 原样搬运（键名与值均不变） — 26 个字母
  ✅ 全局 4 标量原样搬运 — totalKeys=51234 bestWpm=92

【G2-3】legacy:* 记录自描述
  ✅ legacy:unattributed:* 的 candidates 是长度 >=2 的合法 ContentId 数组 — 9 条，违规 0 条
  ✅ legacy:unattributed:* 的 tier === "ambiguous"
  ✅ legacy:orphan:* 的 reason === "not-in-current-vocabulary" — 5 条
  ✅ legacy:orphan:* 的 tier === "orphan"
  ✅ tiers.ambiguous 与 legacy:unattributed:* 键数自洽 — 9 vs 9
  ✅ tiers.orphan 与 legacy:orphan:* 键数自洽 — 5 vs 5
  ✅ tiers.caseConflict 与 legacy:case-conflict:* 键数自洽 — 1 vs 1

【G2-4】judgeFreshness 真值表
  ✅ unknown（legacy 记录，无版本三元组） — got=unknown want=unknown
  ✅ drifted(no-manifest)（包已不存在） — got=drifted want=drifted
  ✅ drifted(checksum-mismatch)（内容实质变了） — got=drifted want=drifted
  ✅ stale(version-behind)（契约号过期但内容没变） — got=stale want=stale
  ✅ ok（完全一致） — got=ok want=ok

【附加】migrateV1toV2 纯函数性
  ✅ 在无 localStorage 环境下可调用（零 I/O） — 相同输入产出逐字节相同的 next

──────────────────────────────────────────────────────────────────────────
共 25 项，通过 25，失败 0
──────────────────────────────────────────────────────────────────────────

⚠️  source=synthetic：本次门禁用的是**合成数据**，不代表真实用户数据。
    三条 legacy 分支（orphan / ambiguous / caseConflict）与 invalid 都是**故意注入**的，
    目的是证明这些分支在实现里**可达**、且产出的记录形状正确。
    退出码降级为 EXIT=0。
    要按真实数据判定：--user-store=<真实旧快照.json>
    要让合成数据也按严格判定（用于结构自检）：--allow-synthetic
```

**EXIT=0**

## test:offline

```
$ npm run test:offline

> geek-typing@0.0.0 test:offline
> node tests/offline-audit.mjs

🚀 vite preview 已就绪（127.0.0.1:4174，pid 23268）
🌐 浏览器：C:\Program Files\Google\Chrome\Application\chrome.exe
🎯 目标：http://127.0.0.1:4174（缓存 gt-shell-v3）

【态1】在线首访：SW 注册与激活
  ✅ 态1: navigator.serviceWorker.ready 且 active — http://127.0.0.1:4174/sw.js
  ✅ 态1: SW 已接管页面（controller）

【态1.5】在线 reload：SW 接管下的在线导航
  ✅ 态1.5: reload 后落在 Home（推荐首页渲染）
  ✅ 态1.5: SW 接管后在线 reload 成功（切 typing 后练习面板可见）

【态2】断网 reload：离线导航与打字核心
  ✅ 态2: 断网导航 reload 成功（无 ERR_FAILED）
  ✅ 态2: 断网 reload 后落在 Home（推荐首页渲染）
  ✅ 态2: 主 UI 渲染（练习单词面板可见） — word 面板数=1
  ✅ 态2: 词库选择/统计栏可见（非空白错误页） — bodyLen=264 进度=true 正确率=true
  ✅ 态2: 可读出当前单词 — 单词=pipeline
  ✅ 态2: 断网下敲正确字母光标前进 — 下标 0 → 3（期望 3；单词=pipeline）

【态3】断网功能完整性：背单词键盘流
  ✅ 态3: 背单词卡片出现
  ✅ 态3: Space 翻面显示释义
  ✅ 态3: 打分键推进进度 — 本组进度：1/20
  ✅ 态3: 无新增 console error

【态4】缓存探针：无 redirected 毒条目 + 无 MIME 不匹配条目
  ✅ 态4: 缓存 gt-shell-v3 存在 — caches=[gt-shell-v3]
  ✅ 态4: 全部条目无 redirected=true 毒条目 — 12 条全部干净
  ✅ 态4: /index.html 或 / 已缓存
    · [200] redirected=false /index.html (text/html;charset=utf-8)
    · [200] redirected=false /icons.svg (image/svg+xml)
    · [200] redirected=false /icon-192.png (image/png)
    · [200] redirected=false /icon-512.png (image/png)
    · [200] redirected=false /assets/index-BWml2sHn.js (text/javascript)
    · [200] redirected=false /assets/index-BY9zjKPL.css (text/css)
    · [200] redirected=false /manifest.webmanifest (application/manifest+json)
    · [200] redirected=false /assets/words-2QG2Fjtl.js (text/javascript)
    · [200] redirected=false /assets/words-CZ5ER7rC.js (text/javascript)
    · [200] redirected=false /assets/words-uy6NfwIr.js (text/javascript)
    · [200] redirected=false / (text/html)
    · [200] redirected=false /favicon.svg (image/svg+xml)

【态4b】MIME 投毒探针：伪造软 404，断言 SW 拒绝缓存（主动注入）
  ✅ 态4b: 软 404 注入已生效（路由拦截命中） — trap=/assets/__gt-trap-soft404.js
  ✅ 态4b: SW 未把 text/html 写入 /assets/*.js 缓存 — 未缓存（正确拒绝）
  ✅ 态4b: SW 未把 HTML 交给页面（返回 5xx 或抛错，而非 200 HTML） — status=5xx/threw pageGotHtml=false

========== 离线审计总结 ==========
结论：✅ 全部通过
📄 证据：tests/_evidence/offline-audit-result.json
```

**EXIT=0**

## release:gate

```
$ node scripts/verify-release-gate.mjs
======================================================================
 P1.8 RELEASE GATE — 分层机器判定（verify-release-gate.mjs）
 合同①：docs/audit-package/13-acceptance/P1.5-RELEASE-GATE.md —— P1.5 历史冻结基线（只读 · INV-1 禁改）
 合同②：docs/p18/P1.8-RELEASE-GATE-CONTRACT.md                —— P1.8 增量合同（本阶段新增）
 分层原因：P1.5 判据派生自冻结区 md（禁改），P1.8 又要求「新增门进入 release:gate」
           → 冻结基线只读 + 增量合同叠加，校验器同时读两份、分层报告。
======================================================================

【合同① P1.5（历史冻结基线 · 只读 · INV-1 禁改）】
Unit       判据  PASS  FAIL  PENDING   总览声明(行)      一致
G1         5     5     0     0        5/0/0            ✅
G2         4     4     0     0        4/0/0            ✅
G3         6     6     0     0        6/0/0            ✅
G4         5     5     0     0        5/0/0            ✅
G5         4     4     0     0        4/0/0            ✅
G6         5     5     0     0        5/0/0            ✅
R1         1     1     0     0        1/0/0            ✅
R2         1     1     0     0        1/0/0            ✅
R3         1     1     0     0        1/0/0            ✅
R4         1     1     0     0        1/0/0            ✅
R5         1     1     0     0        1/0/0            ✅
R6         1     1     0     0        1/0/0            ✅
──────────────────────────────────────────────────────────────────────
  层一 CODE/ARCHITECTURE GATE：29 项 —— 29 PASS / 0 FAIL / 0 PENDING → 🟢 ENGINEERING READY
  层二 PRODUCT RELEASE GATE：6 项 —— 6 PASS / 0 FAIL / 0 PENDING → 🟢 RELEASE READY

【合同② P1.8（增量合同）】
Unit       判据  PASS  FAIL  PENDING   总览声明(行)      一致
P18-G1     1     1     0     0        1/0/0            ✅
P18-G2     1     1     0     0        1/0/0            ✅
P18-G3     1     1     0     0        1/0/0            ✅
P18-G4     1     1     0     0        1/0/0            ✅
P18-G5     1     1     0     0        1/0/0            ✅
P18-G6     1     1     0     0        1/0/0            ✅
P18-R1     1     1     0     0        1/0/0            ✅
P18-R2     1     1     0     0        1/0/0            ✅
──────────────────────────────────────────────────────────────────────
  P1.8 工程门 P18-G*（P1.8 六条不变量）：6 项 —— 6 PASS / 0 FAIL / 0 PENDING → 🟢 INVARIANTS READY
  P1.8 阶段发布门 P1.8-R*：2 项 —— 2 PASS / 0 FAIL / 0 PENDING → 🟢 PHASE RELEASE READY

======================================================================
总判定：43 项判据 —— 43 PASS / 0 FAIL / 0 PENDING
RELEASE=APPROVED —— 两份合同全绿（P1.5 历史冻结基线 + P1.8 增量合同逐节核实，总览数字机器核对一致）
⚠️ 这只代表门禁合同自洽；发布前仍需：未提交改动清点（git status）+ FINAL-TEST-OUTPUT 全量复跑留档。
```

**EXIT=0**

## 跑完之后：未提交改动清点（发布门要求的收尾项）

```
$ git status --porcelain
 M tests/_evidence/offline-audit-result.json
?? docs/p18/_generated/review/

$ git log --oneline -1
12de9c9 docs(p18-ci): P18-H CI 证据留档 —— run 36812800054 四 job 全 success（含部署）
```

> 期望：除本审查包自身新增的 `docs/p18/_generated/review/**` 外，**无任何改动**
> —— 尤其 `content/license-policy-1.json` 不得因跑过 content:ingest 而漂移（P18-G2 幂等修复的验收点）。
