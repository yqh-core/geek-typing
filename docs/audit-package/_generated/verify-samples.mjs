/**
 * verify-samples.mjs — 审计样本包「独立复核」脚本（可复现的反证证据）
 *
 * 目的：不复用 extract-samples.mjs 的任何中间结果，直接从 content/ 源数据
 * 重新计算全部关键数字，并与已产出的 5 个交付文件逐项比对，证明交付内容
 * 与源数据一致（而不是「脚本说自己对」）。
 *
 * 与 extract 脚本刻意采取的差异化手段：
 *   - 用 readdirSync 动态发现包，而非硬编码 10 个包名
 *   - 用 fs.readdirSync + statSync 遍历比对，而非依赖内存对象
 *   - 覆盖率用「Object.hasOwn + 非空字符串」双条件重算
 *   - 交叉校验：CSV 式的原始行数/字节数、manifest 声明值、交付文件内的数字
 *
 * 运行：node docs/audit-package/_generated/verify-samples.mjs
 *   须在仓库根目录 /d/work/geek-typing 下执行。
 * 退出码 0 = 全部断言通过；非 0 = 存在不一致（会打印明细）。
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const VOCAB_DIR = path.join(ROOT, 'content', 'vocabulary');
const OUT_DIR = path.join(ROOT, 'docs', 'audit-package', 'content-samples');

let pass = 0;
let fail = 0;
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}  = ${JSON.stringify(actual)}`);
  } else {
    fail++;
    failures.push(`${label}: 实际 ${JSON.stringify(actual)} / 期望 ${JSON.stringify(expected)}`);
    console.log(`  FAIL  ${label}  实际=${JSON.stringify(actual)} 期望=${JSON.stringify(expected)}`);
  }
}

// ---------- 独立发现包（不硬编码包名） ----------

const discovered = fs
  .readdirSync(VOCAB_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

console.log(`\n[发现] content/vocabulary/ 下共 ${discovered.length} 个目录: ${discovered.join(', ')}`);

const EXPECTED_PACKAGES = [
  'ai-core', 'cet4', 'cet6', 'cloud-native', 'frontend',
  'go-code', 'ielts', 'kaoyan', 'toefl', 'ts-code',
];
check('包目录数', discovered.length, 10);
check('包目录名（排序后）', discovered, EXPECTED_PACKAGES);

// ---------- 独立重算全部数字 ----------

const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;

const data = {};
for (const pkg of discovered) {
  const mPath = path.join(VOCAB_DIR, pkg, 'manifest.json');
  const wPath = path.join(VOCAB_DIR, pkg, 'words.json');

  const manifest = JSON.parse(fs.readFileSync(mPath, 'utf8'));
  const words = JSON.parse(fs.readFileSync(wPath, 'utf8'));

  const keyFreq = {};
  let ph = 0, df = 0, tr = 0;
  for (const w of words) {
    for (const k of Object.keys(w)) keyFreq[k] = (keyFreq[k] || 0) + 1;
    if (isNonEmptyStr(w.phonetic)) ph++;
    if (isNonEmptyStr(w.definition)) df++;
    if (isNonEmptyStr(w.translation)) tr++;
  }

  data[pkg] = {
    manifest,
    words,
    manifestBytes: fs.statSync(mPath).size,
    wordsBytes: fs.statSync(wPath).size,
    n: words.length,
    ph, df, tr, keyFreq,
    policy: manifest.offline?.policy,
  };
}

console.log('\n[逐包独立重算]');
for (const pkg of discovered) {
  const d = data[pkg];
  console.log(
    `  ${pkg.padEnd(13)} n=${String(d.n).padStart(4)} ph=${String(d.ph).padStart(4)} ` +
      `df=${String(d.df).padStart(4)} tr=${String(d.tr).padStart(4)} ` +
      `mB=${String(d.manifestBytes).padStart(5)} wB=${String(d.wordsBytes).padStart(7)} policy=${d.policy}`,
  );
}

// ---------- 断言 1：全库与分组词数 ----------

console.log('\n[断言 1] 词数与分组');
const totalN = discovered.reduce((s, p) => s + data[p].n, 0);
check('全库总词数', totalN, 9346);

const inlinePkgs = discovered.filter((p) => data[p].policy === 'inline');
const lazyPkgs = discovered.filter((p) => data[p].policy === 'lazy');
check('inline 包数', inlinePkgs.length, 7);
check('lazy 包数', lazyPkgs.length, 3);
check('inline 包名单', inlinePkgs, ['ai-core', 'cet4', 'cet6', 'cloud-native', 'frontend', 'go-code', 'ts-code']);
check('lazy 包名单', lazyPkgs, ['ielts', 'kaoyan', 'toefl']);
check('inline Σ 词数', inlinePkgs.reduce((s, p) => s + data[p].n, 0), 346);
check('lazy Σ 词数', lazyPkgs.reduce((s, p) => s + data[p].n, 0), 9000);

// ---------- 断言 2：体积 ----------

console.log('\n[断言 2] 体积（fs.statSync().size 字节）');
const sumManifestB = discovered.reduce((s, p) => s + data[p].manifestBytes, 0);
const sumWordsB = discovered.reduce((s, p) => s + data[p].wordsBytes, 0);
const inlineWordsB = inlinePkgs.reduce((s, p) => s + data[p].wordsBytes, 0);
const lazyWordsB = lazyPkgs.reduce((s, p) => s + data[p].wordsBytes, 0);

// 注：manifest 字节随每次 content:build 追加一条 contentHistory 而增长，
// 基线 2026-09-29 P1.6-E 第二批（U+0454→U+025B 修复）后同步刷新 —— words.json 字节不受 build 影响。
check('10 个 manifest 合计字节', sumManifestB, 14503);
check('全库 words.json 合计字节', sumWordsB, 1477598);
check('inline Σ words.json 字节', inlineWordsB, 37043);
check('lazy Σ words.json 字节', lazyWordsB, 1440555);
check('inline + lazy == 全库', inlineWordsB + lazyWordsB, sumWordsB);

// 逐包体积快照（防止后续源数据变化而交付文件未同步）
const EXPECTED_BYTES = {
  'ai-core': [1323, 2324], cet4: [1439, 12353], cet6: [1424, 9840],
  'cloud-native': [1321, 1591], frontend: [1304, 992], 'go-code': [1406, 4644],
  ielts: [1615, 482461], kaoyan: [1625, 483016], toefl: [1609, 475078],
  'ts-code': [1437, 5299],
};
for (const pkg of discovered) {
  check(`${pkg} 体积 [manifest, words]`, [data[pkg].manifestBytes, data[pkg].wordsBytes], EXPECTED_BYTES[pkg]);
}

// ---------- 断言 3：字段覆盖率 ----------

console.log('\n[断言 3] 字段覆盖率');
const sumPh = discovered.reduce((s, p) => s + data[p].ph, 0);
const sumDf = discovered.reduce((s, p) => s + data[p].df, 0);
const sumTr = discovered.reduce((s, p) => s + data[p].tr, 0);
check('全库含 phonetic 条数', sumPh, 9076);
check('全库含 definition 条数', sumDf, 9144);
check('全库含 translation 条数', sumTr, 9346);
check('translation 100% 覆盖', sumTr, totalN);

// 逐包对照 manifest 声明
for (const pkg of discovered) {
  const m = data[pkg].manifest;
  check(`${pkg} stats.items == 实测`, m.stats?.items, data[pkg].n);
  if (m.stats && typeof m.stats.phonetic === 'number') {
    check(`${pkg} stats.phonetic == 实测非空`, m.stats.phonetic, data[pkg].ph);
  }
  if (m.stats && typeof m.stats.definition === 'number') {
    check(`${pkg} stats.definition == 实测非空`, m.stats.definition, data[pkg].df);
  }
}

// ---------- 断言 4：交付文件内容与源数据一致 ----------

console.log('\n[断言 4] 交付文件与源数据一致性');

// 4a. 文件清单
const produced = fs.readdirSync(OUT_DIR).sort();
check('交付文件清单', produced, [
  'FIELD-COVERAGE.md',
  'MANIFESTS.md',
  'SAMPLE-cet4.json',
  'SAMPLE-ielts-README.md',
  'SAMPLE-ielts.json',
  'SIZE-REPORT.md',
]);

// 4b. SAMPLE-ielts.json 必须严格等于 ielts 前 200 条
const sIelts = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'SAMPLE-ielts.json'), 'utf8'));
check('SAMPLE-ielts.json 条数', sIelts.length, 200);
check('SAMPLE-ielts.json == ielts.words[0..200)',
  sIelts, data.ielts.words.slice(0, 200));

// 4c. SAMPLE-cet4.json 必须严格等于 cet4 全量
const sCet4 = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'SAMPLE-cet4.json'), 'utf8'));
check('SAMPLE-cet4.json 条数', sCet4.length, 84);
check('SAMPLE-cet4.json == cet4.words（全量）', sCet4, data.cet4.words);

// 4d. 交付 markdown 中不得残留本机绝对路径 / 反斜杠路径
for (const f of produced.filter((f) => f.endsWith('.md'))) {
  const txt = fs.readFileSync(path.join(OUT_DIR, f), 'utf8');
  const hasDrivePath = /[A-Za-z]:\\/.test(txt);
  const hasUndefined = /\bundefined\b/.test(txt);
  check(`${f} 不含 Windows 绝对路径`, hasDrivePath, false);
  check(`${f} 不含字面 undefined`, hasUndefined, false);
}

// 4e. 交付 markdown 中的关键数字抽查（防止文件与数据脱节）
const fc = fs.readFileSync(path.join(OUT_DIR, 'FIELD-COVERAGE.md'), 'utf8');
check('FIELD-COVERAGE.md 含全库 9346', fc.includes('9346'), true);
check('FIELD-COVERAGE.md 含 phonetic 汇总 9076', fc.includes('9076'), true);
const sr = fs.readFileSync(path.join(OUT_DIR, 'SIZE-REPORT.md'), 'utf8');
check('SIZE-REPORT.md 含 inline 体积 37,043', sr.includes('37,043'), true);
check('SIZE-REPORT.md 含 lazy 体积 1,440,555', sr.includes('1,440,555'), true);
const mf = fs.readFileSync(path.join(OUT_DIR, 'MANIFESTS.md'), 'utf8');
check('MANIFESTS.md 含 10 行数据行', mf.split('\n').filter((l) => /^\| (ai-core|cet4|cet6|cloud-native|frontend|go-code|ielts|kaoyan|toefl|ts-code) /.test(l)).length >= 10, true);

// ---------- 结论 ----------

console.log('\n' + '='.repeat(60));
console.log(`复核结果: ${pass} 项通过, ${fail} 项失败`);
if (fail > 0) {
  console.log('\n失败明细:');
  for (const f of failures) console.log('  - ' + f);
  process.exitCode = 1;
} else {
  console.log('全部断言通过：交付样本包与 content/ 源数据完全一致。');
}
console.log('='.repeat(60));
