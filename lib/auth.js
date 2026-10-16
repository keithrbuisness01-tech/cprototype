// Teacher sign-in with school Google or Microsoft accounts (OpenID Connect,
// authorization code flow with PKCE), plus server-side sessions.
//
// Only emails on the approved list get a session. Everyone else is refused,
// including students and staff whose school accounts work fine otherwise.
const crypto = require('crypto');
const fs = require('fs');

// Microsoft's tenant for personal (non-school) accounts.
const CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOGIN_TTL = 10 * 60 * 1000;
const CLOCK_SKEW = 60;

const PROVIDERS = {
  google: {
    label: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    scope: 'openid email',
    issuerOk: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
  },
  microsoft: {
    label: 'Microsoft',
    // "organizations" admits work and school accounts only, never personal ones.
    authorizeUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
    jwksUrl: 'https://login.microsoftonline.com/organizations/discovery/v2.0/keys',
    scope: 'openid email profile',
    issuerOk: (iss, claims) => GUID.test(claims.tid || '') && iss === 'https://login.microsoftonline.com/' + claims.tid + '/v2.0',
  },
};

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const random = (bytes = 32) => b64url(crypto.randomBytes(bytes));

// The approved list: one email per line, "#" starts a comment. Re-read when
// the file changes, so removing someone takes effect on their next request.
function approvedList(file) {
  let cache = { mtimeMs: -1, emails: new Set() };
  return function isApproved(email) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch (e) {
      return false;
    }
    if (stat.mtimeMs !== cache.mtimeMs) {
      const emails = new Set();
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const entry = line.replace(/#.*/, '').trim().toLowerCase();
        if (entry.includes('@')) emails.add(entry);
      }
      cache = { mtimeMs: stat.mtimeMs, emails };
    }
    return typeof email === 'string' && cache.emails.has(email.toLowerCase());
  };
}

function maskEmail(email) {
  const [local, domain] = String(email).split('@');
  if (!domain) return '•••';
  return local.slice(0, 1) + '•••' + (local.length > 2 ? local.slice(-1) : '') + '@' + domain;
}

function decodePart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function jwksCache(fetchJson) {
  const cache = new Map();
  return async function keyFor(url, kid) {
    let entry = cache.get(url);
    const fresh = entry && Date.now() - entry.at < 60 * 60 * 1000;
    if (!fresh || !entry.keys.has(kid)) {
      const body = await fetchJson(url);
      const keys = new Map();
      for (const jwk of body.keys || []) {
        if (jwk.kty === 'RSA' && jwk.kid) keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
      }
      entry = { at: Date.now(), keys };
      cache.set(url, entry);
    }
    return entry.keys.get(kid) || null;
  };
}

function authService(config, { providers = PROVIDERS, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const isApproved = approvedList(config.approvedTeachersFile);
  const pending = new Map(); // state -> login attempt
  const sessions = new Map(); // session id -> session

  async function fetchJson(url, init) {
    const res = await fetchImpl(url, Object.assign({ signal: AbortSignal.timeout(10000) }, init));
    if (!res.ok) throw new Error('HTTP ' + res.status + ' from ' + new URL(url).host);
    return res.json();
  }
  const keyFor = jwksCache(fetchJson);

  function enabled() {
    return Object.keys(providers).filter((name) => config[name]);
  }

  function redirectUri(name) {
    return config.publicUrl + '/auth/' + name + '/callback';
  }

  // Step 1: send the browser to the provider.
  function start(name) {
    const provider = providers[name];
    const settings = config[name];
    if (!provider || !settings) return null;
    for (const [state, attempt] of pending) if (now() - attempt.at > LOGIN_TTL) pending.delete(state);
    const state = random();
    const nonce = random();
    const verifier = random(48);
    pending.set(state, { name, nonce, verifier, at: now() });
    const params = new URLSearchParams({
      client_id: settings.clientId,
      response_type: 'code',
      redirect_uri: redirectUri(name),
      scope: provider.scope,
      state,
      nonce,
      code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    if (name === 'google' && settings.allowedDomains.length === 1) params.set('hd', settings.allowedDomains[0]);
    return { url: provider.authorizeUrl + '?' + params, state };
  }

  async function verifyIdToken(name, idToken, nonce) {
    const provider = providers[name];
    const settings = config[name];
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) throw new Error('malformed id_token');
    const header = decodePart(parts[0]);
    const claims = decodePart(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected token algorithm');
    const key = await keyFor(provider.jwksUrl, header.kid);
    if (!key) throw new Error('unknown signing key');
    const signed = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url'));
    if (!signed) throw new Error('bad signature');
    const t = Math.floor(now() / 1000);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!provider.issuerOk(claims.iss, claims)) throw new Error('wrong issuer');
    if (!aud.includes(settings.clientId)) throw new Error('wrong audience');
    if (aud.length > 1 && claims.azp !== settings.clientId) throw new Error('wrong authorized party');
    if (typeof claims.exp !== 'number' || claims.exp < t - CLOCK_SKEW) throw new Error('token expired');
    if (typeof claims.iat !== 'number' || claims.iat > t + CLOCK_SKEW) throw new Error('token issued in the future');
    if (claims.nonce !== nonce) throw new Error('nonce mismatch');
    return claims;
  }

  // Which email the provider vouches for, or null when it doesn't vouch.
  function verifiedEmail(name, claims) {
    const settings = config[name];
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!email.includes('@')) return null;
    if (name === 'google') {
      // School accounts are Google Workspace accounts, which carry "hd".
      if (claims.email_verified !== true || !claims.hd) return null;
      if (settings.allowedDomains.length && !settings.allowedDomains.includes(String(claims.hd).toLowerCase())) return null;
      return email;
    }
    if (name === 'microsoft') {
      if (claims.tid === CONSUMER_TENANT) return null;
      if (settings.allowedTenants.length && !settings.allowedTenants.includes(String(claims.tid).toLowerCase())) return null;
      // Microsoft's "email" claim can be set by any tenant admin. Accept it
      // only when Microsoft confirms the tenant owns the email's domain.
      const edov = claims.xms_edov;
      if (!(edov === true || edov === 1 || edov === '1' || edov === 'true')) return null;
      return email;
    }
    return null;
  }

  // Step 2: the provider sends the browser back with a code.
  // Returns { session } or { error: 'not-approved' | 'sign-in-failed' }.
  async function finish(name, query, loginCookie) {
    const state = query.get('state');
    const attempt = state ? pending.get(state) : null;
    if (state) pending.delete(state);
    if (!attempt || attempt.name !== name || loginCookie !== state || now() - attempt.at > LOGIN_TTL) {
      return { error: 'sign-in-failed', reason: 'state' };
    }
    if (query.get('error') || !query.get('code')) return { error: 'sign-in-failed', reason: 'provider error' };
    const settings = config[name];
    let claims;
    try {
      const tokens = await fetchJson(providers[name].tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: query.get('code'),
          redirect_uri: redirectUri(name),
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          code_verifier: attempt.verifier,
        }),
      });
      claims = await verifyIdToken(name, tokens.id_token, attempt.nonce);
    } catch (e) {
      return { error: 'sign-in-failed', reason: e.message };
    }
    const email = verifiedEmail(name, claims);
    if (!email || !isApproved(email)) return { error: 'not-approved', reason: email ? 'not on list' : 'unverified email' };
    const id = random();
    const session = { id, email, provider: name, createdAt: now(), lastSeen: now() };
    sessions.set(id, session);
    return { session };
  }

  // Checked on every teacher request: signed in, not idle, still approved.
  // Returns { session } or { error: 'signed-out' | 'idle' | 'not-approved' }.
  function check(sessionId) {
    const session = sessionId ? sessions.get(sessionId) : null;
    if (!session) return { error: 'signed-out' };
    const t = now();
    if (t - session.lastSeen > config.idleMinutes * 60 * 1000 || t - session.createdAt > config.sessionMaxHours * 3600 * 1000) {
      sessions.delete(sessionId);
      return { error: 'idle' };
    }
    if (!isApproved(session.email)) {
      sessions.delete(sessionId);
      return { error: 'not-approved' };
    }
    session.lastSeen = t;
    return { session };
  }

  function signOut(sessionId) {
    sessions.delete(sessionId);
  }

  return { enabled, start, finish, check, signOut, providers };
}

module.exports = { authService, maskEmail, PROVIDERS, CONSUMER_TENANT };
