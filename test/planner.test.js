// The AI lesson planner: server-side only, anonymous totals only, and a
// monthly spending cap. Uses a fake Claude client, so no real calls are made.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startApp, googleTeacher } = require('./helpers.js');
const { worstCaseUsd, MODEL } = require('../lib/planner.js');

function fakeClaude(reply) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        async create(params) {
          calls.push(params);
          return typeof reply === 'function' ? reply(params, calls.length) : reply;
        },
      },
    },
  };
}

const okReply = { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Goal\nSpot copied content.' }], usage: { input_tokens: 1200, output_tokens: 900 } };

async function setup({ env = {}, reply = okReply, now } = {}) {
  const claude = fakeClaude(reply);
  const app = await startApp({ env: Object.assign({ ANTHROPIC_API_KEY: 'test-key' }, env), anthropicClient: claude, now });
  const { cookie } = await app.signIn('google', googleTeacher('teacher@school.org'));
  const cls = (await (await app.api('/api/teacher/classes', { cookie, method: 'POST', body: { label: 'Ms Rivera period 3' } })).json()).class;
  const play = async () => {
    for (const [caseIndex, correct] of [[0, false], [1, true], [2, false]]) {
      await fetch(app.base + '/api/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ classCode: cls.code, caseSetId: 'grade6-core', event: { type: 'case', caseIndex, correct, picks: ['A', 'C', 'D'] } }),
      });
    }
  };
  const plan = () => app.api('/api/teacher/classes/' + cls.id + '/plan', { cookie, method: 'POST', body: {} });
  return { app, claude, cookie, cls, play, plan };
}

test('without an API key the planner is off', async () => {
  const app = await startApp();
  try {
    const { cookie } = await app.signIn('google', googleTeacher('teacher@school.org'));
    const cls = (await (await app.api('/api/teacher/classes', { cookie, method: 'POST', body: {} })).json()).class;
    const res = await app.api('/api/teacher/classes/' + cls.id + '/plan', { cookie, method: 'POST', body: {} });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'planner-off');
  } finally {
    await app.close();
  }
});

test('Claude receives anonymous class totals and nothing about people', async () => {
  const s = await setup();
  try {
    assert.equal((await s.plan()).status, 409, 'nothing to plan from before the class plays');
    assert.equal(s.claude.calls.length, 0);
    await s.play();
    const res = await s.plan();
    assert.equal(res.status, 200);
    assert.equal((await res.json()).plan, 'Goal\nSpot copied content.');

    const req = s.claude.calls[0];
    assert.equal(req.model, MODEL);
    assert.equal(req.model, 'claude-opus-5-5');
    assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
    assert.equal(req.fallbacks, 'default');
    assert.equal(req.thinking, undefined, 'adaptive thinking is the default on this model');
    const sent = JSON.stringify(req);
    for (const secret of ['teacher@school.org', 't•••r', 'Ms Rivera', 'period 3', s.cls.code, s.cls.id, 'test-key']) {
      assert.equal(sent.includes(secret), false, 'request must not contain ' + secret);
    }
    const json = JSON.parse(req.messages[0].content.match(/\{[\s\S]*\}/)[0]);
    assert.deepEqual(Object.keys(json).sort(), ['averageScoreOutOf10', 'caseSet', 'cases', 'grade', 'percentRightFirstCases', 'percentRightLastCases', 'questions', 'studentsFinished', 'studentsStarted']);
    assert.equal(json.grade, 6);
    assert.deepEqual(Object.keys(json.cases[0]).sort(), ['answer', 'itemKind', 'lesson', 'number', 'percentRight', 'timesAnswered', 'title']);
    assert.deepEqual(Object.keys(json.questions[0]).sort(), ['letter', 'percentOfCasesSkipped', 'question', 'shareOfAllPicksPercent']);
  } finally {
    await s.app.close();
  }
});

test('the API key never reaches the browser', async () => {
  const s = await setup();
  try {
    for (const p of ['/api/teacher/me', '/api/teacher/planner-budget', '/teacher', '/teacher/teacher.js', '/']) {
      const text = await (await s.app.api(p, { cookie: s.cookie })).text();
      assert.equal(text.includes('test-key'), false, p);
    }
  } finally {
    await s.app.close();
  }
});

test('spending is recorded per month from real usage', async () => {
  const s = await setup();
  try {
    await s.play();
    await s.plan();
    const budget = await (await s.app.api('/api/teacher/planner-budget', { cookie: s.cookie })).json();
    assert.equal(budget.capUsd, 20, 'default cap');
    const month = budget.month;
    const saved = JSON.parse(fs.readFileSync(path.join(s.app.dir, 'data', 'ai-spend.json'), 'utf8'));
    assert.ok(Math.abs(saved[month].usd - (1200 * 4 + 900 * 20) / 1e6) < 1e-9);
    assert.equal(saved[month].calls, 1);
  } finally {
    await s.app.close();
  }
});

test('the monthly cap stops calls before they are made', async () => {
  // A cap below one worst-case call: refused without calling Claude.
  const tiny = await setup({ env: { AI_MONTHLY_CAP_USD: '0.3' } });
  try {
    await tiny.play();
    const res = await tiny.plan();
    assert.equal(res.status, 402);
    assert.equal((await res.json()).error, 'budget-reached');
    assert.equal(tiny.claude.calls.length, 0);
  } finally {
    await tiny.app.close();
  }

  // Expensive calls (refused attempt plus fallback, both at full length) use
  // up a $1 cap after two calls; the third is refused.
  const heavy = { model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Plan' }],
    usage: { input_tokens: 1000, output_tokens: 8000, iterations: [
      { type: 'message', input_tokens: 1000, output_tokens: 8000 },
      { type: 'fallback_message', input_tokens: 1000, output_tokens: 8000 },
    ] } };
  const s = await setup({ env: { AI_MONTHLY_CAP_USD: '1' }, reply: heavy });
  try {
    await s.play();
    assert.equal((await s.plan()).status, 200);
    assert.equal((await s.plan()).status, 200);
    const third = await s.plan();
    assert.equal(third.status, 402);
    assert.equal(s.claude.calls.length, 2);
    const budget = (await third.json()).budget;
    assert.ok(budget.usedUsd <= 1, 'never above the cap');
  } finally {
    await s.app.close();
  }
  assert.ok(worstCaseUsd(1000) >= 2 * (1000 * 5 + 8000 * 25) / 1e6, 'worst case covers two attempts at the higher rate');
});

test('refusals and errors are reported plainly and charged conservatively', async () => {
  const s = await setup({ reply: (params, n) => {
    if (n === 1) return { model: 'claude-opus-5-5', stop_reason: 'refusal', content: [], usage: { input_tokens: 1000, output_tokens: 0 } };
    if (n === 2) throw Object.assign(new Error('overloaded'), { status: 529 });
    throw new Error('socket hang up');
  } });
  try {
    await s.play();
    const refused = await s.plan();
    assert.equal(refused.status, 502);
    assert.equal((await refused.json()).error, 'declined');
    const httpError = await s.plan();
    assert.equal((await httpError.json()).error, 'api-error');
    const afterHttp = await (await s.app.api('/api/teacher/planner-budget', { cookie: s.cookie })).json();
    const dropped = await s.plan();
    assert.equal(dropped.status, 502);
    const afterDrop = await (await s.app.api('/api/teacher/planner-budget', { cookie: s.cookie })).json();
    assert.ok(afterDrop.usedUsd > afterHttp.usedUsd, 'a dropped connection counts as the worst case');
  } finally {
    await s.app.close();
  }
});

test('one plan at a time per teacher', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const s = await setup({ reply: async () => {
    await gate;
    return okReply;
  } });
  try {
    await s.play();
    const first = s.plan();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await s.plan()).status, 429);
    release();
    assert.equal((await first).status, 200);
  } finally {
    await s.app.close();
  }
});

test('the budget resets each month', async () => {
  const { plannerService } = require('../lib/planner.js');
  let clock = Date.UTC(2026, 9, 30, 12);
  const store = { spend: { data: {}, save() {} } };
  const config = { ai: { enabled: true, monthlyCapUsd: 20 } };
  const planner = plannerService(store, config, { client: fakeClaude(okReply), now: () => clock });
  const summary = { answered: 3, started: 1, finished: 0, averageScore: null, early: 0, late: null,
    perCase: [{ number: 1, title: 'T', kind: 'photo', verdict: 'ai', lesson: 'L', answered: 3, pct: 0 }],
    picks: [{ id: 'A', text: 'Who shared it?', pct: 100 }], skipped: [{ id: 'A', pct: 0 }] };
  assert.equal((await planner.plan('t@school.org', summary, { grade: 6, title: 'Grade 6 core cases' })).status, 200);
  assert.equal(planner.budget().month, '2026-10');
  assert.ok(planner.budget().usedUsd > 0);
  clock = Date.UTC(2026, 10, 1, 8);
  assert.equal(planner.budget().month, '2026-11');
  assert.equal(planner.budget().usedUsd, 0);
});
