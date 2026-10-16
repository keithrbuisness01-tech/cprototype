// Plays a full student session in a real browser and checks every network
// request the student's device makes: same site only, and nothing sent beyond
// the class code and anonymous answers.
//
//   node scripts/check-student-network.js
//
// Needs Playwright with Chromium (npm i -g playwright, or set PLAYWRIGHT_PATH).
const path = require('path');
const { execSync } = require('child_process');
const { startApp, googleTeacher } = require('../test/helpers.js');

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright'];
  try {
    tries.push(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  } catch (e) {
    // no global npm
  }
  for (const t of tries.filter(Boolean)) {
    try {
      return require(t);
    } catch (e) {
      // try the next one
    }
  }
  throw new Error('Playwright not found. Install it with: npm i -g playwright');
}

const EVENT_KEYS = { start: ['type'], case: ['caseIndex', 'correct', 'picks', 'type'], finish: ['score', 'type'] };

async function main() {
  const { chromium } = loadPlaywright();
  const app = await startApp();
  const problems = [];
  const requests = [];
  try {
    const { cookie } = await app.signIn('google', googleTeacher('teacher@school.org'));
    const cls = (await (await app.api('/api/teacher/classes', { cookie, method: 'POST', body: { label: 'Network check' } })).json()).class;
    const set = require('../cases/grade6-core.json');

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('request', (req) => {
      requests.push({ method: req.method(), url: req.url(), body: req.postData(), headers: req.headers() });
    });
    page.on('pageerror', (e) => problems.push('page error: ' + e.message));

    // A student follows the teacher's join link and plays every case.
    await page.goto(cls.joinUrl);
    await page.waitForSelector('#joined:not([hidden])');
    await page.click('#start-btn');
    await page.click('#howto-go');
    for (let i = 0; i < set.cases.length; i++) {
      for (const id of ['A', 'C', 'E']) await page.click('.question[data-id="' + id + '"] .question-btn');
      await page.click('.verdict-btn[data-guess="' + (i % 3 === 0 ? 'ai' : 'person') + '"]');
      await page.click('#next-btn');
    }
    await page.waitForSelector('#screen-end:not([hidden])');
    // Try the options panel too: it must not touch the network.
    await page.click('#options-tab');
    await page.click('label:has(input[value="night-shift"])');
    await page.click('label[for="opt-highContrast"]');
    await page.waitForTimeout(500);
    const storage = await page.evaluate(() => Object.keys(localStorage));
    await browser.close();

    const origin = new URL(app.base).origin;
    for (const r of requests) {
      const u = new URL(r.url);
      if (u.origin !== origin) problems.push('third-party request: ' + r.url);
      if (r.headers.cookie) problems.push('cookie sent by a student device: ' + r.url);
      if (r.method === 'GET') {
        const ok = u.pathname === '/' || /^\/(css|js|assets|cases)\//.test(u.pathname) || u.pathname === '/api/health' ||
          (u.pathname === '/api/join' && [...u.searchParams.keys()].join() === 'code' && u.searchParams.get('code') === cls.code);
        if (!ok) problems.push('unexpected GET: ' + u.pathname + u.search);
        continue;
      }
      if (r.method !== 'POST' || u.pathname !== '/api/events') {
        problems.push('unexpected ' + r.method + ': ' + u.pathname);
        continue;
      }
      const body = JSON.parse(r.body);
      if (Object.keys(body).sort().join() !== 'caseSetId,classCode,event') problems.push('extra fields sent: ' + r.body);
      if (body.classCode !== cls.code) problems.push('wrong class code sent: ' + r.body);
      const allowed = EVENT_KEYS[body.event && body.event.type];
      if (!allowed || Object.keys(body.event).sort().join() !== allowed.join()) problems.push('unexpected answer fields: ' + r.body);
    }
    const allowedStorage = ['ai-detective:class', 'ai-detective:options'];
    for (const key of storage) if (!allowedStorage.includes(key)) problems.push('unexpected browser storage: ' + key);

    const posts = requests.filter((r) => r.method === 'POST');
    console.log('Requests made by the student device: ' + requests.length);
    console.log('  answers sent: ' + posts.length + ' (1 start, ' + set.cases.length + ' cases, 1 finish expected)');
    console.log('  example answer: ' + (posts[1] ? posts[1].body : 'none'));
    console.log('  third-party requests: ' + requests.filter((r) => new URL(r.url).origin !== origin).length);
    console.log('  browser storage keys: ' + storage.join(', '));
    if (posts.length !== set.cases.length + 2) problems.push('expected ' + (set.cases.length + 2) + ' answers, saw ' + posts.length);
  } finally {
    await app.close();
  }
  if (problems.length) {
    console.error('\nFAILED:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  console.log('\nPASSED: only the class code and anonymous answers left the device.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
