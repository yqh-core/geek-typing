/**
 * smoke.mjs — 「打工人赛博防御力测试」落地页冒烟脚本
 *
 * 运行（node 22）：
 *   C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2-3/node.exe smoke.mjs
 *
 * 依赖：只读借用主仓库 playwright-core（不安装、不修改 D:/work/geek-typing 任何文件）
 * 目标：file:// 直接加载 test.html，断言完整答题链路与视觉约束，截图存 _evidence/
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(HERE, '_evidence');
const PAGE_URL = 'file:///' + path.resolve(HERE, '../public/test/index.html').replace(/\\/g, '/');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

fs.mkdirSync(SHOT_DIR, { recursive: true });

const checks = [];
let failures = 0;
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function bindErrors(page, bucket) {
  page.on('console', (m) => { if (m.type() === 'error') bucket.push(m.text()); });
  page.on('pageerror', (e) => bucket.push(String((e && e.message) || e)));
}

/** 从开屏连答 6 题（固定选第 pickNth 项）直到结果卡出现 */
async function playThrough(page, pickNth) {
  await page.click('#btn-start');
  for (let i = 0; i < 6; i++) {
    await page.waitForSelector('.opt');
    const before = (await page.textContent('#q-idx')).trim();
    await page.click(`.opt >> nth=${pickNth}`);
    await page.waitForFunction(
      (b) =>
        document.getElementById('screen-result').classList.contains('active') ||
        document.getElementById('q-idx').textContent.trim() !== b,
      before,
    );
  }
  await page.waitForSelector('#screen-result.active');
}

async function run() {
  console.log(`🌐 浏览器：${CHROME}`);
  console.log(`🎯 目标：${PAGE_URL}\n`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: CHROME,
      args: ['--no-sandbox'],
    });

    /* ---------- 桌面 1280 ---------- */
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    bindErrors(page, errors);
    await page.goto(PAGE_URL);
    await page.waitForTimeout(400); // 等开场淡入动画结束再断言与截图

    console.log('【1】开屏');
    const introTitle = (await page.textContent('#screen-intro .title')) ?? '';
    check(
      '开屏渲染（标题 + 开始检测按钮）',
      introTitle.includes('赛博防御力') && (await page.isVisible('#btn-start')),
    );
    await page.screenshot({ path: path.join(SHOT_DIR, '01-intro.png'), fullPage: true });

    console.log('【2】答题流程（含回退）');
    await page.click('#btn-start');
    await page.waitForSelector('.opt');
    await page.click('.opt >> nth=0');
    await page.waitForFunction(() =>
      document.getElementById('q-idx').textContent.trim().startsWith('Q2'));
    await page.click('#btn-back');
    await page.waitForFunction(() =>
      document.getElementById('q-idx').textContent.trim().startsWith('Q1'));
    check('回退上一题可用', true);
    for (let i = 0; i < 6; i++) {
      await page.waitForSelector('.opt');
      const before = (await page.textContent('#q-idx')).trim();
      if (i === 2) await page.screenshot({ path: path.join(SHOT_DIR, '02-quiz.png') });
      await page.click('.opt >> nth=2');
      await page.waitForFunction(
        (b) =>
          document.getElementById('screen-result').classList.contains('active') ||
          document.getElementById('q-idx').textContent.trim() !== b,
        before,
      );
    }
    await page.waitForSelector('#screen-result.active');
    await page.waitForTimeout(900); // 等进度条动画结束再断言与截图

    console.log('【3】结果卡');
    const tier = ((await page.textContent('#r-tier')) ?? '').trim();
    const score = ((await page.textContent('#r-score')) ?? '').trim();
    check('结果卡出现，档位名非空', tier.length > 0, `档位=${tier}`);
    check(
      '防御力分数为 0-100 数字',
      /^\d{1,3}$/.test(score) && Number(score) >= 0 && Number(score) <= 100,
      `分数=${score}`,
    );
    await page.screenshot({ path: path.join(SHOT_DIR, '03-result.png'), fullPage: true });

    console.log('【4】导图按钮');
    check('「保存战力报告图」按钮存在', await page.isVisible('#btn-save'));
    const errBefore = errors.length;
    await page.click('#btn-save');
    let toastSeen = true;
    try {
      await page.waitForSelector('#toast.show', { timeout: 20000 });
    } catch {
      toastSeen = false;
    }
    await page.waitForTimeout(800);
    const newErr = errors.slice(errBefore);
    check('导图点击后无新增 console error', newErr.length === 0, newErr.slice(0, 2).join(' | '));
    check('导图流程有 toast 反馈（成功或降级提示）', toastSeen);

    console.log('【5】导流链接与桌面视口');
    const href = await page.getAttribute('.result-actions a.btn-primary', 'href');
    check('「前往打字站」链接 href 为 ../', href === '../', `href=${href}`);
    const w1280 = await page.evaluate(() => document.documentElement.scrollWidth);
    check('1280px 视口无横向溢出', w1280 <= 1280, `scrollWidth=${w1280}`);
    check('桌面端全程无 console 报错', errors.length === 0, errors.slice(0, 2).join(' | '));

    /* ---------- 移动端 375 ---------- */
    console.log('【6】移动端 375px');
    const merr = [];
    const mctx = await browser.newContext({
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const mpage = await mctx.newPage();
    bindErrors(mpage, merr);
    await mpage.goto(PAGE_URL);
    await playThrough(mpage, 2);
    await mpage.waitForTimeout(900); // 等进度条动画结束再截图
    const mtier = ((await mpage.textContent('#r-tier')) ?? '').trim();
    check('移动端完整流程可玩通（档位名非空）', mtier.length > 0, `档位=${mtier}`);
    const w375 = await mpage.evaluate(() => document.documentElement.scrollWidth);
    check('375px 视口无横向溢出', w375 <= 375, `scrollWidth=${w375}`);
    check('移动端全程无 console 报错', merr.length === 0, merr.slice(0, 2).join(' | '));
    await mpage.screenshot({ path: path.join(SHOT_DIR, '04-mobile.png'), fullPage: true });
    await mctx.close();

    await browser.close();
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`共 ${checks.length} 项，通过 ${checks.length - failures}，失败 ${failures}`);
    console.log(failures === 0 ? 'ALL GREEN ✅' : '存在失败项 ❌');
    if (failures > 0) process.exitCode = 1;
  } catch (e) {
    console.error('\n💥 冒烟脚本异常：', e);
    if (browser) await browser.close().catch(() => {});
    process.exitCode = 1;
  }
}

run();
