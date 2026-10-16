// Small HTTP helpers shared by every route.
const MAX_BODY = 8 * 1024;

// Nothing loads from other sites: no CDNs, analytics or trackers.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function redirect(res, location, cookies) {
  const headers = { Location: location, 'Cache-Control': 'no-store' };
  if (cookies && cookies.length) headers['Set-Cookie'] = cookies;
  res.writeHead(302, headers);
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const type = String(req.headers['content-type'] || '');
  if (!type.startsWith('application/json')) throw Object.assign(new Error('expected JSON'), { status: 415 });
  const text = await readBody(req);
  try {
    return text ? JSON.parse(text) : {};
  } catch (e) {
    throw Object.assign(new Error('bad JSON'), { status: 400 });
  }
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (name) out[name] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookie(name, value, { maxAge, path = '/', secure }) {
  const parts = [name + '=' + encodeURIComponent(value), 'Path=' + path, 'HttpOnly', 'SameSite=Lax'];
  if (maxAge !== undefined) parts.push('Max-Age=' + Math.floor(maxAge));
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// Requests that change data must come from this site's own pages.
function sameOrigin(req, config) {
  const origin = req.headers.origin;
  if (origin) return origin === config.publicOrigin;
  return req.headers['sec-fetch-site'] === 'same-origin';
}

function clientIp(req, config) {
  if (config.trustProxy && req.headers['x-forwarded-for']) {
    return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// Fixed-window counter per key, e.g. "join:1.2.3.4".
function rateLimiter() {
  const windows = new Map();
  return function allow(key, limit, windowMs, now = Date.now()) {
    const w = windows.get(key);
    if (!w || now - w.start >= windowMs) {
      windows.set(key, { start: now, count: 1 });
      if (windows.size > 50000) windows.clear();
      return true;
    }
    w.count += 1;
    return w.count <= limit;
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

module.exports = {
  securityHeaders,
  sendJson,
  sendHtml,
  redirect,
  readJson,
  parseCookies,
  cookie,
  sameOrigin,
  clientIp,
  rateLimiter,
  escapeHtml,
};
