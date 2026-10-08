// Optional classroom server. Serves the game and keeps anonymous class totals
// so every student device using the same class code adds to one report.
// No dependencies: `node server.js` (PORT and DATA_FILE env vars are optional).
const http = require('http');
const fs = require('fs');
const path = require('path');
const Game = require('./js/game.js');
const { CASES } = require('./js/cases.js');

const ROOT = __dirname;
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'totals.json');
const MAX_BODY = 4 * 1024;
const MAX_CLASSES = 1000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
// Only the game's own files are served; never server.js, data/ or tests.
const STATIC_DIRS = ['css', 'js', 'assets'];

function normalizeClassCode(code) {
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
  return clean || 'MY-CLASS';
}

function loadTotals(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveTotals(file, all) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(all));
  fs.renameSync(tmp, file);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (e) {
    res.writeHead(400).end('Bad request');
    return;
  }
  // Check the path after resolving "..", so encoded tricks can't escape.
  const file = path.resolve(ROOT, '.' + path.sep + (decoded.replace(/^\/+/, '') || 'index.html'));
  const rel = path.relative(ROOT, file).split(path.sep);
  const allowed = (rel.length === 1 && rel[0] === 'index.html') ||
    (rel.length > 1 && STATIC_DIRS.includes(rel[0]));
  if (!allowed) {
    res.writeHead(404).end('Not found');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

function createServer({ dataFile = DATA_FILE } = {}) {
  const all = loadTotals(dataFile);

  function totalsFor(code) {
    const existing = all[code];
    if (existing && Array.isArray(existing.cases) && existing.cases.length === CASES.length) return existing;
    return Game.emptyTotals(CASES.length);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/health') {
        sendJson(res, 200, { ok: true });
      } else if (url.pathname === '/api/totals' && req.method === 'GET') {
        sendJson(res, 200, totalsFor(normalizeClassCode(url.searchParams.get('class'))));
      } else if (url.pathname === '/api/events' && req.method === 'POST') {
        let payload;
        try {
          payload = JSON.parse(await readBody(req));
        } catch (e) {
          sendJson(res, 400, { error: 'Bad request' });
          return;
        }
        const code = normalizeClassCode(payload && payload.classCode);
        if (!all[code] && Object.keys(all).length >= MAX_CLASSES) {
          sendJson(res, 507, { error: 'Too many class codes' });
          return;
        }
        const totals = totalsFor(code);
        if (!Game.applyEvent(totals, payload && payload.event)) {
          sendJson(res, 400, { error: 'Invalid event' });
          return;
        }
        all[code] = totals;
        saveTotals(dataFile, all);
        sendJson(res, 200, { ok: true });
      } else if (url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Not found' });
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        serveStatic(req, res, url.pathname);
      } else {
        res.writeHead(405).end('Method not allowed');
      }
    } catch (err) {
      sendJson(res, 500, { error: 'Server error' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  createServer().listen(port, () => {
    console.log('AI Detective running at http://localhost:' + port);
    console.log('Class report: http://localhost:' + port + '/#report');
  });
}

module.exports = { createServer, normalizeClassCode };
