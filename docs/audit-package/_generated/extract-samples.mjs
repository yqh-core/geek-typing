/**
 * extract-samples.mjs — 审计资料包「内容数据样本包」提取脚本（可复现证据）
 *
 * 用途：纯读取 + 统计，绝不修改 content/ 下任何原始数据。
 * 产出：docs/audit-package/content-samples/ 下的 5 个文件
 *   1. MANIFESTS.md        —— 10 个 manifest 字段对照表
 *   2. SAMPLE-ielts.json   —— ielts 前 200 条（原样导出）
 *   3. SAMPLE-ielts-README.md
 *   4. SAMPLE-cet4.json    —— cet4 全部 84 条（原样导出）
 *   5. FIELD-COVERAGE.md   —— 逐包 + 全库字段覆盖率
 *   6. SIZE-REPORT.md      —— 逐包体积 + inline/lazy 汇总
 *
 * 所有数字均为实测（fs.statSync().size / 遍历计数），无估计值。
 * 中文文案写在脚本内，避免 shell 命令行传参被截断。
 *
 * 运行：node docs/audit-package/_generated/extract-samples.mjs
 *   须在仓库根目录 /d/work/geek-typing 下执行。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const VOCAB_DIR = path.join(ROOT, 'content', 'vocabulary');
const OUT_DIR = path.join(ROOT, 'docs', 'audit-package', 'content-samples');

/**
 * 呈现层安全化：产出物中一律使用 POSIX 风格相对/正斜杠路径，
 * 避免 Windows 反斜杠路径在 markdown 中被当作转义序列（如 \a \t \v）。
 */
const posix = (p) => p.split(path.sep).join('/');
const ROOT_DISPLAY = posix(ROOT);

// 固定包顺序，保证输出稳定可 diff
const PACKAGES = [
  'ai-core',
  'cet4',
  'cet6',
  'cloud-native',
  'frontend',
  'go-code',
  'ielts',
  'kaoyan',
  'toefl',
  'ts-code',
];

const log = (...a) => console.log('[extract]', ...a);

// ---------- 工具函数 ----------

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const size = (p) => fs.statSync(p).size;

function bytes(n) {
  return n.toLocaleString('en-US');
}
function kib(n) {
  return (n / 1024).toFixed(2);
}

/** 转义 markdown 表格单元格中的竖线与换行 */
function cell(v) {
  if (v === undefined || v === null) return '—';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** 行内代码包裹（对可能含特殊字符的值更安全） */
function code(v) {
  if (v === undefined || v === null) return '—';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return '`' + s.replace(/`/g, '\\`').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ') + '`';
}

/** 取嵌套字段，缺任一环返回 undefined */
function get(obj, dotted) {
  return dotted.split('.').reduce((cur, k) => (cur == null ? undefined : cur[k]), obj);
}

// ---------- 加载全部数据 ----------

log('读取词库目录:', VOCAB_DIR);

const packs = PACKAGES.map((pkg) => {
  const dir = path.join(VOCAB_DIR, pkg);
  const manifestPath = path.join(dir, 'manifest.json');
  const wordsPath = path.join(dir, 'words.json');

  if (!fs.existsSync(manifestPath)) throw new Error('缺少 manifest.json: ' + manifestPath);
  if (!fs.existsSync(wordsPath)) throw new Error('缺少 words.json: ' + wordsPath);

  const manifest = readJson(manifestPath);
  const words = readJson(wordsPath);

  if (!Array.isArray(words)) {
    throw new Error(`${pkg}/words.json 顶层不是数组，实际为 ${typeof words}`);
  }

  const manifestBytes = size(manifestPath);
  const wordsBytes = size(wordsPath);

  // 逐条统计字段出现情况
  const keyCounts = new Map(); // key -> 出现条数
  let withPhonetic = 0;
  let withDefinition = 0;
  let withTranslation = 0;

  for (const w of words) {
    if (w === null || typeof w !== 'object' || Array.isArray(w)) {
      throw new Error(`${pkg}/words.json 存在非对象词条`);
    }
    const keys = Object.keys(w);
    for (const k of keys) keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
    // 判定「含有」：key 存在且值为非空字符串（空串视为缺失）
    const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
    if (nonEmpty(w.phonetic)) withPhonetic++;
    if (nonEmpty(w.definition)) withDefinition++;
    if (nonEmpty(w.translation)) withTranslation++;
  }

  const policy = get(manifest, 'offline.policy');
  const declaredItems = get(manifest, 'stats.items');

  return {
    pkg,
    manifest,
    words,
    manifestBytes,
    wordsBytes,
    items: words.length,
    declaredItems,
    declaredPhonetic: get(manifest, 'stats.phonetic'),
    declaredDefinition: get(manifest, 'stats.definition'),
    withPhonetic,
    withDefinition,
    withTranslation,
    keyCounts,
    allKeys: [...keyCounts.keys()],
    policy,
    namespace: manifest.namespace,
    id: manifest.id,
  };
});

log(`已加载 ${packs.length} 个包，合计 ${packs.reduce((s, p) => s + p.items, 0)} 词`);

// 全库汇总（key 频次跨包累加）
const globalKeyCounts = new Map();
let globalItems = 0;
let globalPhonetic = 0;
let globalDefinition = 0;
let globalTranslation = 0;
for (const p of packs) {
  globalItems += p.items;
  globalPhonetic += p.withPhonetic;
  globalDefinition += p.withDefinition;
  globalTranslation += p.withTranslation;
  for (const [k, c] of p.keyCounts) globalKeyCounts.set(k, (globalKeyCounts.get(k) || 0) + c);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------- 1. MANIFESTS.md ----------

{
  // 收集本表中用到的字段，逐个包读值
  const COLS = [
    ['包目录名', (p) => p.pkg],
    ['id', (p) => p.manifest.id],
    ['namespace', (p) => p.manifest.namespace],
    ['offline.policy', (p) => get(p.manifest, 'offline.policy')],
    ['stats.items', (p) => get(p.manifest, 'stats.items')],
    ['stats.phonetic', (p) => get(p.manifest, 'stats.phonetic')],
    ['stats.definition', (p) => get(p.manifest, 'stats.definition')],
    ['contentVersion', (p) => p.manifest.contentVersion],
    ['contentRevision', (p) => p.manifest.contentRevision],
    ['schemaVersion', (p) => p.manifest.schemaVersion],
    ['sources[0].origin', (p) => get(p.manifest, 'sources.0.origin')],
    ['sources[0].license.name', (p) => get(p.manifest, 'sources.0.license.name')],
    ['sources[0].license.spdx', (p) => get(p.manifest, 'sources.0.license.spdx')],
    ['features', (p) => p.manifest.features],
    ['exam', (p) => p.manifest.exam],
  ];

  const lines = [];
  lines.push('# 词库包 manifest 字段对照表（10 包）');
  lines.push('');
  lines.push('> 本表由 `docs/audit-package/_generated/extract-samples.mjs` 从实际 JSON 读取生成，非手写。');
  lines.push(`> 生成时读取的仓库根：\`${ROOT_DISPLAY}\`（工作副本，非提交快照）。`);
  lines.push('> 表中 `stats.*` 取自 manifest 的声明值（实测对照见 `FIELD-COVERAGE.md` 第五节）；`features` 为对象，序列化展示。');
  lines.push('> 缺失字段统一记作 `—`。');
  lines.push('');

  // 主表：一列一个字段，一行一个包 —— 字段太多，改为「一行一个包 × 转置为字段」易读性差，
  // 因此采用「一列一字段」的宽表，横向可滚动查看。
  lines.push('## 宽表（每行一个包）');
  lines.push('');
  lines.push('| ' + COLS.map(([h]) => h).join(' | ') + ' |');
  lines.push('|' + COLS.map(() => '---').join('|') + '|');
  for (const p of packs) {
    lines.push('| ' + COLS.map(([, f]) => cell(f(p))).join(' | ') + ' |');
  }
  lines.push('');

  // 窄表：每行一个字段，每列一个包 —— 便于逐字段横向比对
  lines.push('## 窄表（每行一个字段，逐包横向比对）');
  lines.push('');
  lines.push('| 字段 | ' + packs.map((p) => p.pkg).join(' | ') + ' |');
  lines.push('|' + ['---', ...packs.map(() => '---')].join('|') + '|');
  for (const [header, f] of COLS) {
    lines.push('| ' + cell(header) + ' | ' + packs.map((p) => code(f(p))).join(' | ') + ' |');
  }
  lines.push('');

  // 关键一致性观察（实测推导，不是猜测）
  lines.push('## 实测一致性观察');
  lines.push('');
  const policies = new Map();
  for (const p of packs) policies.set(p.policy, (policies.get(p.policy) || 0) + 1);
  const namespaces = new Map();
  for (const p of packs) namespaces.set(p.namespace, (namespaces.get(p.namespace) || 0) + 1);
  const schemaVersions = new Set(packs.map((p) => p.manifest.schemaVersion));
  const origins = new Set(packs.map((p) => get(p.manifest, 'sources.0.origin')));
  const spdx = new Set(packs.map((p) => get(p.manifest, 'sources.0.license.spdx')));

  lines.push(`- \`offline.policy\` 分布：` + [...policies].map(([k, v]) => `\`${k}\`=${v} 包`).join('，'));
  lines.push(`- \`namespace\` 分布：` + [...namespaces].map(([k, v]) => `\`${k}\`=${v} 包`).join('，'));
  lines.push(`- \`schemaVersion\` 取值集合：` + [...schemaVersions].map((v) => `\`${v}\``).join('，'));
  lines.push(`- \`sources[0].origin\` 取值集合：` + [...origins].map((v) => `\`${v}\``).join('，'));
  lines.push(`- \`sources[0].license.spdx\` 取值集合：` + [...spdx].map((v) => (v === undefined ? '`（字段缺失）`' : `\`${v}\``)).join('，'));
  lines.push(`  - 未声明 spdx 的包（自研许可、无 SPDX 标识符）：` + packs.filter((p) => get(p.manifest, 'sources.0.license.spdx') === undefined).map((p) => '`' + p.pkg + '`').join('、') + '。');
  lines.push('');

  // stats 声明值 vs 实际词条数
  lines.push('### `stats.items` 声明值 vs `words.json` 实际条数');
  lines.push('');
  lines.push('| 包 | stats.items（声明） | 实际条数 | 是否一致 |');
  lines.push('|---|---|---|---|');
  for (const p of packs) {
    lines.push(`| ${p.pkg} | ${p.declaredItems ?? '—'} | ${p.items} | ${p.declaredItems === p.items ? '✅ 一致' : '❌ 不一致'} |`);
  }
  const mismatch = packs.filter((p) => p.declaredItems !== p.items);
  lines.push('');
  lines.push(mismatch.length === 0
    ? '结论：全部 10 包的 `stats.items` 声明值与实际词条数**完全一致**。'
    : `结论：有 ${mismatch.length} 个包不一致 —— ` + mismatch.map((p) => `\`${p.pkg}\`（声明 ${p.declaredItems} / 实际 ${p.items}）`).join('，'));
  lines.push('');

  fs.writeFileSync(path.join(OUT_DIR, 'MANIFESTS.md'), lines.join('\n'), 'utf8');
  log('已写出 MANIFESTS.md');
}

// ---------- 2. SAMPLE-ielts.json ----------

{
  const ielts = packs.find((p) => p.pkg === 'ielts');
  const sample = ielts.words.slice(0, 200);
  fs.writeFileSync(
    path.join(OUT_DIR, 'SAMPLE-ielts.json'),
    JSON.stringify(sample, null, 2) + '\n',
    'utf8',
  );
  log(`已写出 SAMPLE-ielts.json（${sample.length} 条 / 源包共 ${ielts.items} 条）`);
}

// ---------- 3. SAMPLE-ielts-README.md ----------

{
  const ielts = packs.find((p) => p.pkg === 'ielts');
  const sample = ielts.words.slice(0, 200);

  // 样本自身的字段统计
  const sampleKeyCounts = new Map();
  let samplePhonetic = 0;
  let sampleDefinition = 0;
  for (const w of sample) {
    for (const k of Object.keys(w)) sampleKeyCounts.set(k, (sampleKeyCounts.get(k) || 0) + 1);
    if (typeof w.phonetic === 'string' && w.phonetic.trim()) samplePhonetic++;
    if (typeof w.definition === 'string' && w.definition.trim()) sampleDefinition++;
  }

  const L = [];
  L.push('# SAMPLE-ielts.json 说明');
  L.push('');
  L.push('本文件为 `content/vocabulary/ielts/words.json` 的**前 200 条**词条，按原文件顺序、原样导出（未做任何字段改名/清洗/排序）。');
  L.push('');
  L.push('## 来源与范围');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('|---|---|');
  L.push(`| 源文件 | \`content/vocabulary/ielts/words.json\` |`);
  L.push(`| 源包总条数 | ${ielts.items} |`);
  L.push(`| 本样本条数 | ${sample.length} |`);
  L.push(`| 覆盖区间 | 第 1 ~ ${sample.length} 条（1-based，保持源顺序） |`);
  L.push(`| 顶层结构 | JSON 数组，元素为对象 |`);
  L.push(`| 编码 | UTF-8 |`);
  L.push('');

  L.push('## 字段集合（本样本内实际出现）');
  L.push('');
  L.push('| key | 出现条数 | 出现率 |');
  L.push('|---|---|---|');
  for (const [k, c] of [...sampleKeyCounts].sort((a, b) => b[1] - a[1])) {
    L.push(`| \`${k}\` | ${c} | ${((c / sample.length) * 100).toFixed(1)}% |`);
  }
  L.push('');

  L.push('## 缺失情况（本样本内，按「非空字符串」判定）');
  L.push('');
  L.push('| 字段 | 缺失条数 | 缺失率 | 有值条数 |');
  L.push('|---|---|---|---|');
  L.push(`| phonetic | ${sample.length - samplePhonetic} | ${(((sample.length - samplePhonetic) / sample.length) * 100).toFixed(1)}% | ${samplePhonetic} |`);
  L.push(`| definition | ${sample.length - sampleDefinition} | ${(((sample.length - sampleDefinition) / sample.length) * 100).toFixed(1)}% | ${sampleDefinition} |`);
  L.push('');

  L.push('## 源包（全 3000 条）的缺失情况 —— 用于与样本对照');
  L.push('');
  L.push('| 字段 | 有值条数 | 缺失条数 | 有值率 |');
  L.push('|---|---|---|---|');
  L.push(`| phonetic | ${ielts.withPhonetic} | ${ielts.items - ielts.withPhonetic} | ${((ielts.withPhonetic / ielts.items) * 100).toFixed(2)}% |`);
  L.push(`| definition | ${ielts.withDefinition} | ${ielts.items - ielts.withDefinition} | ${((ielts.withDefinition / ielts.items) * 100).toFixed(2)}% |`);
  L.push(`| translation | ${ielts.withTranslation} | ${ielts.items - ielts.withTranslation} | ${((ielts.withTranslation / ielts.items) * 100).toFixed(2)}% |`);
  L.push('');
  L.push(`> manifest 中 \`stats.phonetic\` 声明为 \`${ielts.declaredPhonetic}\`，实测非空 phonetic 条数为 \`${ielts.withPhonetic}\`；`);
  L.push(`> \`stats.definition\` 声明为 \`${ielts.declaredDefinition}\`，实测非空 definition 条数为 \`${ielts.withDefinition}\`。`);
  L.push('');

  L.push('## 词条形态示例（样本第 1 条，原样）');
  L.push('');
  L.push('```json');
  L.push(JSON.stringify(sample[0], null, 2));
  L.push('```');
  L.push('');

  fs.writeFileSync(path.join(OUT_DIR, 'SAMPLE-ielts-README.md'), L.join('\n'), 'utf8');
  log('已写出 SAMPLE-ielts-README.md');
}

// ---------- 4. SAMPLE-cet4.json ----------

{
  const cet4 = packs.find((p) => p.pkg === 'cet4');
  fs.writeFileSync(
    path.join(OUT_DIR, 'SAMPLE-cet4.json'),
    JSON.stringify(cet4.words, null, 2) + '\n',
    'utf8',
  );
  log(`已写出 SAMPLE-cet4.json（${cet4.items} 条，全量）`);
}

// ---------- 5. FIELD-COVERAGE.md ----------

{
  const L = [];
  L.push('# 词库包字段覆盖率统计（全库 10 包）');
  L.push('');
  L.push('> 由 `docs/audit-package/_generated/extract-samples.mjs` 遍历实际 JSON 统计生成。');
  L.push('> 「含有」判定标准：该 key 存在，且值为**非空字符串**（`""` 与纯空白视为缺失）。');
  L.push('> 所有分母为该包 `words.json` 的实际数组长度，非 manifest 声明值。');
  L.push('');

  L.push('## 一、逐包覆盖率');
  L.push('');
  L.push('| 包 | 总词条数 | 含 phonetic | 含 definition | 含 translation | phonetic 率 | definition 率 | translation 率 |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const p of packs) {
    const r = (n) => (p.items ? ((n / p.items) * 100).toFixed(2) + '%' : '—');
    L.push(`| ${p.pkg} | ${p.items} | ${p.withPhonetic} | ${p.withDefinition} | ${p.withTranslation} | ${r(p.withPhonetic)} | ${r(p.withDefinition)} | ${r(p.withTranslation)} |`);
  }
  L.push(`| **全库合计** | **${globalItems}** | **${globalPhonetic}** | **${globalDefinition}** | **${globalTranslation}** | **${((globalPhonetic / globalItems) * 100).toFixed(2)}%** | **${((globalDefinition / globalItems) * 100).toFixed(2)}%** | **${((globalTranslation / globalItems) * 100).toFixed(2)}%** |`);
  L.push('');

  L.push('## 二、逐包出现的所有 key 及频次');
  L.push('');
  // 全库 key 全集的稳定排序：word/translation/phonetic/definition 优先，其余按字母
  const PREFERRED = ['word', 'translation', 'phonetic', 'definition'];
  const allGlobalKeys = [...globalKeyCounts.keys()].sort((a, b) => {
    const ia = PREFERRED.indexOf(a);
    const ib = PREFERRED.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  L.push('| 包 | 总词条数 | ' + allGlobalKeys.map((k) => '`' + k + '`').join(' | ') + ' |');
  L.push('|' + ['---', '---', ...allGlobalKeys.map(() => '---')].join('|') + '|');
  for (const p of packs) {
    L.push(
      `| ${p.pkg} | ${p.items} | ` +
        allGlobalKeys.map((k) => (p.keyCounts.has(k) ? String(p.keyCounts.get(k)) : '0')).join(' | ') +
        ' |',
    );
  }
  L.push(
    `| **全库合计** | **${globalItems}** | ` +
      allGlobalKeys.map((k) => '**' + (globalKeyCounts.get(k) || 0) + '**').join(' | ') +
      ' |',
  );
  L.push('');

  L.push('## 三、全库 key 汇总（降序）');
  L.push('');
  L.push('| key | 全库出现条数 | 占全库词条比例 | 覆盖包数 |');
  L.push('|---|---|---|---|');
  const pkgCountOfKey = (k) => packs.filter((p) => p.keyCounts.has(k)).length;
  for (const [k, c] of [...globalKeyCounts].sort((a, b) => b[1] - a[1])) {
    L.push(`| \`${k}\` | ${c} | ${((c / globalItems) * 100).toFixed(2)}% | ${pkgCountOfKey(k)} / ${packs.length} |`);
  }
  L.push('');

  L.push('## 四、结论');
  L.push('');
  const keysWithFullCoverage = [...globalKeyCounts].filter(([, c]) => c === globalItems).map(([k]) => k);
  const keysPartial = [...globalKeyCounts].filter(([, c]) => c < globalItems).map(([k, c]) => `${k}(${c})`);
  L.push(`- 全库共出现 **${globalKeyCounts.size}** 个不同的 key：` + allGlobalKeys.map((k) => '`' + k + '`').join('、') + '。');
  L.push(`- 所有 ${globalItems} 条词条**均含**的 key：` + (keysWithFullCoverage.length ? keysWithFullCoverage.map((k) => '`' + k + '`').join('、') : '（无）') + '。');
  L.push(`- 非全覆盖 key：` + (keysPartial.length ? keysPartial.map((s) => '`' + s + '`').join('、') : '（无）') + '。');
  L.push('');
  const noPhonetic = packs.filter((p) => p.withPhonetic === 0).map((p) => p.pkg);
  if (noPhonetic.length) {
    L.push(`- **无任何 phonetic 的包（${noPhonetic.length} 个）**：` + noPhonetic.map((n) => '`' + n + '`').join('、') + ' —— 这些包只有 `word` + `translation` 两个 key。');
  }
  const noDefinition = packs.filter((p) => p.withDefinition === 0).map((p) => p.pkg);
  if (noDefinition.length) {
    L.push(`- **无任何 definition 的包（${noDefinition.length} 个）**：` + noDefinition.map((n) => '`' + n + '`').join('、') + '。');
  }
  const fullPhonetic = packs.filter((p) => p.items > 0 && p.withPhonetic === p.items).map((p) => p.pkg);
  L.push(`- phonetic **100% 覆盖**的包：` + (fullPhonetic.length ? fullPhonetic.map((n) => '`' + n + '`').join('、') : '（无）') + '。');
  L.push('');

  // 声明的 stats vs 实测 —— 一致性检查
  L.push('## 五、manifest `stats` 声明值 vs 实测值');
  L.push('');
  L.push('| 包 | stats.items / 实测 | stats.phonetic / 实测 | stats.definition / 实测 |');
  L.push('|---|---|---|---|');
  for (const p of packs) {
    const f = (decl, act) => `${decl ?? '—'} / ${act}` + (decl === act ? ' ✅' : ' ❌');
    L.push(`| ${p.pkg} | ${f(p.declaredItems, p.items)} | ${f(p.declaredPhonetic, p.withPhonetic)} | ${f(p.declaredDefinition, p.withDefinition)} |`);
  }
  L.push('');
  const mismatches = [];
  for (const p of packs) {
    if (p.declaredItems !== p.items) mismatches.push(`${p.pkg}.items`);
    if (p.declaredPhonetic !== undefined && p.declaredPhonetic !== p.withPhonetic) mismatches.push(`${p.pkg}.phonetic`);
    if (p.declaredDefinition !== undefined && p.declaredDefinition !== p.withDefinition) mismatches.push(`${p.pkg}.definition`);
  }
  L.push(mismatches.length === 0
    ? '结论：manifest `stats` 的 items / phonetic / definition 三项声明值与实测值**全部一致**。'
    : '结论：以下声明值与实测值**不一致** —— ' + mismatches.map((m) => '`' + m + '`').join('、') + '。');
  L.push('');

  fs.writeFileSync(path.join(OUT_DIR, 'FIELD-COVERAGE.md'), L.join('\n'), 'utf8');
  log('已写出 FIELD-COVERAGE.md');
}

// ---------- 6. SIZE-REPORT.md ----------

{
  const inlinePacks = packs.filter((p) => p.policy === 'inline');
  const lazyPacks = packs.filter((p) => p.policy === 'lazy');
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

  const L = [];
  L.push('# 词库包体积报告（全库 10 包）');
  L.push('');
  L.push('> 由 `docs/audit-package/_generated/extract-samples.mjs` 用 `fs.statSync(path).size` 实测生成。');
  L.push('> 所有体积为**磁盘文件字节数**（UTF-8 编码后的真实字节，不是字符数）。');
  L.push('');

  L.push('## 一、逐包体积');
  L.push('');
  L.push('| 包 | offline.policy | manifest.json (B) | manifest.json (KiB) | words.json (B) | words.json (KiB) | 词条数 | 平均字节/词条 |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const p of packs) {
    const perWord = p.items ? (p.wordsBytes / p.items).toFixed(1) : '—';
    L.push(
      `| ${p.pkg} | ${p.policy} | ${bytes(p.manifestBytes)} | ${kib(p.manifestBytes)} | ${bytes(p.wordsBytes)} | ${kib(p.wordsBytes)} | ${p.items} | ${perWord} |`,
    );
  }
  const sumManifest = sum(packs, (p) => p.manifestBytes);
  const sumWords = sum(packs, (p) => p.wordsBytes);
  L.push(
    `| **10 包合计** | — | **${bytes(sumManifest)}** | **${kib(sumManifest)}** | **${bytes(sumWords)}** | **${kib(sumWords)}** | **${globalItems}** | **${(sumWords / globalItems).toFixed(1)}** |`,
  );
  L.push('');
  L.push(`- **10 个 manifest.json 合计：${bytes(sumManifest)} 字节（${kib(sumManifest)} KiB）**`);
  L.push(`- **全库 words.json 合计：${bytes(sumWords)} 字节（${kib(sumWords)} KiB）**`);
  L.push(`- 全库内容总字节（manifest + words）：${bytes(sumManifest + sumWords)} 字节（${kib(sumManifest + sumWords)} KiB）`);
  L.push('');

  L.push('## 二、inline / lazy 分组汇总');
  L.push('');
  L.push('> 分组依据为各包 manifest 的 `offline.policy` 字段实测值。');
  L.push('');
  const grpRow = (name, arr) => {
    const items = sum(arr, (p) => p.items);
    const wb = sum(arr, (p) => p.wordsBytes);
    const mb = sum(arr, (p) => p.manifestBytes);
    return `| ${name} | ${arr.length} | ${items} | ${bytes(wb)} | ${kib(wb)} | ${bytes(mb)} | ${kib(mb)} | ${items ? (wb / items).toFixed(1) : '—'} |`;
  };
  L.push('| 分组 | 包数 | Σ 词数 | Σ words.json (B) | Σ words.json (KiB) | Σ manifest.json (B) | Σ manifest.json (KiB) | 平均字节/词条 |');
  L.push('|---|---|---|---|---|---|---|---|');
  L.push(grpRow('inline 包', inlinePacks));
  L.push(grpRow('lazy 包', lazyPacks));
  L.push(grpRow('**全库**', packs));
  L.push('');

  L.push('### inline 包明细');
  L.push('');
  L.push('| 包 | 词条数 | words.json (B) |');
  L.push('|---|---|---|');
  for (const p of inlinePacks) L.push(`| ${p.pkg} | ${p.items} | ${bytes(p.wordsBytes)} |`);
  L.push(`| **小计** | **${sum(inlinePacks, (p) => p.items)}** | **${bytes(sum(inlinePacks, (p) => p.wordsBytes))}** |`);
  L.push('');

  L.push('### lazy 包明细');
  L.push('');
  L.push('| 包 | 词条数 | words.json (B) |');
  L.push('|---|---|---|');
  for (const p of lazyPacks) L.push(`| ${p.pkg} | ${p.items} | ${bytes(p.wordsBytes)} |`);
  L.push(`| **小计** | **${sum(lazyPacks, (p) => p.items)}** | **${bytes(sum(lazyPacks, (p) => p.wordsBytes))}** |`);
  L.push('');

  const inlineWords = sum(inlinePacks, (p) => p.wordsBytes);
  const lazyWords = sum(lazyPacks, (p) => p.wordsBytes);
  const inlineItems = sum(inlinePacks, (p) => p.items);
  const lazyItems = sum(lazyPacks, (p) => p.items);
  L.push('## 三、inline 预算门禁观察');
  L.push('');
  L.push(`- **inline 门禁对象 = ${inlinePacks.length} 个包**：` + inlinePacks.map((p) => '`' + p.pkg + '`').join('、') + '。');
  L.push(`- inline 包 **Σ 词数 = ${inlineItems}**，**Σ words.json 体积 = ${bytes(inlineWords)} 字节（${kib(inlineWords)} KiB）**。`);
  L.push(`- lazy 包 ${lazyPacks.length} 个（` + lazyPacks.map((p) => '`' + p.pkg + '`').join('、') + `），Σ 词数 = ${lazyItems}，Σ words.json = ${bytes(lazyWords)} 字节（${kib(lazyWords)} KiB）。`);
  L.push(`- 占比：inline 占全库词条 **${((inlineItems / globalItems) * 100).toFixed(2)}%**，但只占全库 words.json 体积的 **${((inlineWords / sumWords) * 100).toFixed(2)}%**；lazy 占体积 **${((lazyWords / sumWords) * 100).toFixed(2)}%**。`);
  L.push(`- 单包体积最大者：\`${[...packs].sort((a, b) => b.wordsBytes - a.wordsBytes)[0].pkg}\`；最小者：\`${[...packs].sort((a, b) => a.wordsBytes - b.wordsBytes)[0].pkg}\`。`);
  L.push(`- lazy 包平均每条 ${(lazyWords / lazyItems).toFixed(1)} 字节（含 phonetic + definition，字段最全）；inline 包平均每条 ${(inlineWords / inlineItems).toFixed(1)} 字节。`);
  L.push('');

  fs.writeFileSync(path.join(OUT_DIR, 'SIZE-REPORT.md'), L.join('\n'), 'utf8');
  log('已写出 SIZE-REPORT.md');
}

log('全部产出完成 →', OUT_DIR);
