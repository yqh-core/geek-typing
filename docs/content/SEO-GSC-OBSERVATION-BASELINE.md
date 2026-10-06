# GSC 接入与观察期台账（SEO Content Surface · Path C Phase 1 之后）

**建立时间**：2026-10-06
**代码基线**：`d35dade` ｜ **裁定档落档**：`ca4e5de`（CI `37407901262` success）
**裁定档**：`docs/content/SEO-CONTENT-SURFACE-PHASE1-CLOSE.md`
**域名**：`geek-typing.pages.dev`（⛔ 不是 `digdevbox.com` —— 那是另一个站）

---

## 一、通道现状（必须先说清，否则会误以为「已核验」）

| 项 | 状态 |
|---|---|
| GSC API凭据（service account / OAuth） | ⛔ **本机无**（无 `gcloud`、无 `~/.credentials`、无 service-account json） |
| GSC 连接器 | ⛔ **市场无对应连接器**（已搜，无Google Search Console / Cloud Search Console 类目） |
| `sc-domain:digdevbox.com` | ⛔ **不可用** —— 属DigDevBox，与本项目无关 |
| `geek-typing.pages.dev` 的 GSC property | ❓ **待确认**（需你在浏览器里添加并验证） |

⇒ **「提交 sitemap」与「URL Inspection」这两步必须由你本人操作**（或给我已授权的凭据）。
我已把**提交前必须成立的前置条件全部实测完**（见第二节），确保你提交时不会白提交。

---

## 二、提交前前置条件核验（team lead 实测，2026-10-06，全部为生产实测）

### A. `sitemap.xml` 格式合法性

| 判据 | 实测 |
|---|---|
| HTTP | **200** |
| `xmlns` 声明 | ✅ 有 |
| `</urlset>` 闭合 | ✅ |
| URL 数 | **14**（1 首页 + 13 词库页） |
| 全部 `https` | ✅ |
| 全部无 `.html` | ✅ |
| 无重复 | ✅ |
| URL 格式异常 | **0** |
| `<lastmod>` | ⛔ **无** —— Google 接受，但**建议后续补上**（有助 crawl 调度优先级） |

### B. `robots.txt` 放行

| 判据 | 实测 |
|---|---|
| HTTP | 200（46 B，`text/plain`） |
| `Allow: /` | ✅ |
| 无 `Disallow: /` 全站拦截 | ✅ **全文零条 Disallow** |
| 指向 sitemap | ⚠️ `Sitemap: /sitemap.xml` —— **相对路径**，Google 会按 robots.txt 所在 host 解析，**实际可用**，但非最佳实践（官方规范用绝对 URL）。登记 O-SEO-07 |

### C. Googlebot 可抓取性（**最关键——这一步不过，sitemap 提交了也没用**）

| 判据 | 实测 |
|---|---|
| 13 页是否有 `meta robots noindex` | ✅ **全部 0 处**（逐文件实测）—— 注意：13 页是**完全没有** `<meta name="robots">` 标签（不是写了 `index, follow`），默认即 index/follow |
| 生产响应是否有 `X-Robots-Tag` 头 | ✅ **无**（无阻塞） |
| 以 Googlebot UA 请求 `ielts` | **200 + 73957 B** |
| Googlebot UA 与普通 UA 是否同构 | ✅ **73957 vs 73957 B**（无 UA 拦截、无内容降级）。**扩测全13 页：Googlebot 与 Chrome 13/13 状态与字节数全同** |
| 13 页 HTTP 状态 |✅ **13/13 = 200** |

**正文长度（去标签口径，剔除 `<script>/<style>` 后再剥标签、归一空白）**

⚠️ **本节数字必须写明口径，否则无法互相比较。** 本台账早期版本 4 个数字混用了
「含 script」与「不含 script」两套口径，已全部更正（见 §六O-SEO-05）。

| 页面 | 响应体字节数 | 正文长度（不含script/style） | 同口径下含 script | 渲染词条 |
|---|---|---|---|---|
| `ielts` | **73957** | **28827** | 29808 | 300 |
| `kaoyan` |73940 | **29106** | 30087 | 300 |
| `toefl` | 72946 | **27886** | 28867 | 300 |
| `frontend` | **5087** | **547** | 1528 | 20 |

- 差值恒定 **981 字符** = 13 页共享的**同一个内联 `<style>` 块**（去标签后 980 字符 + 空白归一差 1）。已实测定位，非推测。
- **Google 索引的是可见文本，不计 `script`/`style`** ⇒ **右两列才是 SEO 真实值**。
- ⚠️ **`frontend` 真实正文仅 547 字符**（不是早期记录的 1528）⇒ O-SEO-03 的严重度需上调，见下。
- ⚠️ **本地 `dist` 与生产逐字节一致**（ielts/frontend/toefl/kaoyan 4/4 页字节数相同）。

⚠️ **一次观测**：`/pages/bank/frontend` 首轮探测出现一次网络超时，**重试第 1 次即200**。
判定为**偶发网络抖动，非页面缺陷**。⚠️ **后续两轮独立复核（含 60+ 次请求）均无法复现**
（普通 UA / Googlebot UA / 带 `.html` / 不带 `.html` 四种取法下均首次成功）
⇒ 属**一次性、不可复现**观测，详见 O-SEO-04。

### C2. `.html` → 308 → 无后缀 的规范化链（实测通过）

| 判据 | 实测 |
|---|---|
| `/pages/bank/ielts.html` | **308** → `Location: /pages/bank/ielts` |
| `/pages/bank/frontend.html` | **308** → `Location: /pages/bank/frontend` |
| canonical / sitemap 是否含 `.html` | ✅ **0 条含** |

⇒ 本刀修复的核心目标**已在生产实测确认生效**，不只是门禁自证。

### C3. 词条渲染规模（**有意设计，不是缺陷，但对 GSC 有实质影响**）

| 页面 | `words.json` 真实词条 | 页面渲染 | 占比 |
|---|---|---|---|
| `ielts` / `toefl` / `kaoyan` | 各 **3000** | **300** | **10%** |
| `frontend` | 20 | 20 | 100% |

- 这是 Phase 1 的**明确设计**：`build-static-pages.mjs:71` `WORDS_PER_PAGE = 300`，
  文件头注释写明「**不做分页**：每页只输出受控规模的首屏内容，SPA 才是完整内容承载」。
- 页面**如实声明**规模（`:267` 「本页展示前 300 词 / 完整 3000 词」），无夸大。
- ⚠️ **但对 GSC 而言**：Google 看到一个自称 3000 词却只列 300 词的页面，
  对「内容厚度 / 完整性」判断是**负面信号**。登记为 **O-SEO-06**，⛔ 不在本刀扩为分页。

### D. canonical 一致性

| 判据 | 实测 |
|---|---|
| 页面声明 canonical | `https://geek-typing.pages.dev/pages/bank/ielts`（13 页全部，无 `.html`） |
| 该 URL 是否在 sitemap 中 | ✅ 逐条一致 |
| 是否与首页 canonical 相同 | ✅ 否（首页 = `https://geek-typing.pages.dev/`） |
| 13 个 `<title>` 是否互不相同 | ✅ 13 个唯一值 |

**结论：Google 已具备发现与抓取本内容面的全部前置条件。** 闭环的最后一环只剩「告诉 Google 它存在」。

⚠️ **低风险记录**：canonical 斜杠风格不统一 —— 首页带尾斜杠 `/`，13 个词库页不带。
二者互不相同，**不构成重复内容**，仅记录。

### E. soft-404 已修复（Phase 1 验收项，此处补录实测证据）

| 判据 | 修复前 | 修复后（实测） |
|---|---|---|
| 不存在路径 HTTP 状态 | ⛔ **200**（CF Pages 回落index.html） | ✅ **404**（复测 2 次均 404） |
| 响应体| 2007 B（**恰等于首页字节数** ⇒ 就是那份 SPA 空壳） | **1025 B**（`public/404.html`） |
| `meta robots noindex` | 无 | ✅ **有** `<meta name="robots" content="noindex">` |
| title | （SPA 的 title） | `404 · 页面不存在 · Geek Typing` |

⇒「2007 B 恰等于首页字节数」是当时判定为soft-404 空壳的**直接物证**（当时记为观察，现已闭环）。

---

## 三、待你执行的两步（我无凭据，不能代做）

### ① 建立 / 确认 GSC property
- 推荐 **Domain property**：`geek-typing.pages.dev`（或URL-prefix `https://geek-typing.pages.dev/`）
- ⛔ **不要用** `sc-domain:digdevbox.com`
- 验证方式：DNS TXT 记录（Domain property）或 HTML 文件/元标签（URL-prefix）

### ② 提交 sitemap
- 提交 URL：`https://geek-typing.pages.dev/sitemap.xml`
- ⛔ 不要提交 `digdevbox.com` 的 sitemap

---

## 四、URL Inspection 取样策略（**不要 13 页一次性判「收录」**）

选 **4 个代表页**（覆盖规模 extremes）：

| 代表 | URL | 为什么选它 |
|---|---|---|
| 首页 | `/` | 权重最高，先看它是否被 Google 重新评估 |
| 最大内容页 | `/pages/bank/kaoyan` | 73940 B / 正文 29106 字，最可能被抓取并给予曝光 |
| 最小内容页 | `/pages/bank/frontend` | 仅 20 词、**正文仅 547 字符**，**最可能因「内容太薄」被判低质量** ⇒ 重点观察 |
| 中等规模页 | `/pages/bank/toefl` | 72946 B / 正文 27886 字，验证规模不是唯一变量 |

（若你习惯以 `ielts` 作为代表页亦可：73957 B / 正文 28827 字，与 kaoyan 同规模级。）

每次 URL Inspection 必看 5 项（尤其最后两项是否一致）：

1. `URL is on Google`
2. `Indexing allowed?`
3. `Crawled?`
4. **`Google-selected canonical`** ←
5. **`User-declared canonical`** ←

**本刀刚修的就是 4/5 一致性**：`User-declared canonical` 必须是
`https://geek-typing.pages.dev/pages/bank/<id>`（无 `.html`），
且 `Google-selected canonical` 必须与它**一致**。
若 Google 选了别的地址 ⇒ 立即记为观察项，**不重新打开 Path C**（先看是同批 308 规范化未完成，还是别的因素）。

---

## 五、观察基线台账（**每天/每几天记录，初始值全为「待观测」**）

⚠️ **GSC 刚提交 sitemap 后没有数据是正常现象。**
**不要因为前几天 0 impressions / 0 clicks 就重新打开 Path C。**

| # | 指标 | 关注点 | 基线值 |
|---|---|---|---|
| 1 | Sitemap 提交状态 | 是否 Success | 待观测 |
| 2 | 已发现 URL（Discovered） | Google 是否发现 14 个 | 待观测 |
| 3 | 已抓取（Crawled） | 是否开始抓取 | 待观测 |
| 4 | 已收录（Indexed） | 实际收录几个 | 待观测 |
| 5 | Impressions | 是否开始产生搜索曝光 | 待观测 |
| 6 | Queries | Google 给了什么关键词 | 待观测 |
| 7 | Clicks | 是否产生自然点击 | 待观测 |
| 8 | CTR | 哪些页面/查询有吸引力 | 待观测 |
| 9 | Average position | 实际排名变化 | 待观测 |

### 判读纪律（**提前钉死，避免将来自己找理由重开**）

- **收录慢 ≠ 有问题**。新站/新页面进入索引通常需要数天到数周。
- **Impressions 0 但已抓取** = 正常爬取期，继续等。
- **Indexed < 14** 不自动等于失败：Google 本就允许「发现但不收录」（内容质量、
  站点权重、竞争度都会影响）。
- **只有当 Google-selected canonical 与我们声明的不一致，或页面被判 `noindex` / `Crawled - no**
  时，才是**需要动手**的信号。
- 判定的**唯一依据是 Google 端数据**，不是「还能优化什么」。

---

## 六、已登记的观察项（**不因GSC 初期数据而重开**）

| 编号 | 内容 |
|---|---|
| **O-SEO-01** | `public/sitemap.xml` 可人工手改，门禁只验 `dist` 产物。当前闭环只证明 `content → generator → dist/sitemap.xml → production` |
| **O-SEO-02** | sitemap **缺 `<lastmod>`**（实测 0 个）。Google 接受，但有助crawl 调度。若 GSC 长期显示「已发现但抓取不积极」，可考虑补 |
| **O-SEO-03**（**严重度已上调**） | 最小包 `frontend` **真实正文仅 547 字符**（20 词 · 响应体 5087 B）。早期记录的 1528 字符含981 字符的共享 `<style>` 噪声，**已被更正**。**内容厚度不足以获得独立排名的概率显著高于早期判断**。⛔ **不建议为凑量灌水** —— 若 GSC 长期不收录它，正确处置是**接受「小包不参与排名」**，而不是加字 |
| **O-SEO-04**（**已降级**） | 一次观测到 `/pages/bank/frontend` 首轮网络超时（重试即 200）。⚠️ **后续两轮独立复核、共 60+ 次请求，均无法复现**（普通 UA / Googlebot /带 `.html` / 不带 `.html` 四种取法下均首次成功）。⇒ 定性为**一次性、不可复现观测**，**不足以支撑「若反复出现需查 Cloudflare Pages 侧稳定性」的结论强度**。仅在**反复出现**时才升级为稳定性问题，且应查 CF 侧而非改页面 |
| **O-SEO-05**（新· 台账自身缺陷，已修） | 本台账早期版本的 4 个正文长度**混用了「含 script」与「不含 script」两套口径**（`ielts` 用不含script，另 3 页用含 script），导致 `frontend` 被记为 1528（真值 **547**）、`toefl` 记为 28867（真值 **27886**）、`kaoyan` 记为 30087（真值 **29106**）；另有`ielts` 字节数 73967 的**数字转置错误**（真值 **73957**）。**根因已实测定位：差值恒定 981 = 13 页共享的同一内联 `<style>` 块**。⇒ **已全部更正，并在 §二C 明写口径**。教训：**混用口径的数字不能横向比较**，一旦混用即等于没有基线 |
| **O-SEO-06**（新） | 三个大包 `words.json` 各 **3000** 词，页面只渲染 **300** 词（10%）。这是 Phase 1 的**明确设计**（`WORDS_PER_PAGE = 300`，不做分页），页面也如实声明「展示前 300 / 完整 3000」。⚠️ 但 Google 看到的是「自称 3000 却只列 300」的页面，对内容完整性判断是**负面信号**。⛔ **不在本刀扩为分页**；仅当 GSC 真实数据显示这些包有曝光潜力时，才作为**下一刀的依据**（而不是现在凭工程感觉做） |
| **O-SEO-07**（新） | `robots.txt` 用**相对路径** `Sitemap: /sitemap.xml`。Google 按 robots.txt 所在 host 解析，**实际可用**（实测正常放行），但官方规范用绝对 URL。一旦将来加CDN 子域或换主机，解析基准会变。属**可接受但非最佳实践**，登记观察 |

---

## 七、明确不做（yqh 明令，⛔ 不扩范围）

- ❌ 不做全量分页（`/bank/x/page/2/`）—— 等真实曝光数据证明值得
- ❌ 不碰 reading / exercise 类型
- ❌ 不继续为了 SEO 随意调整页面
- ❌ 不因 `public/sitemap.xml` 可手改而扩大门禁
- ❌ 不因新增第 14 个词汇包触发 fail-closed 而改门禁
- ❌ **不因 GSC 初期 0 数据重新打开 Path C**

### 本轮落档时的一条工程纪律（第9 条的实例）

台账初稿里的正文长度数字**内部并不矛盾、门禁也不管它**——它错在「混用两套口径」这个只有
**横向比较**才能发现的问题。发现它的不是任何既有门禁，而是一次**独立复核**（同一份数据由
第二个执行者用不同取样重算）。

⇒ **凡是要被横向比较的度量，落地时必须写明口径**；否则「有数字」会给出「已建立基线」的错觉。
这是 `判据一致 ≠ 语义正确` 的第9 条纪律在**文档层**的形态。

---

## 八、SHA 引用（沿用双基线规则）

| 口径 | SHA | 权威 run |
|---|---|---|
| 代码实现状态基线 | `d35dade` | `37406244511` success |
| 最终仓库 HEAD | `ca4e5de` | `37407901262` success |
| 前实现版（canonical 修复前） | `53bc8cd` | `37403078567` success |
