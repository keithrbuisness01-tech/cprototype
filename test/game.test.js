const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../js/game.js');
const { QUESTIONS } = require('../js/casedata.js');
const GRADE7 = require('../cases/grade7.json');
const FALL = require('../cases/fall-2026.json');

// A seeded random source so shuffles are repeatable.
function seeded(seed) {
  let x = seed;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647);
}
const strongIndexes = (c) => c.checks.map((k, i) => (k.strong ? i : -1)).filter((i) => i >= 0);
const weakIndexes = (c) => c.checks.map((k, i) => (k.strong ? -1 : i)).filter((i) => i >= 0);

test('ranks follow the doc: 0-3 Rookie, 4-6 Detective, 7-8 Inspector, 9-10 Chief', () => {
  const expected = ['Rookie', 'Rookie', 'Rookie', 'Rookie', 'Detective', 'Detective', 'Detective', 'Inspector', 'Inspector', 'Chief', 'Chief'];
  expected.forEach((name, score) => assert.equal(Game.rankFor(score, 10).name, name, 'score ' + score));
  assert.deepEqual(Game.rankBands(10).map((b) => [b.name, b.from, b.to]), [['Rookie', 0, 3], ['Detective', 4, 6], ['Inspector', 7, 8], ['Chief', 9, 10]]);
  assert.deepEqual(Game.RANKS.map((r) => r.name), ['Rookie', 'Detective', 'Inspector', 'Chief']);
});

test('rank bands cover every score for other set sizes', () => {
  for (const total of [4, 8, 12, 20]) {
    const bands = Game.rankBands(total);
    assert.equal(bands[0].from, 0);
    assert.equal(bands[bands.length - 1].to, total);
    for (let i = 1; i < bands.length; i++) assert.equal(bands[i].from, bands[i - 1].to + 1, total + ' cases');
  }
});

test('a player picks exactly three distinct questions before guessing', () => {
  const run = Game.newRun(2);
  assert.equal(Game.guess(run, 'ai', 'ai'), null, 'cannot guess before picking');
  assert.ok(Game.pick(run, 'A'));
  assert.equal(Game.pick(run, 'A'), false, 'no repeats');
  assert.equal(Game.pick(run, 'Z'), false, 'no unknown questions');
  assert.ok(Game.pick(run, 'B'));
  assert.ok(Game.pick(run, 'F'));
  assert.equal(Game.pick(run, 'C'), false, 'only three');
  assert.ok(Game.readyToGuess(run));
  assert.equal(Game.guess(run, 'ai', 'maybe'), null);
  const result = Game.guess(run, 'ai', 'ai');
  assert.deepEqual(result, { index: 0, position: 0, picks: ['A', 'B', 'F'], guess: 'ai', correct: true });
  assert.equal(Game.guess(run, 'ai', 'person'), null, 'one guess per case');
  assert.deepEqual(Game.caseEvent(run, result), { type: 'case', caseIndex: 0, position: 0, picks: ['A', 'B', 'F'], guess: 'ai' }, 'the event carries no right or wrong');
});

test('scores count right verdicts for the player and wrong ones for Fib', () => {
  const run = Game.newRun(2);
  for (const [answer, g] of [['ai', 'ai'], ['person', 'ai']]) {
    ['A', 'B', 'C'].forEach((id) => Game.pick(run, id));
    Game.guess(run, answer, g);
    Game.next(run);
  }
  assert.ok(Game.isOver(run));
  assert.deepEqual(Game.scores(run), { player: 1, fib: 1 });
});

test('Play again shuffles the same ten cases', () => {
  const run = Game.newRun(GRADE7, { shuffled: true, random: seeded(7) });
  assert.equal(run.caseCount, 10);
  assert.deepEqual(run.order.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.notDeepEqual(run.order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(Game.newRun(GRADE7).order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'a first play keeps file order');
  // Results name the case played and where it fell in the run.
  ['A', 'B', 'C'].forEach((id) => Game.pick(run, id));
  const c = GRADE7.cases[run.order[0]];
  const result = Game.guess(run, c.verdict, c.verdict);
  assert.equal(result.index, run.order[0]);
  assert.equal(result.position, 0);
});

test('investigate scoring: strong checks earn points, lucky guesses feed Fib', () => {
  assert.deepEqual(Game.investigateScore(true, 2), { outcome: 'solved', you: 4, fib: 0 });
  assert.deepEqual(Game.investigateScore(true, 1), { outcome: 'solved', you: 3, fib: 0 });
  assert.deepEqual(Game.investigateScore(true, 0), { outcome: 'lucky', you: 1, fib: 1 });
  assert.deepEqual(Game.investigateScore(false, 2), { outcome: 'fooled', you: 0, fib: 2 });
  assert.deepEqual(Game.investigateScore(false, 0), { outcome: 'fooled', you: 0, fib: 2 });
});

test('a student opens at most two of four checks, then judges', () => {
  const run = Game.newRun(FALL);
  const c = FALL.cases[0];
  assert.equal(Game.openCheck(run, 4), false, 'no fifth check');
  assert.equal(Game.openCheck(run, -1), false);
  assert.equal(Game.openCheck(run, '1'), false);
  const [s1] = strongIndexes(c);
  const [w1] = weakIndexes(c);
  assert.ok(Game.openCheck(run, s1));
  assert.equal(Game.openCheck(run, s1), false, 'no repeats');
  assert.ok(Game.openCheck(run, w1));
  const third = [0, 1, 2, 3].find((i) => i !== s1 && i !== w1);
  assert.equal(Game.openCheck(run, third), false, 'only two');
  assert.equal(Game.judge(run, c, 'maybe'), null);
  const result = Game.judge(run, c, c.verdict);
  assert.equal(result.outcome, 'solved');
  assert.equal(result.you, 3);
  assert.equal(Game.judge(run, c, c.verdict), null, 'one verdict per case');
  assert.deepEqual(Game.caseEvent(run, result), { type: 'case', caseIndex: 0, position: 0, checks: [s1, w1], verdict: c.verdict });
});

test('judging with no checks, or only weak ones, is a lucky guess at best', () => {
  const c = FALL.cases[0];
  const run = Game.newRun(FALL);
  weakIndexes(c).slice(0, 2).forEach((i) => Game.openCheck(run, i));
  assert.equal(Game.judge(run, c, c.verdict).outcome, 'lucky');
  assert.deepEqual(Game.scores(run), { player: 1, fib: 1 });
  const run2 = Game.newRun(FALL);
  assert.equal(Game.judge(run2, c, c.verdict === 'trust' ? 'distrust' : 'trust').outcome, 'fooled');
  assert.deepEqual(Game.scores(run2), { player: 0, fib: 2 });
});

test('a choose case scores the plan', () => {
  const i = FALL.cases.findIndex((c) => c.kind === 'choose');
  const c = FALL.cases[i];
  const right = c.options.findIndex((o) => o.right);
  const wrong = c.options.findIndex((o) => !o.right);
  const run = Game.newRun(FALL);
  run.index = i;
  assert.equal(Game.choose(run, c, c.options.length), null);
  const result = Game.choose(run, c, right);
  assert.equal(result.outcome, 'good');
  assert.deepEqual(Game.caseEvent(run, result), { type: 'case', caseIndex: i, position: i, choice: right });
  const run2 = Game.newRun(FALL);
  run2.index = i;
  assert.equal(Game.choose(run2, c, wrong).outcome, 'bad');
  assert.deepEqual(Game.scores(run2), { player: 0, fib: 2 });
});

test('the best possible Fall 2026 run reaches the maximum points', () => {
  const run = Game.newRun(FALL);
  while (!Game.isOver(run)) {
    const c = FALL.cases[run.order[run.index]];
    if (c.kind === 'choose') Game.choose(run, c, c.options.findIndex((o) => o.right));
    else {
      strongIndexes(c).slice(0, 2).forEach((k) => Game.openCheck(run, k));
      Game.judge(run, c, c.verdict);
    }
    Game.next(run);
  }
  assert.equal(Game.scores(run).player, Game.maxPoints(FALL));
  assert.equal(Game.scores(run).fib, 0);
  assert.equal(Game.maxPoints(GRADE7), 10);
});

test('detective totals keep only counts and reject malformed or extra fields', () => {
  const t = Game.emptyTotals(GRADE7);
  const c0 = GRADE7.cases[0];
  const wrong0 = c0.verdict === 'ai' ? 'person' : 'ai';
  assert.ok(Game.applyEvent(t, { type: 'start' }, GRADE7));
  assert.ok(Game.applyEvent(t, { type: 'case', caseIndex: 0, position: 0, picks: ['A', 'B', 'C'], guess: c0.verdict }, GRADE7));
  assert.ok(Game.applyEvent(t, { type: 'case', caseIndex: 0, position: 4, picks: ['D', 'E', 'F'], guess: wrong0 }, GRADE7));
  assert.ok(Game.applyEvent(t, { type: 'finish', score: 7 }, GRADE7));

  const before = JSON.stringify(t);
  for (const bad of [
    null,
    [],
    { type: 'case', caseIndex: 10, position: 0, picks: [], guess: 'ai' },
    { type: 'case', caseIndex: 0, position: 10, picks: [], guess: 'ai' },
    { type: 'case', caseIndex: 0, position: 0, picks: [], guess: 'yes' },
    { type: 'case', caseIndex: 0, position: 0, picks: ['A', 'A'], guess: 'ai' },
    { type: 'case', caseIndex: 0, position: 0, picks: ['A', 'B', 'C', 'D'], guess: 'ai' },
    { type: 'case', caseIndex: 0, position: 0, picks: ['Q'], guess: 'ai' },
    { type: 'case', caseIndex: 0, position: 0, picks: ['A'], guess: 'ai', correct: true },
    { type: 'case', caseIndex: 0, position: 0, picks: ['A'], guess: 'ai', name: 'Sam' },
    { type: 'case', caseIndex: 0, position: 0, checks: [0], verdict: 'trust' },
    { type: 'finish', score: 11 },
    { type: 'finish', score: 2.5 },
    { type: 'finish', score: 5, pre: 1, post: 2 },
    { type: 'start', at: 123 },
    { type: 'name', name: 'Sam' },
  ]) {
    assert.equal(Game.applyEvent(t, bad, GRADE7), false, JSON.stringify(bad));
  }
  assert.equal(JSON.stringify(t), before, 'rejected events change nothing');

  assert.equal(t.started, 1);
  assert.equal(t.finished, 1);
  assert.deepEqual(t.cases[0], { answered: 2, correct: 1 }, 'the server decides right or wrong from the case file');
  assert.deepEqual(t.picks, { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 });
  assert.deepEqual(t.positions[0], { answered: 1, correct: 1 });
  assert.deepEqual(t.positions[4], { answered: 1, correct: 0 });
  assert.equal(t.scores[7], 1);
});

test('investigate totals count solved, lucky, checks and the warm-up quiz', () => {
  const t = Game.emptyTotals(FALL);
  const c = FALL.cases[0];
  const [s1] = strongIndexes(c);
  const [w1, w2] = weakIndexes(c);
  const wrong = c.verdict === 'trust' ? 'distrust' : 'trust';
  assert.ok(Game.applyEvent(t, { type: 'case', caseIndex: 0, position: 0, checks: [s1, w1], verdict: c.verdict }, FALL));
  assert.ok(Game.applyEvent(t, { type: 'case', caseIndex: 0, position: 1, checks: [w1, w2], verdict: c.verdict }, FALL));
  assert.ok(Game.applyEvent(t, { type: 'case', caseIndex: 0, position: 2, checks: [], verdict: wrong }, FALL));
  const ci = FALL.cases.findIndex((x) => x.kind === 'choose');
  assert.ok(Game.applyEvent(t, { type: 'case', caseIndex: ci, position: 5, choice: 1 }, FALL));
  assert.ok(Game.applyEvent(t, { type: 'finish', score: 12, pre: 1, post: 3 }, FALL));
  assert.ok(Game.applyEvent(t, { type: 'finish', score: 8, pre: 2, post: 2 }, FALL));
  assert.ok(Game.applyEvent(t, { type: 'finish', score: 8 }, FALL), 'a replay skips the quiz');

  const before = JSON.stringify(t);
  for (const bad of [
    { type: 'case', caseIndex: 0, position: 0, checks: [0, 1, 2], verdict: 'trust' },
    { type: 'case', caseIndex: 0, position: 0, checks: [0, 0], verdict: 'trust' },
    { type: 'case', caseIndex: 0, position: 0, checks: [4], verdict: 'trust' },
    { type: 'case', caseIndex: 0, position: 0, checks: [0], verdict: 'maybe' },
    { type: 'case', caseIndex: 0, position: 0, checks: [0], verdict: 'trust', strong: 1 },
    { type: 'case', caseIndex: 0, position: 0, picks: ['A'], guess: 'ai' },
    { type: 'case', caseIndex: 0, position: 0, choice: 0 },
    { type: 'case', caseIndex: ci, position: 0, choice: 9 },
    { type: 'case', caseIndex: ci, position: 0, checks: [0], verdict: 'trust' },
    { type: 'finish', score: Game.maxPoints(FALL) + 1 },
    { type: 'finish', score: 5, pre: 5, post: 1 },
    { type: 'finish', score: 5, pre: 1 },
    { type: 'finish', score: 5, pre: 1, post: 2, answers: [1, 2] },
  ]) {
    assert.equal(Game.applyEvent(t, bad, FALL), false, JSON.stringify(bad));
  }
  assert.equal(JSON.stringify(t), before, 'rejected events change nothing');

  assert.equal(t.cases[0].answered, 3);
  assert.equal(t.cases[0].correct, 2);
  assert.equal(t.cases[0].solved, 1);
  assert.equal(t.cases[0].lucky, 1);
  assert.equal(t.cases[0].opened[s1], 1);
  assert.equal(t.cases[0].opened[w1], 2);
  assert.deepEqual(t.checksOpened, { strong: 1, weak: 3 });
  assert.equal(t.cases[ci].choices[1], 1);
  assert.deepEqual(t.quiz.pre, [0, 1, 1, 0, 0]);
  assert.deepEqual(t.quiz.post, [0, 0, 1, 1, 0]);
  assert.equal(t.quiz.improved, 1);
  assert.equal(t.quiz.same, 1);
  assert.equal(t.finished, 3);
});

test('summarize compares first and last cases and suggests the hardest case', () => {
  const t = Game.emptyTotals(GRADE7);
  const answers = [
    // case index (also the position here), right?
    [0, false], [0, false], [1, true], [1, false], [2, true], [2, false],
    [7, true], [7, true], [8, true], [8, true], [9, true], [9, false],
  ];
  for (const [caseIndex, right] of answers) {
    const v = GRADE7.cases[caseIndex].verdict;
    Game.applyEvent(t, { type: 'case', caseIndex, position: caseIndex, picks: ['A', 'C', 'D'], guess: right ? v : v === 'ai' ? 'person' : 'ai' }, GRADE7);
  }
  Game.applyEvent(t, { type: 'finish', score: 4 }, GRADE7);
  Game.applyEvent(t, { type: 'finish', score: 9 }, GRADE7);

  const s = Game.summarize(t, GRADE7, QUESTIONS);
  assert.equal(s.rules, 'detective');
  assert.equal(s.early, 33);
  assert.equal(s.late, 83);
  assert.equal(s.averageScore, 6.5);
  assert.equal(s.maxScore, 10);
  assert.equal(s.suggestion.caseNumber, 1);
  assert.equal(s.suggestion.casePct, 0);
  assert.equal(s.suggestion.lesson, GRADE7.cases[0].lesson);
  assert.equal(s.suggestion.question.id, 'B', 'first question never picked');
  assert.deepEqual(s.rankCounts.map((r) => r.count), [0, 1, 0, 1]);
  assert.equal(s.perCase[3].pct, null, 'unplayed cases show no percentage');
  assert.deepEqual(s.fooledBy.map((c) => c.number), [1], 'only cases under half right (cases 2 and 3 are exactly 50%)');
  assert.equal(s.skipped.find((q) => q.id === 'B').pct, 100, 'B was never asked');
  assert.equal(s.skipped.find((q) => q.id === 'A').pct, 0, 'A was asked every time');
});

test('the trend follows the order students played, not the file order', () => {
  const t = Game.emptyTotals(GRADE7);
  // Case 9 played first and missed; case 0 played last and right.
  const c9 = GRADE7.cases[9];
  const c0 = GRADE7.cases[0];
  Game.applyEvent(t, { type: 'case', caseIndex: 9, position: 0, picks: [], guess: c9.verdict === 'ai' ? 'person' : 'ai' }, GRADE7);
  Game.applyEvent(t, { type: 'case', caseIndex: 0, position: 9, picks: [], guess: c0.verdict }, GRADE7);
  const s = Game.summarize(t, GRADE7, QUESTIONS);
  assert.equal(s.early, 0);
  assert.equal(s.late, 100);
});

test('investigate summary reports strong checks, lucky guesses and quiz change', () => {
  const t = Game.emptyTotals(FALL);
  const c = FALL.cases[0];
  const [s1] = strongIndexes(c);
  const [w1, w2] = weakIndexes(c);
  Game.applyEvent(t, { type: 'case', caseIndex: 0, position: 0, checks: [s1, w1], verdict: c.verdict }, FALL);
  Game.applyEvent(t, { type: 'case', caseIndex: 0, position: 0, checks: [w1, w2], verdict: c.verdict }, FALL);
  Game.applyEvent(t, { type: 'case', caseIndex: 0, position: 0, checks: [w1, w2], verdict: c.verdict }, FALL);
  Game.applyEvent(t, { type: 'finish', score: 10, pre: 1, post: 3 }, FALL);
  Game.applyEvent(t, { type: 'finish', score: 6, pre: 2, post: 1 }, FALL);
  const s = Game.summarize(t, FALL, QUESTIONS);
  assert.equal(s.rules, 'investigate');
  assert.equal(s.maxScore, Game.maxPoints(FALL));
  assert.equal(s.strongShare, 17, '1 of 6 checks opened was strong');
  assert.equal(s.luckyPct, 67, '2 of 3 right verdicts were lucky');
  assert.equal(s.perCase[0].solvedPct, 33);
  assert.equal(s.perCase[0].luckyPct, 67);
  assert.equal(s.perCase[0].skill, c.skill);
  assert.equal(s.perCase[0].checks.length, 4);
  assert.deepEqual(
    { length: s.quiz.length, runs: s.quiz.runs, preAvg: s.quiz.preAvg, postAvg: s.quiz.postAvg, improvedPct: s.quiz.improvedPct, droppedPct: s.quiz.droppedPct },
    { length: 4, runs: 2, preAvg: 1.5, postAvg: 2, improvedPct: 50, droppedPct: 50 }
  );
  assert.equal(s.picks, undefined, 'no question picks in this pack');
});

test('summarize with no data has no suggestion', () => {
  for (const set of [GRADE7, FALL]) {
    const s = Game.summarize(Game.emptyTotals(set), set, QUESTIONS);
    assert.equal(s.answered, 0);
    assert.equal(s.suggestion, null);
    assert.equal(s.averageScore, null);
  }
});
