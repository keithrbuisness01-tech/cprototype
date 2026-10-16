// Every teacher route, taken straight from the server's route table, must
// refuse signed-out requests, accounts that aren't approved, idle sessions,
// other teachers, and cross-site writes. A new route is covered automatically.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { startApp, googleTeacher } = require('./helpers.js');

let clock = Date.now();
let app;
let teacherA;
let teacherB;
let cls;

const touchList = (text) => {
  fs.writeFileSync(app.approvedFile, text);
  const t = new Date(Date.now() + Math.random() * 1e6 + 1000);
  fs.utimesSync(app.approvedFile, t, t);
};

test.before(async () => {
  app = await startApp({ approved: ['teacher@school.org', 'other@school.org'], now: () => clock, rateLimits: { auth: 1000 } });
  teacherA = (await app.signIn('google', googleTeacher('teacher@school.org'))).cookie;
  teacherB = (await app.signIn('google', googleTeacher('other@school.org'))).cookie;
  cls = (await (await app.api('/api/teacher/classes', { cookie: teacherA, method: 'POST', body: { label: 'Period 3' } })).json()).class;
});
test.after(() => app.close());

function teacherRoutes() {
  return app.server.routes.filter((r) => r.auth === 'teacher').map((r) => ({
    method: r.method,
    page: Boolean(r.page),
    usesClass: r.path.includes(':id'),
    path: r.path.replace(':id', encodeURIComponent(cls.id)).replace(':file', 'teacher.js'),
  }));
}

// Paths under the teacher area that match no route must be protected too.
const UNKNOWN = [
  { method: 'GET', page: false, path: '/api/teacher/nope' },
  { method: 'POST', page: false, path: '/api/teacher/classes/' + 'x/delete-everything' },
  { method: 'GET', page: true, path: '/teacher/secret.txt' },
  { method: 'GET', page: true, path: '/teacher/a/b/c' },
];

const body = (r) => (r.method === 'GET' ? undefined : { days: 7 });

function assertRefused(res, r, error) {
  if (r.page) {
    assert.equal(res.status, 302, r.method + ' ' + r.path);
    assert.match(res.headers.get('location'), new RegExp('^/sign-in\\?error=' + error), r.path);
  } else {
    assert.equal(res.status, error === 'not-approved' ? 403 : 401, r.method + ' ' + r.path);
  }
}

test('the route table has the teacher routes the spec needs', () => {
  const paths = teacherRoutes().map((r) => r.method + ' ' + r.path.replace(encodeURIComponent(cls.id), ':id'));
  for (const expected of [
    'GET /teacher', 'GET /teacher/summary/:id', 'GET /api/teacher/me', 'GET /api/teacher/classes', 'POST /api/teacher/classes',
    'GET /api/teacher/classes/:id/report', 'POST /api/teacher/classes/:id/settings', 'POST /api/teacher/classes/:id/reset-code',
    'POST /api/teacher/classes/:id/expire-code', 'POST /api/teacher/classes/:id/share', 'POST /api/teacher/classes/:id/unshare',
    'POST /api/teacher/classes/:id/plan', 'GET /api/teacher/planner-budget',
  ]) assert.ok(paths.includes(expected), expected);
  assert.ok(teacherRoutes().length >= 14);
});

test('signed-out requests are refused on every teacher route', async () => {
  for (const r of [...teacherRoutes(), ...UNKNOWN]) {
    assertRefused(await app.api(r.path, { method: r.method, body: body(r) }), r, 'signed-out');
    assertRefused(await app.api(r.path, { method: r.method, body: body(r), cookie: 'ad_session=forged-session-id' }), r, 'signed-out');
  }
});

test('non-approved accounts are refused on every teacher route', async () => {
  // They can't sign in at all...
  const student = await app.signIn('google', googleTeacher('student@school.org'));
  assert.equal(student.error, 'not-approved');
  assert.equal(student.cookie, null);
  // ...and a teacher removed from the list is refused on every route.
  const list = fs.readFileSync(app.approvedFile, 'utf8');
  try {
    for (const r of [...teacherRoutes(), ...UNKNOWN]) {
      touchList(list);
      const { cookie } = await app.signIn('google', googleTeacher('other@school.org'));
      assert.ok(cookie);
      touchList('teacher@school.org\n');
      assertRefused(await app.api(r.path, { method: r.method, body: body(r), cookie }), r, 'not-approved');
    }
  } finally {
    touchList(list);
  }
});

test('idle sessions are signed out on every teacher route', async () => {
  for (const r of teacherRoutes()) {
    clock = Date.now();
    const { cookie } = await app.signIn('google', googleTeacher('other@school.org'));
    clock += 11 * 60 * 1000; // default idle limit is 10 minutes
    assertRefused(await app.api(r.path, { method: r.method, body: body(r), cookie }), r, 'idle');
    clock = Date.now();
  }
});

test('activity within the idle limit keeps the session', async () => {
  clock = Date.now();
  const { cookie } = await app.signIn('google', googleTeacher('other@school.org'));
  for (let i = 0; i < 4; i++) {
    clock += 8 * 60 * 1000;
    assert.equal((await app.api('/api/teacher/me', { cookie })).status, 200, 'request ' + i);
  }
  clock = Date.now();
});

test("a teacher can't see or change another teacher's class", async () => {
  for (const r of teacherRoutes().filter((x) => x.usesClass)) {
    const res = await app.api(r.path, { method: r.method, body: body(r), cookie: teacherB });
    assert.equal(res.status, 404, r.method + ' ' + r.path);
  }
  const list = await (await app.api('/api/teacher/classes', { cookie: teacherB })).json();
  assert.deepEqual(list.classes, []);
});

test('teacher writes from another site are refused', async () => {
  for (const r of teacherRoutes().filter((x) => x.method !== 'GET')) {
    const evil = await app.api(r.path, { method: r.method, body: body(r), cookie: teacherA, origin: 'https://evil.example' });
    assert.equal(evil.status, 403, r.path);
    const none = await app.api(r.path, { method: r.method, body: body(r), cookie: teacherA, origin: null });
    assert.equal(none.status, 403, r.path + ' without Origin');
  }
});

test('an approved teacher can use every GET route', async () => {
  clock = Date.now();
  for (const r of teacherRoutes().filter((x) => x.method === 'GET')) {
    const res = await app.api(r.path, { cookie: teacherA });
    assert.equal(res.status, 200, r.path);
  }
});

test('class code: reset stops the old code, expire stops it now', async () => {
  const fresh = (await (await app.api('/api/teacher/classes', { cookie: teacherA, method: 'POST', body: { label: 'Period 5' } })).json()).class;
  assert.equal((await fetch(app.base + '/api/join?code=' + fresh.code)).status, 200);
  const reset = (await (await app.api('/api/teacher/classes/' + fresh.id + '/reset-code', { cookie: teacherA, method: 'POST', body: {} })).json()).class;
  assert.notEqual(reset.code, fresh.code);
  assert.equal((await fetch(app.base + '/api/join?code=' + fresh.code)).status, 404, 'old code');
  assert.equal((await fetch(app.base + '/api/join?code=' + reset.code)).status, 200, 'new code');
  const expired = (await (await app.api('/api/teacher/classes/' + fresh.id + '/expire-code', { cookie: teacherA, method: 'POST', body: { days: 0 } })).json()).class;
  assert.equal(expired.codeActive, false);
  assert.equal((await fetch(app.base + '/api/join?code=' + reset.code)).status, 410);
  assert.equal((await app.api('/api/teacher/classes/' + fresh.id + '/expire-code', { cookie: teacherA, method: 'POST', body: { days: 3 } })).status, 400);
});

test('settings: case set and class-wide mute', async () => {
  const path = '/api/teacher/classes/' + cls.id + '/settings';
  assert.equal((await app.api(path, { cookie: teacherA, method: 'POST', body: { caseSetId: 'no-such-set' } })).status, 400);
  assert.equal((await app.api(path, { cookie: teacherA, method: 'POST', body: { soundMuted: 'yes' } })).status, 400);
  assert.equal((await app.api(path, { cookie: teacherA, method: 'POST', body: { soundMuted: true } })).status, 200);
  const joined = await (await fetch(app.base + '/api/join?code=' + cls.code)).json();
  assert.equal(joined.class.soundMuted, true);
  await app.api(path, { cookie: teacherA, method: 'POST', body: { soundMuted: false } });
});

test('results summary: owner view, read-only share link, and turning it off', async () => {
  const own = await app.api('/teacher/summary/' + cls.id, { cookie: teacherA });
  assert.equal(own.status, 200);
  assert.match(await own.text(), /Period 3/);

  const shared = (await (await app.api('/api/teacher/classes/' + cls.id + '/share', { cookie: teacherA, method: 'POST', body: {} })).json()).class.share;
  assert.ok(shared.url.includes('/s/'));
  const page = await fetch(shared.url);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /results summary/);
  assert.doesNotMatch(html, /Period 3/, 'the shared page leaves out the class label');
  assert.doesNotMatch(html, /teacher@school\.org/);
  assert.doesNotMatch(html, new RegExp(cls.code), 'no join code on the shared page');

  await app.api('/api/teacher/classes/' + cls.id + '/unshare', { cookie: teacherA, method: 'POST', body: {} });
  assert.equal((await fetch(shared.url)).status, 404);
  assert.equal((await fetch(app.base + '/s/guess')).status, 404);
});

test('share links expire after 30 days', async () => {
  clock = Date.now();
  const shared = (await (await app.api('/api/teacher/classes/' + cls.id + '/share', { cookie: teacherA, method: 'POST', body: {} })).json()).class.share;
  clock += 31 * 24 * 3600 * 1000;
  assert.equal((await fetch(shared.url)).status, 404);
  clock = Date.now();
  await app.api('/api/teacher/classes/' + cls.id + '/unshare', { cookie: teacherA, method: 'POST', body: {} });
});
