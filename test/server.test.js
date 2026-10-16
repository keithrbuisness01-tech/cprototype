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
  assert.deepEqual(Object.keys(body).sort(), ['caseSet', 'class']);
  assert.deepEqual(body.class, { grade: 6, soundMuted: false });
  assert.equal(body.caseSet.cases.length, 10);
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

test('anonymous answers are counted for the class', async () => {
  const caseSetId = 'grade6-core';
  assert.equal((await send({ classCode: cls.code, caseSetId, event: { type: 'start' } })).status, 200);
  assert.equal((await send({ classCode: cls.code, caseSetId, event: { type: 'case', caseIndex: 1, correct: false, picks: ['A', 'C', 'E'] } })).status, 200);
  assert.equal((await send({ classCode: cls.code, caseSetId, event: { type: 'finish', score: 7 } })).status, 200);
  const report = await (await app.api('/api/teacher/classes/' + cls.id + '/report', { cookie })).json();
  assert.equal(report.summary.started, 1);
  assert.equal(report.summary.finished, 1);
  assert.equal(report.summary.perCase[1].answered, 1);
  const saved = JSON.parse(fs.readFileSync(path.join(app.dir, 'data', 'totals.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved[cls.id]), ['grade6-core'], 'totals are kept per class and case set, as counts');
});

test('anything beyond the code and anonymous answers is refused', async () => {
  const caseSetId = 'grade6-core';
  const bad = [
    { classCode: cls.code, caseSetId, event: { type: 'start' }, name: 'Sam' },
    { classCode: cls.code, caseSetId, event: { type: 'start', device: 'abc' } },
    { classCode: cls.code, caseSetId, event: { type: 'case', caseIndex: 0, correct: true, picks: ['A', 'B', 'C'], student: 'Sam' } },
    { classCode: cls.code, caseSetId, event: { type: 'finish', score: 7, name: 'Sam' } },
    { classCode: cls.code, caseSetId, event: { type: 'name', value: 'Sam' } },
    { classCode: cls.code, caseSetId, event: { type: 'finish', score: 99 } },
    { classCode: cls.code, event: { type: 'start' } },
    null,
  ];
  for (const body of bad) assert.equal((await send(body)).status, 400, JSON.stringify(body));
  const raw = await fetch(app.base + '/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' });
  assert.equal(raw.status, 400);
  const text = await fetch(app.base + '/api/events', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(text.status, 415);
});

test('answers for an unknown code or an old case set are refused', async () => {
  assert.equal((await send({ classCode: 'ZZZZZZ', caseSetId: 'grade6-core', event: { type: 'start' } })).status, 404);
  assert.equal((await send({ classCode: cls.code, caseSetId: 'grade7-core', event: { type: 'start' } })).status, 409);
});

test('there is no public way to read class totals', async () => {
  assert.equal((await fetch(app.base + '/api/totals?class=' + cls.code)).status, 404);
  assert.equal((await fetch(app.base + '/data/totals.json')).status, 404);
});

test('serves the game but not the server code, data or teacher files', async () => {
  const index = await fetch(app.base + '/');
  assert.equal(index.status, 200);
  assert.match(await index.text(), /AI Detective/);
  for (const p of ['/js/game.js', '/cases/grade6-core.json', '/css/fonts.css', '/assets/fib/poses.json', '/sign-in']) {
    assert.equal((await fetch(app.base + p)).status, 200, p);
  }
  for (const p of ['/server.js', '/package.json', '/lib/auth.js', '/config/approved-teachers.example.txt', '/node_modules/@anthropic-ai/sdk/package.json',
    '/js/..%2fserver.js', '/js/%2e%2e/package.json', '/teacher.js', '/test/helpers.js']) {
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
