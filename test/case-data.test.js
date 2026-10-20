const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { validateCaseSet, QUESTIONS } = require('../js/casedata.js');
const { loadCaseSets } = require('../lib/case-sets.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'cases');
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'sets.json'), 'utf8'));
const load = (id) => JSON.parse(fs.readFileSync(path.join(DIR, index.sets.find((s) => s.id === id).file), 'utf8'));

// Reads a named array literal from a reference page's script, evaluating only
// that literal in an empty sandbox.
function referenceArray(file, name) {
  const src = fs.readFileSync(path.join(ROOT, 'reference', file), 'utf8');
  const start = src.indexOf('const ' + name + ' = [');
  const end = src.indexOf('\n];', start);
  const sandbox = { sharkPhoto: '[[sharkPhoto]]', quotePoster: '[[quotePoster]]' };
  // Round-trip through JSON so the objects belong to this realm for deepEqual.
  return JSON.parse(JSON.stringify(vm.runInNewContext('(' + src.slice(src.indexOf('[', start), end + 2) + ')', sandbox, { timeout: 1000 })));
}

// Reads a shared template snippet (const name = `...`;) from a reference page.
function referenceSnippet(file, name) {
  const src = fs.readFileSync(path.join(ROOT, 'reference', file), 'utf8');
  const start = src.indexOf('const ' + name + ' = `') + ('const ' + name + ' = `').length;
  return src.slice(start, src.indexOf('`', start));
}

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

test('every listed case file passes the rules and loads', () => {
  for (const entry of index.sets) {
    const set = load(entry.id);
    assert.deepEqual(validateCaseSet(set), [], entry.file);
    assert.equal(set.id, entry.id);
    assert.equal(set.rules, entry.rules, entry.file + ' rules match sets.json');
    assert.equal(set.grade, entry.grade, entry.file + ' grade matches sets.json');
  }
  const loaded = loadCaseSets(DIR);
  assert.deepEqual(loaded.list().map((s) => s.id), ['fall-2026', 'warmup', 'grade6', 'grade7', 'grade8', 'grade6-core']);
  assert.equal(loaded.defaultId, 'fall-2026');
});

const GRADE_FILES = [['WARMUP', 'warmup', 'Warm-up', null], ['GRADE6', 'grade6', 'Grade 6', 6], ['GRADE7', 'grade7', 'Grade 7', 7], ['GRADE8', 'grade8', 'Grade 8', 8]];

test('all 40 grade-level cases load: 10 per set, 5 Person and 5 AI', () => {
  let total = 0;
  for (const [, id, label, grade] of GRADE_FILES) {
    const set = load(id);
    assert.equal(set.label, label);
    assert.equal(set.grade, grade);
    assert.equal(set.cases.length, 10, id);
    assert.equal(set.cases.filter((c) => c.verdict === 'person').length, 5, id + ' Person');
    assert.equal(set.cases.filter((c) => c.verdict === 'ai').length, 5, id + ' AI');
    total += set.cases.length;
  }
  assert.equal(total, 40);
});

test('the 40 cases match reference/ai-detective-demo.html exactly, curly quotes and all', () => {
  for (const [name, id] of GRADE_FILES) {
    const ref = referenceArray('ai-detective-demo.html', name);
    const set = load(id);
    assert.equal(set.cases.length, ref.length, id);
    ref.forEach((r, i) => {
      const c = set.cases[i];
      const where = id + ' case ' + (i + 1);
      assert.equal(c.title, r.title, where + ' title');
      assert.equal(c.item.kind, r.kind, where + ' kind');
      assert.equal(c.item.description, r.item, where + ' item');
      assert.equal(c.verdict, r.answer, where + ' answer');
      assert.deepEqual(c.clues, r.clues, where + ' clues');
      assert.equal(c.lesson, r.lesson, where + ' lesson');
      assert.equal(c.fib.right, r.right, where + ' Fib right');
      assert.equal(c.fib.wrong, r.wrong, where + ' Fib wrong');
    });
  }
  // Spot-check that curly punctuation survived rather than being straightened.
  const all = JSON.stringify(GRADE_FILES.map(([, id]) => load(id)));
  assert.ok(all.includes('’') && all.includes('“') && all.includes('”'));
  assert.ok(load('warmup').cases[0].clues.A.includes('dog’s owner'));
});

test('the Fall 2026 pack matches reference/ai-detective-fall-2026.html', () => {
  const ref = referenceArray('ai-detective-fall-2026.html', 'CASES');
  const quiz = referenceArray('ai-detective-fall-2026.html', 'CHECK');
  const pack = load('fall-2026');
  assert.equal(pack.pack, 'Fall 2026');
  assert.equal(pack.cases.length, 6);
  ref.forEach((r, i) => {
    const c = pack.cases[i];
    assert.equal(c.title, r.title.replace(/^Case \d+: /, ''));
    assert.equal(c.kind, r.kind);
    assert.equal(c.fib.taunt, r.fib);
    assert.equal(c.fib.neutral, r.neutral);
    assert.equal(c.explain, r.explain);
    assert.equal(c.skill, r.skill);
    if (r.kind === 'investigate') {
      assert.deepEqual(c.checks, r.clues.map((k) => ({ label: k.label, result: k.result, strong: k.strong })));
      assert.equal(c.verdict, r.answer === 'yes' ? 'trust' : 'distrust');
    } else {
      assert.deepEqual(c.options, r.options);
    }
    // Every piece of evidence text comes from the reference evidence, with the
    // shared shark photo and quote poster snippets filled in from their source.
    const refHtml = r.evidence.replace(/\[\[(\w+)\]\]/g, (_, name) => referenceSnippet('ai-detective-fall-2026.html', name));
    const refText = refHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const strings = [];
    const walk = (v, key) => {
      if (typeof v === 'string') { if (!['type', 'src', 'from'].includes(key)) strings.push([key, v]); }
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, Array.isArray(v) ? key : k);
    };
    walk(c.evidence);
    assert.ok(strings.length >= 2, c.id + ' has evidence text');
    for (const [key, v] of strings) {
      const inRef = key === 'alt' ? refHtml.includes('aria-label="' + v + '"') : refText.includes(v);
      assert.ok(inRef, c.id + ' ' + key + ': "' + v + '" is in the reference');
    }
  });
  assert.deepEqual(pack.checkQuiz, quiz.map((q) => ({ question: q.q, options: q.o, answer: q.a })));
});

test('the Fall 2026 pack follows its rules', () => {
  const pack = load('fall-2026');
  const investigate = pack.cases.filter((c) => c.kind === 'investigate');
  assert.equal(investigate.length, 5);
  assert.equal(pack.cases.filter((c) => c.kind === 'choose').length, 1, 'one responsible-use scenario');
  assert.equal(investigate.filter((c) => c.verdict === 'trust').length, 1, 'one true case');
  for (const c of investigate) {
    assert.equal(c.checks.length, 4);
    assert.ok(c.checks.some((k) => k.strong) && c.checks.some((k) => !k.strong), c.id);
  }
  assert.equal(pack.checkQuiz.length, 4, 'four warm-up and wrap-up questions');
  assert.equal(pack.discussion.length, 3);
  assert.deepEqual(pack.standards.map((s) => s.code), ['RI.{grade}.8', 'W.{grade}.8', 'SL.{grade}.2', 'W.{grade}.4 / W.{grade}.10']);
  // No case asks students to judge a classmate's writing.
  for (const c of pack.cases) assert.doesNotMatch(JSON.stringify(c.evidence), /classmate/i, c.id);
});

test('the classic set keeps its no-pattern answer order', () => {
  const answers = load('grade6-core').cases.map((c) => c.verdict);
  assert.equal(answers.every((a, i) => i === 0 || a !== answers[i - 1]), false);
});

test('the validator catches broken case files', () => {
  const broken = (id, change) => {
    const set = JSON.parse(JSON.stringify(load(id)));
    change(set);
    return validateCaseSet(set).join(' ');
  };
  assert.match(broken('grade7', (s) => delete s.cases[0].clues.F), /clues/);
  assert.match(broken('grade7', (s) => (s.cases[0].verdict = 'robot')), /verdict/);
  assert.match(broken('grade7', (s) => (s.cases[0].item.kind = '')), /item/);
  assert.match(broken('grade7', (s) => (s.cases[0].fib = { right: 'Hm.' })), /fib/);
  assert.match(broken('grade7', (s) => (s.cases[0].answr = 'ai')), /unknown fields: answr/);
  assert.match(broken('grade7', (s) => (s.cases[1].id = s.cases[0].id)), /used twice/);
  assert.match(broken('grade7', (s) => (s.cases[0].grade = 8)), /grade/);
  assert.match(broken('grade7', (s) => s.cases.forEach((c) => (c.verdict = 'ai'))), /About half/);
  assert.match(broken('fall-2026', (s) => s.cases[0].checks.pop()), /exactly 4 checks/);
  assert.match(broken('fall-2026', (s) => s.cases[0].checks.forEach((k) => (k.strong = true))), /one strong and one weak/);
  assert.match(broken('fall-2026', (s) => (s.cases[2].verdict = 'distrust')), /At least one case must be true/);
  assert.match(broken('fall-2026', (s) => s.cases[5].options.forEach((o) => (o.right = true))), /exactly one right/);
  assert.match(broken('fall-2026', (s) => (s.cases[0].evidence = { type: 'hologram' })), /evidence/);
  assert.match(broken('fall-2026', (s) => (s.cases[1].evidence.html = '<script>')), /./);
  assert.match(broken('fall-2026', (s) => (s.standards[0].cases = ['nope'])), /standards/);
  assert.match(broken('fall-2026', (s) => (s.checkQuiz[0].answer = 9)), /checkQuiz/);
  assert.match(broken('fall-2026', (s) => (s.rules = 'mystery')), /rules/);
});

test('the server refuses to start with a broken case file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cases-'));
  try {
    for (const entry of index.sets) fs.copyFileSync(path.join(DIR, entry.file), path.join(dir, entry.file));
    fs.writeFileSync(path.join(dir, 'sets.json'), JSON.stringify(index));
    const bad = load('grade8');
    delete bad.cases[2].lesson;
    fs.writeFileSync(path.join(dir, 'grade8.json'), JSON.stringify(bad));
    assert.throws(() => loadCaseSets(dir), /grade8\.json.*lesson/s);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
