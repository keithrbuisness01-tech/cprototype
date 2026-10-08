const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../server.js');

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-detective-'));
  const dataFile = path.join(dir, 'totals.json');
  const server = createServer({ dataFile });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    await fn(base, dataFile);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const post = (base, body) =>
  fetch(base + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('events from several devices add up per class code', async () => {
  await withServer(async (base, dataFile) => {
    assert.deepEqual(await (await fetch(base + '/api/health')).json(), { ok: true });

    const ok = await post(base, { classCode: 'room12', event: { type: 'case', caseIndex: 2, correct: true, picks: ['A', 'B', 'C'] } });
    assert.equal(ok.status, 200);
    await post(base, { classCode: 'ROOM12', event: { type: 'case', caseIndex: 2, correct: false, picks: ['D', 'E', 'F'] } });
    await post(base, { classCode: 'other', event: { type: 'start' } });

    const room = await (await fetch(base + '/api/totals?class=room12')).json();
    assert.deepEqual(room.cases[2], { answered: 2, correct: 1 });
    const other = await (await fetch(base + '/api/totals?class=OTHER')).json();
    assert.equal(other.started, 1);
    assert.deepEqual(other.cases[2], { answered: 0, correct: 0 });

    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.deepEqual(Object.keys(saved).sort(), ['OTHER', 'ROOM12']);
  });
});

test('bad events are rejected', async () => {
  await withServer(async (base) => {
    assert.equal((await post(base, { classCode: 'X', event: { type: 'finish', score: 99 } })).status, 400);
    assert.equal((await post(base, null)).status, 400);
    const raw = await fetch(base + '/api/events', { method: 'POST', body: 'not json' });
    assert.equal(raw.status, 400);
    const big = await fetch(base + '/api/events', { method: 'POST', body: 'x'.repeat(10000) }).catch(() => null);
    assert.ok(!big || big.status === 400);
  });
});

test('serves the game but not the server code or data', async () => {
  await withServer(async (base) => {
    const index = await fetch(base + '/');
    assert.equal(index.status, 200);
    assert.match(await index.text(), /AI Detective/);
    assert.equal((await fetch(base + '/js/game.js')).status, 200);
    assert.equal((await fetch(base + '/server.js')).status, 404);
    assert.equal((await fetch(base + '/package.json')).status, 404);
    assert.equal((await fetch(base + '/js/..%2fserver.js')).status, 404);
    assert.equal((await fetch(base + '/js/%2e%2e/package.json')).status, 404);
    assert.equal((await fetch(base + '/js/%E0%A4%A')).status, 400);
  });
});
