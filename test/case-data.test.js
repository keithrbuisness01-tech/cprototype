const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateCaseSet, QUESTIONS, ITEM_KINDS } = require('../js/casedata.js');
const { loadCaseSets } = require('../lib/case-sets.js');

const DIR = path.join(__dirname, '..', 'cases');
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'sets.json'), 'utf8'));
const core = JSON.parse(fs.readFileSync(path.join(DIR, 'grade6-core.json'), 'utf8'));

test('the six detective questions are fixed, in order', () => {
  assert.deepEqual(QUESTIONS.map((q) => q.id + ' ' + q.text), [
    'A Who shared it?',
    'B Can I find it anywhere else?',
    'C Do the small details hold up?',
    'D Does it include things only someone who was there would know?',
    'E What happens when I ask a follow-up?',
    'F Is there a label saying how it was made?',
  ]);
});

test('every listed case set passes the rules', () => {
  for (const entry of index.sets) {
    const set = JSON.parse(fs.readFileSync(path.join(DIR, entry.file), 'utf8'));
    assert.deepEqual(validateCaseSet(set), [], entry.file);
    assert.equal(set.grade, entry.grade, entry.file + ' grade matches sets.json');
  }
  assert.doesNotThrow(() => loadCaseSets(DIR));
});

test('year one is one grade level: sixth grade', () => {
  assert.deepEqual([...new Set(index.sets.map((s) => s.grade))], [6]);
  assert.equal(core.grade, 6);
  assert.ok(core.cases.every((c) => c.grade === 6));
});

test('the core set is half real, half AI, with no answer pattern', () => {
  const answers = core.cases.map((c) => c.verdict);
  assert.equal(answers.filter((a) => a === 'ai').length, core.cases.length / 2);
  assert.equal(answers.every((a, i) => i === 0 || a !== answers[i - 1]), false, 'answers must not simply alternate');
  let run = 1;
  for (let i = 1; i < answers.length; i++) {
    run = answers[i] === answers[i - 1] ? run + 1 : 1;
    assert.ok(run <= 2, 'no more than two of the same answer in a row');
  }
});

test('the validator catches broken case files', () => {
  const broken = (change) => {
    const set = JSON.parse(JSON.stringify(core));
    change(set);
    return validateCaseSet(set);
  };
  assert.match(broken((s) => delete s.cases[0].clues.F).join(), /clues/);
  assert.match(broken((s) => (s.cases[0].verdict = 'robot')).join(), /verdict/);
  assert.match(broken((s) => (s.cases[0].item.kind = 'hologram')).join(), /item/);
  assert.match(broken((s) => (s.cases[0].fib = { right: 'Hm.' })).join(), /fib/);
  assert.match(broken((s) => (s.cases[0].answr = 'ai')).join(), /unknown fields: answr/);
  assert.match(broken((s) => (s.cases[1].id = s.cases[0].id)).join(), /used twice/);
  assert.match(broken((s) => (s.cases[0].grade = 7)).join(), /grade/);
  assert.match(broken((s) => s.cases.forEach((c) => (c.verdict = 'ai'))).join(), /About half/);
  assert.ok(ITEM_KINDS.includes('homework answer') && ITEM_KINDS.includes('photo'));
});

test('the server refuses to start with a broken case file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cases-'));
  try {
    const bad = JSON.parse(JSON.stringify(core));
    delete bad.cases[2].lesson;
    fs.writeFileSync(path.join(dir, 'sets.json'), JSON.stringify(index));
    fs.writeFileSync(path.join(dir, 'grade6-core.json'), JSON.stringify(bad));
    assert.throws(() => loadCaseSets(dir), /lesson/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
