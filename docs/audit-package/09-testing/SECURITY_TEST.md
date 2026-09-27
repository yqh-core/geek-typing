# 安全测试（待建）

> 状态：📐 待建
> 已有断言数：**0**
> 实测结论：**`tests/` 与 `scripts/` 下没有任何安全类断言或扫描脚本；同时也没有 CSP**

---

## 1. 实测现状

### 1.1 零安全测试

| 检查项 | 实测 |
|---|---|
| XSS 断言 | 0 |
| 注入断言 | 0 |
| 安全响应头回归断言 | 0 |
| 依赖漏洞扫描（`npm audit` 接入） | 无 |
| SW 安全断言 | 0 |
| CSP 断言 | 0（且无 CSP 可断言） |

### 1.2 现有安全响应头（4 条，实测自 `public/_headers`，共 19 行）

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: SAMEORIGIN
Cross-Origin-Opener-Policy: same-origin
```

外加缓存控制：
- `/assets/*` → `immutable`（一年）
- `/sw.js` → `no-cache`
- `/icons.svg` → `604800`

### 1.3 CSP 实测：不存在

```
$ grep -rn "Content-Security-Policy\|csp" public/_headers index.html vite.config.ts src/
(以上为全部命中)          ← 零命中
```

- `public/_headers` 里**无** `Content-Security-Policy`
- `index.html` 里**无** CSP meta 标签
- `vite.config.ts`（7 行，仅 `plugins: [react()]`）里**无** CSP 注入插件

**CSP 数量 = 0。** 详见 `10-security/SECURITY.md`。

### 1.4 这 4 条头**没有任何断言守着**

即使现有 4 条安全头是正确的，也**没有一个测试**保证它们不被误删或改错。

`tests/prod-smoke.mjs` 的 Part A 检查了 HTTP 指纹（308 跳转、`sw.js` 的 `no-cache`、bundle 的 `immutable`），**但不检查任何安全头**。

---

## 2. "纯静态所以没安全问题"——这个论证的边界

### 2.1 论证成立的部分

- ✅ 无后端 ⇒ 无服务端注入（SQLi、命令注入、SSRF）
- ✅ 无鉴权 ⇒ 无会话劫持、无越权
- ✅ 无文件上传 ⇒ 无 webshell、无路径穿越（**写入方向**）
- ✅ 无用户数据外发 ⇒ 无数据泄露面

### 2.2 论证不成立的部分

审计方需要看到这些**仍然存在的攻击面**：

| # | 面 | 现状 | 风险 |
|---|---|---|---|
| 1 | **无 CSP** | 零实现 | XSS 一旦发生（如未来引入第三方脚本、或 markdown 渲染），无第二道防线 |
| 2 | **自定义词库是自由文本** | 存 localStorage，纯文本 | 渲染路径若用 `innerHTML` ⇒ 存储型 XSS 的**自我感染**面（见 `UPLOAD_SECURITY.md`） |
| 3 | **Service Worker 是高权限实体** | 已实现，cache-first 拦截 `/assets/*` | SW 一旦被污染，可持久化劫持全站（**比传统 XSS 更持久**） |
| 4 | **SW 缓存可被毒化** | `sanitize()` 只处理了 3 类已知静默失败 | `putClean` 的入参校验面未测试 |
| 5 | **供应链** | react / lucide-react / canvas-confetti / vite / tailwind | 无 `npm audit` 接入、无 lockfile 校验流程 |
| 6 | **无 SRI** | 无 `integrity` 属性 | 若未来引入 CDN 脚本，无完整性校验 |
| 7 | **`_headers` 改动无门禁** | 无断言 | 一次误改即可移除 `nosniff` |
| 8 | **跨 origin 处理** | SW `fetch` 里"不符 origin 直接 return" | 这个分支**无断言**，改错了没人发现 |
| 9 | **依赖的 `postMessage` / `BroadcastChannel`** | 若有，无 origin 校验断言 | 未实测确认 |
| 10 | **localStorage 数据被篡改** | 无 schema 校验断言 | 手改 localStorage 可注入任意结构 |

**第 2 与第 3 是最值得关注的**：一个"纯静态无后端"站点，其最强的攻击面恰恰是 **SW（高权限持久化）+ localStorage（用户可控的自由文本）**。

---

## 3. 待建测试方案

### 3.1 安全响应头回归（成本最低、优先做）

在 `tests/prod-smoke.mjs` Part A 加一组断言：

| # | 断言 | 期望 |
|---|---|---|
| H-1 | `/` 返回 `X-Content-Type-Options: nosniff` | 存在且值正确 |
| H-2 | `/` 返回 `Referrer-Policy: strict-origin-when-cross-origin` | 存在且值正确 |
| H-3 | `/` 返回 `X-Frame-Options: SAMEORIGIN` | 存在且值正确 |
| H-4 | `/` 返回 `Cross-Origin-Opener-Policy: same-origin` | 存在且值正确 |
| H-5 | `/assets/*` 返回 `Cache-Control` 含 `immutable` 且 `max-age` ≥ 31536000 | 存在 |
| H-6 | `/sw.js` 返回 `Cache-Control: no-cache` | 存在（**已有断言，见 `prod-smoke.mjs` A2**） |

**H-6 已被覆盖**（`tests/prod-smoke.mjs` A2 检查了 `sw.js` 的 `no-cache` 与内容含 `gt-shell-v3`），**H-1~H-5 完全没覆盖**。

### 3.2 CSP 建设 + 测试

**先建 CSP，再测 CSP。**

建议策略（静态站特征决定了可以很严）：

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';     ← tailwind/Vite 可能需 inline style
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'none';
  frame-ancestors 'self';
```

**难点（需在实施时验证）**：

- Vite 构建产物是否有 inline script？若有，需要 nonce 或 hash
- `index.html` 里是否有 inline style？
- PWA manifest 是否受影响？
- `SpeechSynthesis` 是否需要额外权限策略

**测试方式**：

| # | 断言 |
|---|---|
| C-1 | `/` 响应头含 `Content-Security-Policy` |
| C-2 | 在 CSP 生效下，**首页零 CSP 违规**（监听 `securitypolicyviolation` 事件） |
| C-3 | 打字主链路在 CSP 生效下零违规 |
| C-4 | 背单词模块在 CSP 生效下零违规 |
| C-5 | SW 注册与接管在 CSP 生效下正常 |
| C-6 | 懒加载词库 chunk 加载不被 CSP 拦 |

**C-2~C-6 可用 `page.on('console')` 或注入事件监听实现**：

```js
// 概念示意
page.on('pageerror', ...)
await page.evaluate(() => {
  window.__cspViolations = []
  document.addEventListener('securitypolicyviolation', e =>
    window.__cspViolations.push(e.violatedDirective))
})
```

**这是"先加 CSP 会打破站点"的实证方式**——先跑一遍 C-2~C-6 就能知道 CSP 策略哪里太严。**建议实施顺序：先用 `report-only` 模式跑，收集违规，再收紧。**

### 3.3 XSS 测试

即使当前是纯静态，**自定义词库是自由文本输入**（见 `UPLOAD_SECURITY.md`）。测试用例：

| # | 输入 | 期望 |
|---|---|---|
| X-1 | 自定义词条 `word = "<img src=x onerror=alert(1)>"` | **原样显示为文本**，不执行 |
| X-2 | `word = "<script>alert(1)</script>"` | 原样显示 |
| X-3 | `word = "javascript:alert(1)"` | 不作为链接渲染 |
| X-4 | `translation = "<svg/onload=alert(1)>"` | 原样显示 |
| X-5 | 超长输入（10000 字符） | 有截断或正确处理，不崩 |
| X-6 | 含 `\u0000` / 控制字符 | 不崩、DOM 不被破坏 |
| X-7 | 含 emoji / 代理对（surrogate pair） | 不乱码、不截断半个字符 |
| X-8 | RTL 覆盖字符（`\u202E`） | 不导致 UI 反向 |
| X-9 | localStorage 被手动注入 `{"word": "<script>..."}`，刷新 | **不执行**（这条最接近真实攻击） |
| X-10 | 词库切换后自定义词渲染路径 | 无 `innerHTML` 注入 |

**X-9 是最有价值的**：攻击者可诱导用户粘贴一段"看起来像词库数据"的内容，或用户自己从不可信来源导入。**关键是渲染路径必须用 `textContent` 而非 `innerHTML`。**

**当前无任何断言证明这一点。** 这是本项目最实质的安全测试缺口。

### 3.4 Service Worker 安全测试

| # | 断言 |
|---|---|
| S-1 | SW `fetch` 遇到**跨 origin** 请求 → 不拦截（直接 return） |
| S-2 | SW 遇到**非 GET** 请求 → 不拦截 |
| S-3 | SW 的 `putClean` 拒绝非 200 响应入缓存 |
| S-4 | SW 不缓存的 URL 白名单（当前无白名单，只要同 origin GET 就会缓存） |
| S-5 | `caches.match(req)` 命中恶意构造的 URL（如带 `..` 的路径）时行为正确 |
| S-6 | 注入 `redirected=true` 的毒条目 → 离线仍可用（**已有 B3 部分覆盖清理，但未覆盖"毒条目仍在时"的行为**） |
| S-7 | SW 升级后旧缓存清理完整（**已有 B1/B3 覆盖**） |
| S-8 | 缓存里出现 unexpected origin 的响应时，不返回给页面 |

**S-4 值得展开**：当前 `public/sw.js` 的 `fetch` 逻辑是"非 GET 或非同 origin 直接 return；`/assets/*` cache-first；其余 network-first"。即**所有同 origin 的 GET 请求都会被缓存**。如果未来有 `/api/*` 或需要敏感数据的路径，会被无差别缓存。

**S-8 是缓存投毒的核心防御**：如果缓存被其他 origin 的响应污染，SW 可能把攻击者的内容返回给页面。

### 3.5 依赖与供应链

| # | 断言 / 流程 |
|---|---|
| D-1 | `npm audit --audit-level=high` 在 CI 里跑且必须通过 |
| D-2 | lockfile 必须提交且与 `package.json` 一致（`npm ci` 已隐含） |
| D-3 | 依赖清单人工复核（react / react-dom / lucide-react / canvas-confetti 4 个运行时依赖） |
| D-4 | 若引入 CDN 脚本 ⇒ 必须带 `integrity` + `crossorigin` |

**当前运行时依赖只有 4 个**（`package.json`）：`react 19.2.8`、`react-dom`、`lucide-react ^1.48.0`、`canvas-confetti ^1.9.4`。**依赖面很小，这是优势。**

### 3.6 存储安全

| # | 断言 |
|---|---|
| T-1 | localStorage 内容被篡改为非法 JSON → 应用不崩（走默认值） |
| T-2 | localStorage 内容被篡改为超大值 → 不撑爆内存 |
| T-3 | localStorage 配额耗尽 → 熔断生效（**已有部分覆盖**：`tests/e2e.mjs:930`【13】批8 Quota 熔断） |
| T-4 | localStorage 里的 schema 版本不匹配 → 有迁移或安全降级 |
| T-5 | localStorage 里注入未知字段 → 忽略而非报错 |

**T-1 与 T-4 未覆盖**：如果没有 schema 校验，手改 localStorage 可以注入任意结构，可能导致渲染异常（虽然不一定是安全漏洞，但属于健壮性缺口）。

---

## 4. 待建负例清单汇总

| 类别 | 数量 | 优先级 |
|---|---|---|
| 安全响应头 | 6 | 🔴 P0（成本最低） |
| CSP 建设 + 违规检测 | 6 | 🔴 P0（先建后测） |
| XSS（含 localStorage 注入） | 10 | 🔴 P0 |
| Service Worker 安全 | 8 | 🟠 P1 |
| 依赖与供应链 | 4 | 🟠 P1 |
| 存储安全 | 5 | 🟡 P2 |
| **合计** | **39** | |

---

## 5. 优先级建议

| 优先级 | 事项 | 理由 |
|---|---|---|
| 🔴 P0 | **安全响应头回归断言（H-1~H-5）** | 4 条头已存在但零守卫，改错了没人发现。**成本最低、收益最直接** |
| 🔴 P0 | **X-9：localStorage 注入后渲染不执行** | 最接近真实攻击路径的自研逻辑 |
| 🔴 P0 | **建 CSP（先 report-only）+ C-2~C-6 违规检测** | 当前零 CSP，是最大的纵深防御缺口 |
| 🟠 P1 | `npm audit` 接入 CI（D-1） | 4 个运行时依赖，接入成本低 |
| 🟠 P1 | SW 跨 origin / 非 GET 不拦截断言（S-1 / S-2） | 现有分支无断言 |
| 🟡 P2 | 缓存投毒相关（S-3 / S-4 / S-8） | 需要先明确缓存白名单策略 |
| 🟡 P2 | 存储 schema 校验（T-1 / T-4） | 健壮性问题，非直接安全漏洞 |

---

## 6. 与其他文档的关系

- 站点整体安全态势与响应头详情：`10-security/SECURITY.md`
- 自定义词库与 localStorage 面：`10-security/UPLOAD_SECURITY.md`
- SW 的 `sanitize()` 三类静默失败：`12-infrastructure/OFFLINE.md`
- 内容层 MIME 欺骗 / 资产校验：`09-testing/MEDIA_TEST.md` §3.1(b)
- 内容层负例（含 checksum 篡改）：`09-testing/IMPORT_TEST.md`

---

## 7. 一句话总结给审计方

**零安全测试，且没有 CSP。"纯静态无后端"意味着传统服务端攻击面确实不存在，但 SW（高权限 + 持久化）与 localStorage（用户可控自由文本）构成了本项目的真实攻击面，而这两个面当前一个断言都没有。最低成本的第一步是给已有的 4 条安全响应头加回归断言——它们存在但无人守。**
