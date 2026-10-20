// AI Detective classroom server. Serves the student game, the protected
// teacher area, and the APIs between them. `npm start` (see README for the
// environment variables).
const http = require('http');
const fs = require('fs');
const path = require('path');
const Game = require('./js/game.js');
const { QUESTIONS } = require('./js/casedata.js');
const { loadConfig } = require('./lib/config.js');
const { openStore } = require('./lib/store.js');
const { loadCaseSets } = require('./lib/case-sets.js');
const { classService } = require('./lib/classes.js');
const { authService, maskEmail } = require('./lib/auth.js');
const { plannerService } = require('./lib/planner.js');
const { renderSummaryPage } = require('./lib/summary.js');
const H = require('./lib/http.js');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8',
};
// Public files. The teacher/ folder is served only through protected routes.
const PUBLIC_FILES = ['index.html', 'sign-in.html'];
const PUBLIC_DIRS = ['css', 'js', 'assets', 'cases'];
const TEACHER_FILES = ['index.html', 'teacher.js'];

// Exactly the keys a student request may have. The event's own fields are
// checked by Game.applyEvent against the case file.
const PAYLOAD_KEYS = ['caseSetId', 'classCode', 'event'];
const sameKeys = (obj, keys) => obj && typeof obj === 'object' && !Array.isArray(obj) &&
  Object.keys(obj).sort().join() === keys.slice().sort().join();

function serveFile(res, file, req) {
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

// Resolves a public path to a file, or null. Checked after resolving "..".
function publicFile(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (e) {
    return undefined;
  }
  const file = path.resolve(root, '.' + path.sep + (decoded.replace(/^\/+/, '') || 'index.html'));
  const rel = path.relative(root, file).split(path.sep);
  const ok = (rel.length === 1 && PUBLIC_FILES.includes(rel[0])) || (rel.length > 1 && PUBLIC_DIRS.includes(rel[0]));
  return ok ? file : null;
}

function createServer(options = {}) {
  const config = options.config || loadConfig();
  const now = options.now || (() => Date.now());
  const store = openStore(config.dataDir);
  const caseSets = loadCaseSets(path.join(config.root, 'cases'));
  const classes = classService(store, config, caseSets, now);
  const auth = authService(config, { providers: options.providers, fetchImpl: options.fetchImpl, now });
  let client = options.anthropicClient;
  if (!client && config.ai.enabled) {
    const Anthropic = require('@anthropic-ai/sdk').default;
    client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  }
  const planner = plannerService(store, config, { client, now });
  const allow = H.rateLimiter();

  // Totals are kept per class and per case file.
  function totalsFor(cls, caseSet) {
    const byClass = store.totals.data[cls.id] || (store.totals.data[cls.id] = {});
    const t = byClass[caseSet.id];
    const fresh = Game.emptyTotals(caseSet);
    if (t && t.rules === caseSet.rules && Array.isArray(t.cases) && t.cases.length === caseSet.cases.length &&
        Array.isArray(t.positions) && Array.isArray(t.scores) && t.scores.length === fresh.scores.length) return t;
    return (byClass[caseSet.id] = fresh);
  }

  // The case file a report is about: the one asked for, else the class's own,
  // else the default.
  function reportSet(cls, requested) {
    return caseSets.get(requested) || caseSets.get(classes.caseSetOf(cls)) || caseSets.get(caseSets.defaultId);
  }

  function setsPlayed(cls) {
    const byClass = store.totals.data[cls.id] || {};
    return caseSets.list().map((s) => Object.assign(s, { answered: byClass[s.id] ? byClass[s.id].cases.reduce((n, c) => n + c.answered, 0) : 0 }));
  }

  function classView(cls) {
    const active = cls.codeExpiresAt > now();
    const share = cls.share && cls.share.expiresAt > now()
      ? { url: config.publicUrl + '/s/' + cls.share.token, expiresAt: cls.share.expiresAt }
      : null;
    return {
      id: cls.id,
      label: cls.label,
      code: cls.code,
      codeActive: active,
      codeExpiresAt: cls.codeExpiresAt,
      joinUrl: config.publicUrl + '/?class=' + cls.code,
      caseSetId: classes.caseSetOf(cls),
      soundMuted: cls.soundMuted,
      share,
    };
  }

  function summaryFor(cls, requested) {
    const caseSet = reportSet(cls, requested);
    return { caseSet, summary: Game.summarize(totalsFor(cls, caseSet), caseSet, QUESTIONS) };
  }

  const sessionCookie = (value, maxAge) => H.cookie('ad_session', value, { maxAge, secure: config.secureCookies });

  // ---- Routes ----------------------------------------------------------------
  // auth: 'public' or 'teacher'. Every teacher route is checked in one place
  // (handle() below) before its handler runs, and the tests walk this table.
  const routes = [
    { method: 'GET', path: '/api/health', auth: 'public', handler: (ctx) => H.sendJson(ctx.res, 200, { ok: true }) },

    { method: 'GET', path: '/api/join', auth: 'public', handler: (ctx) => {
      if (!allow('join:' + ctx.ip, config.rateLimits.join, 60000)) return H.sendJson(ctx.res, 429, { error: 'slow-down' });
      const found = classes.lookupCode(ctx.url.searchParams.get('code'));
      if (found.status !== 'ok') return H.sendJson(ctx.res, found.status === 'expired' ? 410 : 404, { error: 'code-' + found.status });
      // A set picked by the teacher, or every case file for the student to choose from.
      const fixed = classes.caseSetOf(found.cls);
      H.sendJson(ctx.res, 200, {
        class: { soundMuted: found.cls.soundMuted, caseSetId: fixed },
        caseSets: fixed ? [caseSets.get(fixed)] : caseSets.all(),
        defaultSetId: fixed || caseSets.defaultId,
      });
    } },

    { method: 'POST', path: '/api/events', auth: 'public', handler: async (ctx) => {
      if (!allow('events:' + ctx.ip, config.rateLimits.events, 60000)) return H.sendJson(ctx.res, 429, { error: 'slow-down' });
      const payload = await H.readJson(ctx.req);
      if (!sameKeys(payload, PAYLOAD_KEYS) || typeof payload.caseSetId !== 'string') return H.sendJson(ctx.res, 400, { error: 'invalid-event' });
      const found = classes.lookupCode(payload.classCode);
      if (found.status !== 'ok') return H.sendJson(ctx.res, found.status === 'expired' ? 410 : 404, { error: 'code-' + found.status });
      const fixed = classes.caseSetOf(found.cls);
      const set = caseSets.get(payload.caseSetId);
      if (!set || (fixed && payload.caseSetId !== fixed)) return H.sendJson(ctx.res, 409, { error: 'case-set-changed' });
      const totals = totalsFor(found.cls, set);
      if (!Game.applyEvent(totals, payload.event, set)) return H.sendJson(ctx.res, 400, { error: 'invalid-event' });
      store.totals.save();
      H.sendJson(ctx.res, 200, { ok: true });
    } },

    { method: 'GET', path: '/auth/providers', auth: 'public', handler: (ctx) => {
      H.sendJson(ctx.res, 200, {
        providers: auth.enabled().map((name) => ({ name, label: auth.providers[name].label })),
        teacherCode: Boolean(config.teacherCode),
      });
    } },

    { method: 'POST', path: '/auth/code', auth: 'public', handler: async (ctx) => {
      if (!H.sameOrigin(ctx.req, config)) return H.sendJson(ctx.res, 403, { error: 'cross-site' });
      if (!allow('code:' + ctx.ip, config.rateLimits.code, 15 * 60000)) return H.sendJson(ctx.res, 429, { error: 'slow-down' });
      const body = await H.readJson(ctx.req);
      const session = auth.codeSignIn(typeof body.code === 'string' ? body.code : '');
      if (!session) return H.sendJson(ctx.res, 401, { error: config.teacherCode ? 'wrong-code' : 'code-off' });
      ctx.res.setHeader('Set-Cookie', sessionCookie(session.id, config.sessionMaxHours * 3600));
      H.sendJson(ctx.res, 200, { ok: true });
    } },

    { method: 'GET', path: '/auth/:provider', auth: 'public', handler: (ctx) => {
      if (!allow('auth:' + ctx.ip, config.rateLimits.auth, 60000)) return H.sendJson(ctx.res, 429, { error: 'slow-down' });
      const started = auth.start(ctx.params.provider);
      if (!started) return H.sendJson(ctx.res, 404, { error: 'not-found' });
      H.redirect(ctx.res, started.url, [H.cookie('ad_login', started.state, { path: '/auth', maxAge: 600, secure: config.secureCookies })]);
    } },

    { method: 'GET', path: '/auth/:provider/callback', auth: 'public', handler: async (ctx) => {
      const clearLogin = H.cookie('ad_login', '', { path: '/auth', maxAge: 0, secure: config.secureCookies });
      if (!auth.providers[ctx.params.provider]) return H.sendJson(ctx.res, 404, { error: 'not-found' });
      const result = await auth.finish(ctx.params.provider, ctx.url.searchParams, ctx.cookies.ad_login);
      if (result.error) {
        console.warn('Teacher sign-in refused (' + ctx.params.provider + '): ' + result.reason);
        return H.redirect(ctx.res, '/sign-in?error=' + result.error, [clearLogin]);
      }
      H.redirect(ctx.res, '/teacher', [clearLogin, sessionCookie(result.session.id, config.sessionMaxHours * 3600)]);
    } },

    { method: 'POST', path: '/auth/sign-out', auth: 'public', handler: (ctx) => {
      if (!H.sameOrigin(ctx.req, config)) return H.sendJson(ctx.res, 403, { error: 'cross-site' });
      auth.signOut(ctx.cookies.ad_session);
      ctx.res.setHeader('Set-Cookie', sessionCookie('', 0));
      H.sendJson(ctx.res, 200, { ok: true });
    } },

    { method: 'GET', path: '/s/:token', auth: 'public', handler: (ctx) => {
      const cls = classes.byShareToken(ctx.params.token);
      if (!cls) return H.sendHtml(ctx.res, 404, '<!doctype html><title>Link expired</title><p>This results link has expired or was turned off.</p>');
      const { summary, caseSet } = summaryFor(cls, ctx.url.searchParams.get('set'));
      H.sendHtml(ctx.res, 200, renderSummaryPage({ summary, caseSet, label: cls.label, generatedAt: now(), shared: true }));
    } },

    { method: 'GET', path: '/sign-in', auth: 'public', handler: (ctx) => serveFile(ctx.res, path.join(config.root, 'sign-in.html'), ctx.req) },

    // ---- Teacher pages ----
    { method: 'GET', path: '/teacher', auth: 'teacher', page: true, handler: (ctx) => serveFile(ctx.res, path.join(config.root, 'teacher', 'index.html'), ctx.req) },
    { method: 'GET', path: '/teacher/summary/:id', auth: 'teacher', page: true, handler: (ctx) => {
      const cls = classes.ownedBy(ctx.session.email, ctx.params.id);
      if (!cls) return H.sendHtml(ctx.res, 404, '<!doctype html><title>Not found</title><p>Class not found.</p>');
      const { summary, caseSet } = summaryFor(cls, ctx.url.searchParams.get('set'));
      H.sendHtml(ctx.res, 200, renderSummaryPage({ summary, caseSet, label: cls.label, generatedAt: now(), shared: false }));
    } },
    { method: 'GET', path: '/teacher/:file', auth: 'teacher', page: true, handler: (ctx) => {
      if (!TEACHER_FILES.includes(ctx.params.file)) return H.sendJson(ctx.res, 404, { error: 'not-found' });
      serveFile(ctx.res, path.join(config.root, 'teacher', ctx.params.file), ctx.req);
    } },

    // ---- Teacher APIs ----
    { method: 'GET', path: '/api/teacher/me', auth: 'teacher', handler: (ctx) => {
      H.sendJson(ctx.res, 200, {
        email: ctx.session.provider === 'code' ? 'Teacher code' : maskEmail(ctx.session.email),
        idleMinutes: config.idleMinutes,
        supportUrl: config.supportUrl,
        plannerEnabled: config.ai.enabled,
        caseSets: caseSets.list(),
      });
    } },
    { method: 'GET', path: '/api/teacher/classes', auth: 'teacher', handler: (ctx) => {
      H.sendJson(ctx.res, 200, { classes: classes.listFor(ctx.session.email).map(classView) });
    } },
    { method: 'POST', path: '/api/teacher/classes', auth: 'teacher', handler: async (ctx) => {
      const body = await H.readJson(ctx.req);
      if (classes.listFor(ctx.session.email).length >= 20) return H.sendJson(ctx.res, 409, { error: 'too-many-classes' });
      H.sendJson(ctx.res, 201, { class: classView(classes.create(ctx.session.email, { label: body.label })) });
    } },
    { method: 'GET', path: '/api/teacher/classes/:id/report', auth: 'teacher', cls: true, handler: (ctx) => {
      const { summary, caseSet } = summaryFor(ctx.cls, ctx.url.searchParams.get('set'));
      const teaching = caseSet.rules === 'investigate'
        ? { pack: caseSet.pack, guide: caseSet.guide, standards: caseSet.standards, standardsNote: caseSet.standardsNote, cases: caseSet.cases.map((c) => ({ id: c.id, title: c.title })) }
        : null;
      H.sendJson(ctx.res, 200, {
        class: classView(ctx.cls),
        caseSet: { id: caseSet.id, title: caseSet.title, label: caseSet.label, rules: caseSet.rules, grade: caseSet.grade, count: caseSet.cases.length },
        sets: setsPlayed(ctx.cls),
        summary,
        teaching,
      });
    } },
    { method: 'POST', path: '/api/teacher/classes/:id/settings', auth: 'teacher', cls: true, handler: async (ctx) => {
      const body = await H.readJson(ctx.req);
      const changes = {};
      for (const key of ['caseSetId', 'soundMuted', 'label']) if (key in body) changes[key] = body[key];
      if (changes.caseSetId === '') changes.caseSetId = null;
      if (!classes.update(ctx.cls, changes)) return H.sendJson(ctx.res, 400, { error: 'invalid-settings' });
      H.sendJson(ctx.res, 200, { class: classView(ctx.cls) });
    } },
    { method: 'POST', path: '/api/teacher/classes/:id/reset-code', auth: 'teacher', cls: true, handler: (ctx) => {
      classes.resetCode(ctx.cls);
      H.sendJson(ctx.res, 200, { class: classView(ctx.cls) });
    } },
    { method: 'POST', path: '/api/teacher/classes/:id/expire-code', auth: 'teacher', cls: true, handler: async (ctx) => {
      const body = await H.readJson(ctx.req);
      if (![0, 7, 30, 90].includes(body.days)) return H.sendJson(ctx.res, 400, { error: 'invalid-days' });
      classes.expireCode(ctx.cls, body.days);
      H.sendJson(ctx.res, 200, { class: classView(ctx.cls) });
    } },
    { method: 'POST', path: '/api/teacher/classes/:id/share', auth: 'teacher', cls: true, handler: (ctx) => {
      classes.share(ctx.cls);
      H.sendJson(ctx.res, 200, { class: classView(ctx.cls) });
    } },
    { method: 'POST', path: '/api/teacher/classes/:id/unshare', auth: 'teacher', cls: true, handler: (ctx) => {
      classes.revokeShare(ctx.cls);
      H.sendJson(ctx.res, 200, { class: classView(ctx.cls) });
    } },
    { method: 'POST', path: '/api/teacher/classes/:id/plan', auth: 'teacher', cls: true, handler: async (ctx) => {
      const body = await H.readJson(ctx.req);
      const { summary, caseSet } = summaryFor(ctx.cls, body.caseSetId);
      const result = await planner.plan(ctx.session.email, summary, caseSet);
      H.sendJson(ctx.res, result.status, Object.assign({ budget: planner.budget() }, result.body));
    } },
    { method: 'GET', path: '/api/teacher/planner-budget', auth: 'teacher', handler: (ctx) => {
      H.sendJson(ctx.res, 200, Object.assign({ enabled: config.ai.enabled }, planner.budget()));
    } },
  ];

  for (const r of routes) {
    const names = [];
    const pattern = r.path.replace(/:(\w+)/g, (_, name) => {
      names.push(name);
      return '([^/]+)';
    });
    r.regex = new RegExp('^' + pattern + '$');
    r.names = names;
  }

  const isTeacherPath = (p) => p === '/teacher' || p.startsWith('/teacher/') || p.startsWith('/api/teacher');

  async function handle(req, res) {
    H.securityHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const ctx = { req, res, url, ip: H.clientIp(req, config), cookies: H.parseCookies(req), params: {} };

    let route = null;
    for (const r of routes) {
      const m = r.regex.exec(url.pathname);
      if (m && r.method === method) {
        route = r;
        try {
          r.names.forEach((n, i) => {
            ctx.params[n] = decodeURIComponent(m[i + 1]);
          });
        } catch (e) {
          return H.sendJson(res, 400, { error: 'bad-request' });
        }
        break;
      }
    }

    // Teacher area: checked before anything else, even for unknown paths.
    if ((route && route.auth === 'teacher') || (!route && isTeacherPath(url.pathname))) {
      const page = route ? route.page : !url.pathname.startsWith('/api/');
      const check = auth.check(ctx.cookies.ad_session);
      if (check.error) {
        const reason = check.error === 'not-approved' ? 'not-approved' : check.error;
        if (page) return H.redirect(res, '/sign-in?error=' + reason, check.error === 'signed-out' ? [] : [sessionCookie('', 0)]);
        return H.sendJson(res, check.error === 'not-approved' ? 403 : 401, { error: reason });
      }
      ctx.session = check.session;
      if (!route) return H.sendJson(res, 404, { error: 'not-found' });
      if (method !== 'GET' && !H.sameOrigin(req, config)) return H.sendJson(res, 403, { error: 'cross-site' });
      if (route.cls) {
        ctx.cls = classes.ownedBy(ctx.session.email, ctx.params.id);
        if (!ctx.cls) return H.sendJson(res, 404, { error: 'not-found' });
      }
      return route.handler(ctx);
    }

    if (route) return route.handler(ctx);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return H.sendJson(res, 404, { error: 'not-found' });
    if (method !== 'GET') return res.writeHead(405).end('Method not allowed');
    const file = publicFile(config.root, url.pathname);
    if (file === undefined) return res.writeHead(400).end('Bad request');
    if (!file) return res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    serveFile(res, file, req);
  }

  const server = http.createServer((req, res) => {
    Promise.resolve(handle(req, res)).catch((err) => {
      if (res.headersSent) return res.end();
      if (err && err.status) return H.sendJson(res, err.status, { error: 'bad-request' });
      console.error(err);
      H.sendJson(res, 500, { error: 'server-error' });
    });
  });
  server.routes = routes;
  return server;
}

if (require.main === module) {
  const config = loadConfig();
  if (!fs.existsSync(config.approvedTeachersFile)) {
    console.warn('No approved-teachers file at ' + config.approvedTeachersFile + '. Nobody can sign in as a teacher until you create it.');
  }
  createServer({ config }).listen(config.port, () => {
    console.log('AI Detective running at ' + config.publicUrl);
    console.log('Teacher sign-in: ' + config.publicUrl + '/sign-in');
  });
}

module.exports = { createServer };
