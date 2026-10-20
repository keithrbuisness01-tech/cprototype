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

const Game = require('../js/game.js');
const caseFile = (id) => require('../cases/' + id + '.json');

async function main() {
  const { chromium } = loadPlaywright();
  const app = await startApp();
  const problems = [];
  const requests = [];
  try {
    const { cookie } = await app.signIn('google', googleTeacher('teacher@school.org'));
    const cls = (await (await app.api('/api/teacher/classes', { cookie, method: 'POST', body: { label: 'Network check' } })).json()).class;
    const fall = caseFile('fall-2026');
    const grade7 = caseFile('grade7');

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('request', (req) => {
      requests.push({ method: req.method(), url: req.url(), body: req.postData(), headers: req.headers() });
    });
    page.on('pageerror', (e) => problems.push('page error: ' + e.message));
    const visible = (id) => page.waitForSelector('#' + id + ':not([hidden])');

    // A student follows the teacher's join link. Fall 2026 is picked by default.
    await page.goto(cls.joinUrl);
    await visible('joined');
    const picked = await page.getAttribute('.set-btn[aria-pressed="true"]', 'data-set');
    if (picked !== 'fall-2026') problems.push('default case file was ' + picked);
    await page.click('#start-btn');
    await page.click('#howto-go');

    // Warm-up: answer each question.
    const answerQuiz = async () => {
      await visible('screen-quiz');
      const groups = await page.$$('.quiz-options');
      for (const g of groups) await (await g.$('.quiz-option')).click();
      await page.click('#quiz-go');
    };
    await answerQuiz();

    // Six cases: open two checks and judge, or pick the first plan.
    for (let i = 0; i < fall.cases.length; i++) {
      await visible('screen-inv');
      if (await page.isVisible('#inv-checks-block')) {
        // The list redraws after each check, so look the button up each time.
        await page.click('.check-btn:not([disabled]) >> nth=0');
        await page.click('.check-btn:not([disabled]) >> nth=0');
        await page.click('.verdict-btn[data-verdict="' + (i % 2 ? 'trust' : 'distrust') + '"]');
      } else {
        await page.click('.plan-btn[data-option="0"]');
      }
      await visible('inv-result');
      await page.click('#inv-next');
    }
    await answerQuiz(); // wrap-up
    await visible('screen-finish');

    // Choose another case file: Grade 7, Person or AI.
    await page.click('#screen-finish [data-choose]');
    await visible('screen-home');
    await page.click('.set-btn[data-set="grade7"]');
    await page.click('#start-btn');
    await page.click('#howto-go');
    const playDetective = async () => {
      for (let i = 0; i < grade7.cases.length; i++) {
        await visible('screen-case');
        const tag = await page.textContent('#case-tag');
        if (tag.trim() !== 'Grade 7: case ' + (i + 1) + ' of 10') problems.push('progress line: ' + tag);
        for (const id of ['A', 'C', 'E']) await page.click('.question[data-id="' + id + '"] .question-btn');
        await page.click('.verdict-btn[data-guess="' + (i % 3 === 0 ? 'ai' : 'person') + '"]');
        await page.click('#next-btn');
      }
      await visible('screen-end');
    };
    await playDetective();
    // Play again: same file, shuffled, straight into the cases.
    await page.click('#screen-end [data-again]');
    await playDetective();

    // Try the options panel too: it must not touch the network.
    await page.click('#options-tab');
    await page.click('label:has(input[value="night-shift"])');
    await page.click('label[for="opt-highContrast"]');
    await page.click('label[for="opt-taunts"]');
    await page.waitForTimeout(500);
    const storage = await page.evaluate(() => Object.keys(localStorage));
    await browser.close();

    const origin = new URL(app.base).origin;
    const sets = { 'fall-2026': fall, grade7 };
    const totals = { 'fall-2026': Game.emptyTotals(fall), grade7: Game.emptyTotals(grade7) };
    const posts = [];
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
      posts.push(body);
      if (Object.keys(body).sort().join() !== 'caseSetId,classCode,event') problems.push('extra fields sent: ' + r.body);
      if (body.classCode !== cls.code) problems.push('wrong class code sent: ' + r.body);
      const set = sets[body.caseSetId];
      // The same strict check the server runs: exact keys, no right/wrong, no ids.
      if (!set || !Game.applyEvent(totals[body.caseSetId], body.event, set)) problems.push('unexpected answer fields: ' + r.body);
    }
    const allowedStorage = ['ai-detective:class', 'ai-detective:options'];
    for (const key of storage) if (!allowedStorage.includes(key)) problems.push('unexpected browser storage: ' + key);

    const count = (id, type) => posts.filter((p) => p.caseSetId === id && p.event.type === type).length;
    const expect = (label, got, want) => { if (got !== want) problems.push(label + ': expected ' + want + ', saw ' + got); };
    expect('Fall 2026 starts', count('fall-2026', 'start'), 1);
    expect('Fall 2026 cases', count('fall-2026', 'case'), fall.cases.length);
    expect('Fall 2026 finishes', count('fall-2026', 'finish'), 1);
    expect('Grade 7 starts', count('grade7', 'start'), 2);
    expect('Grade 7 cases', count('grade7', 'case'), 20);
    expect('Grade 7 finishes', count('grade7', 'finish'), 2);
    const finish = posts.find((p) => p.caseSetId === 'fall-2026' && p.event.type === 'finish');
    if (!finish || !('pre' in finish.event)) problems.push('Fall 2026 finish is missing the warm-up and wrap-up scores');
    const replay = posts.filter((p) => p.caseSetId === 'grade7' && p.event.type === 'case').slice(10).map((p) => p.event.caseIndex);
    if (replay.join() === '0,1,2,3,4,5,6,7,8,9') problems.push('Play again did not shuffle');
    if (replay.slice().sort((a, b) => a - b).join() !== '0,1,2,3,4,5,6,7,8,9') problems.push('Play again did not play all ten cases');

    console.log('Requests made by the student device: ' + requests.length);
    console.log('  answers sent: ' + posts.length + ' (Fall 2026: 1 start, 6 cases, 1 finish; Grade 7 twice: 2 starts, 20 cases, 2 finishes)');
    for (const ex of [posts.find((p) => p.event.type === 'case' && p.event.checks), posts.find((p) => p.event.choice !== undefined), finish, posts.find((p) => p.event.picks)]) {
      if (ex) console.log('  example: ' + JSON.stringify(ex));
    }
    console.log('  Play again order: ' + replay.join(' '));
    console.log('  third-party requests: ' + requests.filter((r) => new URL(r.url).origin !== origin).length);
    console.log('  browser storage keys: ' + storage.join(', '));
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
