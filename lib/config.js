// Server settings, read from environment variables. See README "Configuration".
const path = require('path');

const ROOT = path.join(__dirname, '..');

function number(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function list(value) {
  return String(value || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch (e) {
    return '';
  }
}

function loadConfig(env = process.env, overrides = {}) {
  const port = number(env.PORT, 8080);
  const publicUrl = String(env.PUBLIC_URL || 'http://localhost:' + port).replace(/\/+$/, '');
  const config = {
    root: ROOT,
    port,
    publicUrl,
    publicOrigin: new URL(publicUrl).origin,
    secureCookies: publicUrl.startsWith('https://'),
    trustProxy: env.TRUST_PROXY === '1',
    dataDir: env.DATA_DIR || path.join(ROOT, 'data'),
    approvedTeachersFile: env.APPROVED_TEACHERS_FILE || path.join(ROOT, 'config', 'approved-teachers.txt'),
    idleMinutes: number(env.TEACHER_IDLE_MINUTES, 10),
    sessionMaxHours: number(env.TEACHER_SESSION_MAX_HOURS, 8),
    classCodeDays: number(env.CLASS_CODE_DAYS, 180),
    shareDays: number(env.SHARE_LINK_DAYS, 30),
    supportUrl: httpsUrl(env.SUPPORT_URL),
    google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, allowedDomains: list(env.GOOGLE_ALLOWED_DOMAINS) }
      : null,
    microsoft: env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
      ? { clientId: env.MICROSOFT_CLIENT_ID, clientSecret: env.MICROSOFT_CLIENT_SECRET, allowedTenants: list(env.MICROSOFT_ALLOWED_TENANTS) }
      : null,
    // Requests per minute per address.
    rateLimits: { join: 30, auth: 30, events: 3000 },
    ai: {
      enabled: Boolean(env.ANTHROPIC_API_KEY),
      monthlyCapUsd: number(env.AI_MONTHLY_CAP_USD, 20),
    },
  };
  return Object.assign(config, overrides);
}

module.exports = { loadConfig, ROOT };
