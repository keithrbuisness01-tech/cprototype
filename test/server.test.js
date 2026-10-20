// The student side of the server: joining with a class code and sending
// anonymous answers. Teacher routes are tested in teacher-routes.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startApp, googleTeacher } = require('./helpers.js');

let app;
let cookie;
let cls;
test.before(async () => {
  app = await startApp();
  ({ cookie } = await app.signIn('google', googleTeacher('teacher@school.org')));
  cls = (await (await app.api('/api/teacher/classes', { cookie, method: 'POST', body: { label: 'Period 3' } })).json()).class;
});
test.after(() => app.close());

const join = (code) => fetch(app.base + '/api/join?code=' + encodeURIComponent(code));
const send = (body) => fetch(app.base + '/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('a class code opens the game, and only the game', async () => {
  const res = await join(cls.code);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['caseSets', 'class', 'defaultSetId']);
  assert.deepEqual(body.class, { soundMuted: false, caseSetId: null });
  assert.equal(body.defaultSetId, 'fall-2026');
  assert.deepEqual(body.caseSets.map((s) => s.id), ['fall-2026', 'warmup', 'grade6', 'grade7', 'grade8', 'grade6-core'], 'the student picks a case file');
  assert.deepEqual(body.caseSets.map((s) => s.cases.length), [6, 10, 10, 10, 10, 10]);
  assert.equal(JSON.stringify(body).includes('teacher@school.org'), false, 'no teacher email');
  assert.equal(JSON.stringify(body).includes('Period 3'), false, 'no class label');
  // The code is not a teacher credential.
  const asTeacher = await fetch(app.base + '/api/teacher/classes', { headers: { cookie: 'ad_session=' + cls.code } });
  assert.equal(asTeacher.status, 401);
});

test('codes are matched without case or spacing, and wrong codes are refused', async () => {
  assert.equal((await join(cls.code.toLowerCase())).status, 200);
  assert.equal((await join(cls.code.slice(0, 3) + ' ' + cls.code.slice(3))).status, 200);
  assert.equal((await join('ZZZZZZ')).status, 404);
  assert.equal((await join('')).status, 404);
  assert.equal((await join('<script>')).status, 404);
});

const G7 = require('../cases/grade7.json');
const FALL = require('../cases/fall-2026.json');

test('anonymous answers are counted for the class, per case file', async () => {
  const c1 = G7.cases[1];
  assert.equal((await send({ classCode: cls.code, caseSetId: 'grade7', event: { type: 'start' } })).status, 200);
  assert.equal((await send({ classCode: cls.code, caseSetId: 'grade7', event: { type: 'case', caseIndex: 1, position: 0, picks: ['A', 'C', 'E'], guess: c1.verdict } })).status, 200);
  assert.equal((await send({ classCode: cls.code, caseSetId: 'grade7', event: { type: 'finish', score: 7 } })).status, 200);
  const strong = FALL.cases[0].checks.findIndex((k) => k.strong);
  assert.equal((await send({ classCode: cls.code, caseSetId: 'fall-2026', event: { type: 'case', caseIndex: 0, position: 0, checks: [strong], verdict: FALL.cases[0].verdict } })).status, 200);
  assert.equal((await send({ classCode: cls.code, caseSetId: 'fall-2026', event: { type: 'finish', score: 3, pre: 2, post: 4 } })).status, 200);

  const g7 = await (await app.api('/api/teacher/classes/' + cls.id + '/report?set=grade7', { cookie })).json();
  assert.equal(g7.caseSet.id, 'grade7');
  assert.equal(g7.summary.started, 1);
  assert.equal(g7.summary.finished, 1);
  assert.equal(g7.summary.perCase[1].answered, 1);
  assert.equal(g7.summary.perCase[1].correct, 1, 'the server works out right or wrong');
  const fall = await (await app.api('/api/teacher/classes/' + cls.id + '/report?set=fall-2026', { cookie })).json();
  assert.equal(fall.summary.perCase[0].solvedPct, 100);
  assert.equal(fall.summary.quiz.improvedPct, 100);
  assert.equal(fall.teaching.pack, 'Fall 2026');
  assert.equal(g7.teaching, null, 'no lesson guide for Person-or-AI files');
  const saved = JSON.parse(fs.readFileSync(path.join(app.dir, 'data', 'totals.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved[cls.id]).sort(), ['fall-2026', 'grade7'], 'totals are kept per class and case file, as counts');
});

test('anything beyond the code and anonymous answers is refused', async () => {
  const caseSetId = 'grade7';
  const bad = [
    { classCode: cls.code, caseSetId, event: { type: 'start' }, name: 'Sam' },
    { classCode: cls.code, caseSetId, event: { type: 'start', device: 'abc' } },
    { classCode: cls.code, caseSetId, event: { type: 'case', caseIndex: 0, position: 0, picks: ['A', 'B', 'C'], guess: 'ai', student: 'Sam' } },
    { classCode: cls.code, caseSetId, event: { type: 'case', caseIndex: 0, position: 0, picks: ['A', 'B', 'C'], guess: 'ai', correct: true } },
    { classCode: cls.code, caseSetId, event: { type: 'finish', score: 7, name: 'Sam' } },
    { classCode: cls.code, caseSetId, event: { type: 'name', value: 'Sam' } },
    { classCode: cls.code, caseSetId, event: { type: 'finish', score: 99 } },
    { classCode: cls.code, caseSetId: 'fall-2026', event: { type: 'case', caseIndex: 0, position: 0, checks: [0, 1, 2], verdict: 'trust' } },
    { classCode: cls.code, caseSetId: 'fall-2026', event: { type: 'finish', score: 3, pre: 2, post: 4, answers: [0, 1] } },
    { classCode: cls.code, event: { type: 'start' } },
    { classCode: cls.code, caseSetId: 7, event: { type: 'start' } },
    null,
  ];
  for (const body of bad) assert.equal((await send(body)).status, 400, JSON.stringify(body));
  const raw = await fetch(app.base + '/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' });
  assert.equal(raw.status, 400);
  const text = await fetch(app.base + '/api/events', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(text.status, 415);
});

test('answers for an unknown code or case file are refused', async () => {
  assert.equal((await send({ classCode: 'ZZZZZZ', caseSetId: 'grade7', event: { type: 'start' } })).status, 404);
  assert.equal((await send({ classCode: cls.code, caseSetId: 'grade9', event: { type: 'start' } })).status, 409);
});

test('when the teacher sets the case file, students get only that one', async () => {
  const other = (await (await app.api('/api/teacher/classes', { cookie, method: 'POST', body: { label: 'Period 5' } })).json()).class;
  const set = await app.api('/api/teacher/classes/' + other.id + '/settings', { cookie, method: 'POST', body: { caseSetId: 'grade8' } });
  assert.equal(set.status, 200);
  const body = await (await join(other.code)).json();
  assert.equal(body.class.caseSetId, 'grade8');
  assert.equal(body.defaultSetId, 'grade8');
  assert.deepEqual(body.caseSets.map((s) => s.id), ['grade8']);
  assert.equal((await send({ classCode: other.code, caseSetId: 'grade8', event: { type: 'start' } })).status, 200);
  assert.equal((await send({ classCode: other.code, caseSetId: 'grade6', event: { type: 'start' } })).status, 409, 'other case files are refused');
  // Back to letting students choose.
  await app.api('/api/teacher/classes/' + other.id + '/settings', { cookie, method: 'POST', body: { caseSetId: '' } });
  assert.equal((await (await join(other.code)).json()).caseSets.length, 6);
});

test('there is no public way to read class totals', async () => {
  assert.equal((await fetch(app.base + '/api/totals?class=' + cls.code)).status, 404);
  assert.equal((await fetch(app.base + '/data/totals.json')).status, 404);
});

test('serves the game but not the server code, data or teacher files', async () => {
  const index = await fetch(app.base + '/');
  assert.equal(index.status, 200);
  assert.match(await index.text(), /AI Detective/);
  for (const p of ['/js/game.js', '/js/evidence.js', '/cases/grade6-core.json', '/cases/fall-2026.json', '/assets/evidence/storm-shark.svg', '/css/fonts.css', '/assets/fib/poses.json', '/sign-in']) {
    assert.equal((await fetch(app.base + p)).status, 200, p);
  }
  for (const p of ['/server.js', '/package.json', '/lib/auth.js', '/config/approved-teachers.example.txt', '/node_modules/@anthropic-ai/sdk/package.json',
    '/js/..%2fserver.js', '/js/%2e%2e/package.json', '/teacher.js', '/test/helpers.js', '/reference/ai-detective-demo.html']) {
    assert.equal((await fetch(app.base + p)).status, 404, p);
  }
  assert.equal((await fetch(app.base + '/js/%E0%A4%A')).status, 400);
});

test('every response forbids third-party loading and framing', async () => {
  const res = await fetch(app.base + '/');
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});

test('join attempts are rate limited', async () => {
  const fresh = await startApp();
  try {
    let last;
    for (let i = 0; i < 31; i++) last = await fetch(fresh.base + '/api/join?code=ZZZZZZ');
    assert.equal(last.status, 429);
  } finally {
    await fresh.close();
  }
});
