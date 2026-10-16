const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const { startApp, googleTeacher, microsoftTeacher, TENANT } = require('./helpers.js');
const { CONSUMER_TENANT } = require('../lib/auth.js');

let app;
test.before(async () => {
  app = await startApp({ rateLimits: { auth: 1000 } });
});
test.after(() => app.close());

test('an approved teacher signs in with Google and gets a session', async () => {
  const r = await app.signIn('google', googleTeacher('teacher@school.org'));
  assert.ok(r.cookie, 'session cookie set');
  const me = await app.api('/api/teacher/me', { cookie: r.cookie });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).email, 't•••r@school.org');
});

test('an approved teacher signs in with Microsoft', async () => {
  const r = await app.signIn('microsoft', microsoftTeacher('other@school.org'));
  assert.ok(r.cookie);
});

test('email matching ignores case', async () => {
  const r = await app.signIn('google', googleTeacher('Teacher@School.org', { hd: 'school.org' }));
  assert.ok(r.cookie);
});

test('a school account that is not on the approved list is refused, with no session', async () => {
  for (const [provider, claims] of [
    ['google', googleTeacher('student@school.org')],
    ['microsoft', microsoftTeacher('student@school.org')],
    ['google', googleTeacher('principal@school.org')],
  ]) {
    const r = await app.signIn(provider, claims);
    assert.equal(r.error, 'not-approved', claims.email);
    assert.equal(r.cookie, null, 'no session cookie for ' + claims.email);
  }
});

test('Google accounts must be verified school (Workspace) accounts', async () => {
  const unverified = await app.signIn('google', googleTeacher('teacher@school.org', { email_verified: false }));
  assert.equal(unverified.error, 'not-approved');
  const personal = googleTeacher('teacher@school.org');
  delete personal.hd;
  assert.equal((await app.signIn('google', personal)).error, 'not-approved', 'personal Gmail-style account (no hd)');
});

test('Microsoft emails count only when Microsoft confirms the domain owner', async () => {
  const noEdov = microsoftTeacher('teacher@school.org');
  delete noEdov.xms_edov;
  assert.equal((await app.signIn('microsoft', noEdov)).error, 'not-approved');
  assert.equal((await app.signIn('microsoft', microsoftTeacher('teacher@school.org', { xms_edov: false }))).error, 'not-approved');
  const consumer = microsoftTeacher('teacher@school.org', { tid: CONSUMER_TENANT, iss: 'https://login.microsoftonline.com/' + CONSUMER_TENANT + '/v2.0' });
  assert.equal((await app.signIn('microsoft', consumer)).error, 'not-approved', 'personal Microsoft account');
});

test('forged or broken tokens are refused', async () => {
  const claims = googleTeacher('teacher@school.org');
  const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const cases = {
    'signed by another key': { token: (c, sign) => sign(c, otherKey) },
    'unknown key id': { token: (c, sign) => sign(c, undefined, 'nope') },
    'wrong audience': { token: (c, sign) => sign(Object.assign({}, c, { aud: 'someone-else' })) },
    'wrong issuer': { token: (c, sign) => sign(Object.assign({}, c, { iss: 'https://evil.example' })) },
    'expired': { token: (c, sign) => sign(Object.assign({}, c, { exp: Math.floor(Date.now() / 1000) - 3600 })) },
    'wrong nonce': { token: (c, sign) => sign(Object.assign({}, c, { nonce: 'replayed' })) },
    'unsigned': { token: (c) => Buffer.from('{"alg":"none"}').toString('base64url') + '.' + Buffer.from(JSON.stringify(c)).toString('base64url') + '.' },
    'missing login cookie': { dropLoginCookie: true },
  };
  for (const [name, tamper] of Object.entries(cases)) {
    const r = await app.signIn('google', claims, tamper);
    assert.equal(r.error, 'sign-in-failed', name);
    assert.equal(r.cookie, null, name);
  }
  // A Microsoft token whose issuer names a different tenant than its tid.
  const mixed = microsoftTeacher('teacher@school.org', { iss: 'https://login.microsoftonline.com/99999999-2222-3333-4444-555555555555/v2.0' });
  assert.equal((await app.signIn('microsoft', mixed)).error, 'sign-in-failed');
  assert.ok(TENANT);
});

test('the PKCE verifier and client secret go to the token endpoint', async () => {
  await app.signIn('google', googleTeacher('teacher@school.org'));
  const last = app.idp.tokenRequests[app.idp.tokenRequests.length - 1];
  assert.equal(last.grant_type, 'authorization_code');
  assert.equal(last.client_secret, 'google-secret');
  assert.ok(last.code_verifier && last.code_verifier.length >= 43);
});

test('a login state cannot be reused', async () => {
  const start = await fetch(app.base + '/auth/google', { redirect: 'manual' });
  const login = start.headers.getSetCookie()[0].split(';')[0];
  const callback = app.idp.authorize(start.headers.get('location'), googleTeacher('teacher@school.org'));
  const first = await fetch(callback, { redirect: 'manual', headers: { cookie: login } });
  assert.equal(first.headers.get('location'), '/teacher');
  const again = await fetch(callback, { redirect: 'manual', headers: { cookie: login } });
  assert.match(again.headers.get('location'), /error=sign-in-failed/);
});

test('removing a teacher from the list ends their session on the next request', async () => {
  const { cookie } = await app.signIn('google', googleTeacher('other@school.org'));
  assert.equal((await app.api('/api/teacher/me', { cookie })).status, 200);
  const before = fs.readFileSync(app.approvedFile, 'utf8');
  fs.writeFileSync(app.approvedFile, 'teacher@school.org\n');
  const future = new Date(Date.now() + 5000);
  fs.utimesSync(app.approvedFile, future, future);
  try {
    assert.equal((await app.api('/api/teacher/me', { cookie })).status, 403);
    assert.equal((await app.api('/api/teacher/me', { cookie })).status, 401, 'session is gone, not just blocked');
  } finally {
    fs.writeFileSync(app.approvedFile, before);
    const later = new Date(Date.now() + 10000);
    fs.utimesSync(app.approvedFile, later, later);
  }
});

test('signing out ends the session', async () => {
  const { cookie } = await app.signIn('google', googleTeacher('teacher@school.org'));
  const out = await app.api('/auth/sign-out', { cookie, method: 'POST' });
  assert.equal(out.status, 200);
  assert.equal((await app.api('/api/teacher/me', { cookie })).status, 401);
});

test('unknown providers are not found', async () => {
  assert.equal((await fetch(app.base + '/auth/facebook', { redirect: 'manual' })).status, 404);
});
