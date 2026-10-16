// Shared test setup: a server on a random port with its own data folder, and a
// stand-in identity provider that behaves like Google and Microsoft do
// (signed ID tokens, PKCE, JWKS), so sign-in can be tested end to end offline.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createServer } = require('../server.js');
const { loadConfig } = require('../lib/config.js');
const { PROVIDERS } = require('../lib/auth.js');

function fakeIdentityProvider() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'test-key-1';
  const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid, use: 'sig', alg: 'RS256' });
  const codes = new Map();
  const tokenRequests = [];
  let server;

  const signJwt = (claims, key = privateKey, headerKid = kid) => {
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const data = enc({ alg: 'RS256', kid: headerKid, typ: 'JWT' }) + '.' + enc(claims);
    return data + '.' + crypto.sign('RSA-SHA256', Buffer.from(data), key).toString('base64url');
  };

  const idp = {
    base: '',
    tokenRequests,
    async start() {
      server = http.createServer((req, res) => {
        if (req.url === '/jwks') {
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
          return;
        }
        if (req.url === '/token' && req.method === 'POST') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            const form = new URLSearchParams(body);
            tokenRequests.push(Object.fromEntries(form));
            const grant = codes.get(form.get('code'));
            codes.delete(form.get('code'));
            const challenge = crypto.createHash('sha256').update(form.get('code_verifier') || '').digest('base64url');
            if (!grant || grant.challenge !== challenge || grant.clientId !== form.get('client_id')) {
              res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"error":"invalid_grant"}');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id_token: grant.idToken }));
          });
          return;
        }
        res.writeHead(404).end();
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      idp.base = 'http://127.0.0.1:' + server.address().port;
    },
    stop: () => new Promise((r) => server.close(r)),
    providers() {
      const p = {};
      for (const name of Object.keys(PROVIDERS)) {
        p[name] = Object.assign({}, PROVIDERS[name], {
          authorizeUrl: idp.base + '/' + name + '/authorize',
          tokenUrl: idp.base + '/token',
          jwksUrl: idp.base + '/jwks',
        });
      }
      return p;
    },
    // Plays the provider's sign-in page: the person signs in as `identity`,
    // and the browser is sent back to the app with a code. `tamper` lets a
    // test break one part of the token.
    authorize(authorizeUrl, claims, tamper = {}) {
      const url = new URL(authorizeUrl);
      const q = url.searchParams;
      const t = Math.floor(Date.now() / 1000);
      const full = Object.assign({ aud: q.get('client_id'), iat: t, exp: t + 600, nonce: q.get('nonce') }, claims);
      const idToken = tamper.token ? tamper.token(full, signJwt) : signJwt(full);
      const code = crypto.randomBytes(12).toString('hex');
      codes.set(code, { idToken, challenge: q.get('code_challenge'), clientId: q.get('client_id') });
      return q.get('redirect_uri') + '?code=' + code + '&state=' + encodeURIComponent(q.get('state'));
    },
    signJwt,
  };
  return idp;
}

const googleTeacher = (email, extra = {}) => Object.assign({ iss: 'https://accounts.google.com', sub: 'g-' + email, email, email_verified: true, hd: email.split('@')[1] }, extra);
const TENANT = '11111111-2222-3333-4444-555555555555';
const microsoftTeacher = (email, extra = {}) => Object.assign({ iss: 'https://login.microsoftonline.com/' + TENANT + '/v2.0', tid: TENANT, sub: 'm-' + email, email, xms_edov: true }, extra);

async function startApp({ approved = ['teacher@school.org', 'other@school.org'], env = {}, anthropicClient, now, rateLimits } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-detective-'));
  const approvedFile = path.join(dir, 'approved.txt');
  fs.writeFileSync(approvedFile, '# test list\n' + approved.join('\n') + '\n');
  const idp = fakeIdentityProvider();
  await idp.start();
  const config = loadConfig(Object.assign({
    DATA_DIR: path.join(dir, 'data'),
    APPROVED_TEACHERS_FILE: approvedFile,
    GOOGLE_CLIENT_ID: 'google-client',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    MICROSOFT_CLIENT_ID: 'ms-client',
    MICROSOFT_CLIENT_SECRET: 'ms-secret',
  }, env));
  if (rateLimits) config.rateLimits = Object.assign({}, config.rateLimits, rateLimits);
  const server = createServer({ config, providers: idp.providers(), anthropicClient, now });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  // Redirect URIs and the same-origin check use the real address.
  config.publicUrl = base;
  config.publicOrigin = base;

  const cookieOf = (res, name) => {
    for (const c of res.headers.getSetCookie()) if (c.startsWith(name + '=')) return c.split(';')[0];
    return null;
  };

  const app = {
    base,
    dir,
    idp,
    server,
    approvedFile,
    // Full sign-in round trip. Returns { cookie } or { error } from the redirect.
    async signIn(provider, claims, tamper) {
      const start = await fetch(base + '/auth/' + provider, { redirect: 'manual' });
      const login = cookieOf(start, 'ad_login');
      const callback = idp.authorize(start.headers.get('location'), claims, tamper);
      const back = await fetch(callback, { redirect: 'manual', headers: tamper && tamper.dropLoginCookie ? {} : { cookie: login } });
      const location = back.headers.get('location') || '';
      const cookie = cookieOf(back, 'ad_session');
      if (location === '/teacher' && cookie) return { cookie };
      return { error: new URL(location, base).searchParams.get('error'), cookie };
    },
    // Teacher API call with a session cookie and this site's Origin.
    api(pathname, { cookie, method = 'GET', body, origin = base } = {}) {
      const headers = {};
      if (cookie) headers.cookie = cookie;
      if (origin) headers.origin = origin;
      if (body !== undefined) headers['content-type'] = 'application/json';
      return fetch(base + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    },
    async close() {
      await new Promise((r) => server.close(r));
      await idp.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  return app;
}

module.exports = { startApp, googleTeacher, microsoftTeacher, TENANT };
