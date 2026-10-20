// The server-side teacher code: an extra way in for the person who runs the
// app, checked only on the server, rate limited, and off unless TEACHER_CODE
// is set.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startApp } = require('./helpers.js');
const { authService } = require('../lib/auth.js');

const CODE = 'case-file-2026';

const codeSignIn = (app, code, origin = app.base) => fetch(app.base + '/auth/code', {
  method: 'POST',
  headers: Object.assign({ 'content-type': 'application/json' }, origin ? { origin } : {}),
  body: JSON.stringify({ code }),
});
const sessionCookie = (res) => (res.headers.getSetCookie().find((c) => c.startsWith('ad_session=')) || '').split(';')[0] || null;

test('the right code signs in, even with an empty approved list', async () => {
  const app = await startApp({ approved: [], env: { TEACHER_CODE: CODE } });
  try {
    const providers = await (await fetch(app.base + '/auth/providers')).json();
    assert.equal(providers.teacherCode, true, 'the sign-in page shows the code form');
    assert.equal(JSON.stringify(providers).includes(CODE), false, 'the code itself never leaves the server');
    const res = await codeSignIn(app, CODE);
    assert.equal(res.status, 200);
    const cookie = sessionCookie(res);
    assert.ok(cookie);
    assert.match(res.headers.getSetCookie().find((c) => c.startsWith('ad_session=')), /HttpOnly/i);
    const me = await (await app.api('/api/teacher/me', { cookie })).json();
    assert.equal(me.email, 'Teacher code');
  } finally {
    await app.close();
  }
});

test('a code session reaches every teacher route', async () => {
  const app = await startApp({ approved: [], env: { TEACHER_CODE: CODE } });
  try {
    const cookie = sessionCookie(await codeSignIn(app, CODE));
    const cls = (await (await app.api('/api/teacher/classes', { cookie, method: 'POST', body: { label: 'Period 1' } })).json()).class;
    assert.ok(cls.code);
    for (const r of app.server.routes.filter((x) => x.auth === 'teacher')) {
      const p = r.path.replace(':id', encodeURIComponent(cls.id)).replace(':file', 'teacher.js');
      const res = await app.api(p, { cookie, method: r.method, body: r.method === 'GET' ? undefined : { days: 7 } });
      assert.ok(![401, 403].includes(res.status), r.method + ' ' + r.path + ' gave ' + res.status);
      if (res.status === 302) assert.doesNotMatch(res.headers.get('location'), /sign-in/, r.path);
      await res.arrayBuffer();
    }
  } finally {
    await app.close();
  }
});

test('a wrong code is refused with no session', async () => {
  const app = await startApp({ env: { TEACHER_CODE: CODE } });
  try {
    for (const code of ['case-file-2025', CODE.toUpperCase(), '', CODE + ' ']) {
      const res = await codeSignIn(app, code);
      assert.equal(res.status, 401, JSON.stringify(code));
      assert.equal((await res.json()).error, 'wrong-code');
      assert.equal(sessionCookie(res), null);
    }
    const notText = await fetch(app.base + '/auth/code', { method: 'POST', headers: { 'content-type': 'application/json', origin: app.base }, body: JSON.stringify({ code: 12345678 }) });
    assert.equal(notText.status, 401);
  } finally {
    await app.close();
  }
});

test('code tries are rate limited', async () => {
  const app = await startApp({ env: { TEACHER_CODE: CODE } });
  try {
    for (let i = 0; i < 10; i++) assert.equal((await codeSignIn(app, 'guess-' + i)).status, 401);
    const blocked = await codeSignIn(app, CODE);
    assert.equal(blocked.status, 429, 'even the right code waits once the limit is hit');
    assert.equal(sessionCookie(blocked), null);
  } finally {
    await app.close();
  }
});

test('code sign-in from another site is refused', async () => {
  const app = await startApp({ env: { TEACHER_CODE: CODE } });
  try {
    assert.equal((await codeSignIn(app, CODE, 'https://evil.example')).status, 403);
    assert.equal((await codeSignIn(app, CODE, null)).status, 403);
  } finally {
    await app.close();
  }
});

test('without TEACHER_CODE, or with one under 8 characters, the code is off', async () => {
  for (const env of [{}, { TEACHER_CODE: 'short' }]) {
    const app = await startApp({ env });
    try {
      assert.equal((await (await fetch(app.base + '/auth/providers')).json()).teacherCode, false);
      const res = await codeSignIn(app, env.TEACHER_CODE || 'anything-at-all');
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error, 'code-off');
    } finally {
      await app.close();
    }
  }
});

test('turning the code off ends code sessions; school sessions follow the list', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-'));
  try {
    const approvedTeachersFile = path.join(dir, 'approved.txt');
    fs.writeFileSync(approvedTeachersFile, '');
    const config = { approvedTeachersFile, teacherCode: CODE, teacherCodeEmail: 'teacher-code', idleMinutes: 10, sessionMaxHours: 8, providers: {} };
    const auth = authService(config);
    const session = auth.codeSignIn(CODE);
    assert.ok(session);
    assert.ok(auth.check(session.id).session, 'not on the approved list, still in');
    config.teacherCode = '';
    assert.equal(auth.check(session.id).error, 'signed-out');
    assert.equal(auth.check(session.id).error !== undefined, true, 'the session is gone');
    assert.equal(auth.codeSignIn(CODE), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
