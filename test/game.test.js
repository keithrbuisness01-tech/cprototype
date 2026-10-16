const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../js/game.js');
const { QUESTIONS } = require('../js/casedata.js');
const { cases: CASES } = require('../cases/grade6-core.json');

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
  assert.deepEqual(result, { index: 0, picks: ['A', 'B', 'F'], guess: 'ai', correct: true });
  assert.equal(Game.guess(run, 'ai', 'person'), null, 'one guess per case');
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

test('applyEvent keeps only counts and rejects malformed events', () => {
  const t = Game.emptyTotals(10);
  assert.ok(Game.applyEvent(t, { type: 'start' }));
  assert.ok(Game.applyEvent(t, { type: 'case', caseIndex: 0, correct: true, picks: ['A', 'B', 'C'] }));
  assert.ok(Game.applyEvent(t, { type: 'case', caseIndex: 0, correct: false, picks: ['D', 'E', 'F'] }));
  assert.ok(Game.applyEvent(t, { type: 'finish', score: 7 }));

  const before = JSON.stringify(t);
  for (const bad of [
    null,
    { type: 'case', caseIndex: 10, correct: true, picks: [] },
    { type: 'case', caseIndex: 0, correct: 'yes', picks: [] },
    { type: 'case', caseIndex: 0, correct: true, picks: ['A', 'A'] },
    { type: 'case', caseIndex: 0, correct: true, picks: ['A', 'B', 'C', 'D'] },
    { type: 'case', caseIndex: 0, correct: true, picks: ['Q'] },
    { type: 'finish', score: 11 },
    { type: 'finish', score: 2.5 },
    { type: 'name', name: 'Sam' },
  ]) {
    assert.equal(Game.applyEvent(t, bad), false, JSON.stringify(bad));
  }
  assert.equal(JSON.stringify(t), before, 'rejected events change nothing');

  assert.equal(t.started, 1);
  assert.equal(t.finished, 1);
  assert.deepEqual(t.cases[0], { answered: 2, correct: 1 });
  assert.deepEqual(t.picks, { A: 1, B: 1, C: 1, D: 1, E: 1, F: 1 });
  assert.equal(t.scores[7], 1);
});

test('summarize compares first and last cases and suggests the hardest case', () => {
  const t = Game.emptyTotals(10);
  const answers = [
    // case index, correct
    [0, false], [0, false], [1, true], [1, false], [2, true], [2, false],
    [7, true], [7, true], [8, true], [8, true], [9, true], [9, false],
  ];
  for (const [caseIndex, correct] of answers) {
    Game.applyEvent(t, { type: 'case', caseIndex, correct, picks: ['A', 'C', 'D'] });
  }
  Game.applyEvent(t, { type: 'finish', score: 4 });
  Game.applyEvent(t, { type: 'finish', score: 9 });

  const s = Game.summarize(t, CASES, QUESTIONS);
  assert.equal(s.early, 33);
  assert.equal(s.late, 83);
  assert.equal(s.averageScore, 6.5);
  assert.equal(s.suggestion.caseNumber, 1);
  assert.equal(s.suggestion.casePct, 0);
  assert.equal(s.suggestion.lesson, CASES[0].lesson);
  assert.equal(s.suggestion.question.id, 'B', 'first question never picked');
  assert.deepEqual(s.rankCounts.map((r) => r.count), [0, 1, 0, 1]);
  assert.equal(s.perCase[3].pct, null, 'unplayed cases show no percentage');
  assert.deepEqual(s.fooledBy.map((c) => c.number), [1], 'only cases under half right (cases 2 and 3 are exactly 50%)');
  assert.equal(s.skipped.find((q) => q.id === 'B').pct, 100, 'B was never asked');
  assert.equal(s.skipped.find((q) => q.id === 'A').pct, 0, 'A was asked every time');
});

test('summarize with no data has no suggestion', () => {
  const s = Game.summarize(Game.emptyTotals(10), CASES, QUESTIONS);
  assert.equal(s.answered, 0);
  assert.equal(s.suggestion, null);
  assert.equal(s.averageScore, null);
});
