// The rules every case file must follow. Case files live in cases/*.json and
// are listed in cases/sets.json, so they can be added or updated each year
// without code changes; the server refuses to start with a broken file.
//
// Two kinds of case file ("rules"):
// - "detective": Person or AI? Six fixed questions, the student picks three.
// - "investigate": How would you check? Four checks per case, the student has
//   time for two, each labeled strong or weak; the verdict is Trust it or
//   Don't trust it. A "choose" case asks for the responsible plan instead.
(function (root) {
  const QUESTIONS = [
    { id: 'A', text: 'Who shared it?', checks: 'Whether the source is known and has a history' },
    { id: 'B', text: 'Can I find it anywhere else?', checks: 'Whether anyone else backs it up' },
    { id: 'C', text: 'Do the small details hold up?', checks: 'Whether anything looks or reads wrong' },
    { id: 'D', text: 'Does it include things only someone who was there would know?', checks: 'Whether there are real, personal specifics' },
    { id: 'E', text: 'What happens when I ask a follow-up?', checks: 'Whether the source can answer back' },
    { id: 'F', text: 'Is there a label saying how it was made?', checks: "Whether it's marked as AI-made" },
  ];
  const QUESTION_IDS = QUESTIONS.map((q) => q.id);
  const RULES = ['detective', 'investigate'];
  const VERDICTS = { detective: ['person', 'ai'], investigate: ['trust', 'distrust'] };
  const CHECKS_PER_CASE = 4;
  const EVIDENCE_TYPES = ['post', 'quote', 'webpage', 'reviews', 'chat', 'scenario'];
  const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const SET_KEYS = {
    detective: ['id', 'title', 'label', 'blurb', 'rules', 'grade', 'cases'],
    investigate: ['id', 'title', 'label', 'blurb', 'rules', 'grade', 'pack', 'packNote', 'checkQuiz', 'discussion', 'guide', 'standards', 'standardsNote', 'cases'],
  };
  const DETECTIVE_KEYS = ['id', 'title', 'grade', 'item', 'clues', 'verdict', 'verdictNote', 'lesson', 'fib'];
  const INVESTIGATE_KEYS = ['id', 'title', 'kind', 'fib', 'evidence', 'checks', 'verdict', 'options', 'explain', 'skill'];

  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const sameKeys = (obj, keys) => isObj(obj) && Object.keys(obj).length === keys.length && keys.every((k) => k in obj);
  const unknown = (obj, keys) => Object.keys(obj).filter((k) => !keys.includes(k));
  const textList = (list, max, min = 1) => Array.isArray(list) && list.length >= min && list.every((s) => text(s, max));

  const EVIDENCE_KEYS = {
    post: ['avatar', 'account', 'image', 'text', 'meta'],
    quote: ['quote', 'author', 'meta'],
    webpage: ['url', 'heading', 'paragraphs', 'note'],
    reviews: ['url', 'reviews', 'note'],
    chat: ['messages'],
    scenario: ['label', 'situation', 'question'],
  };
  const optionalText = (value, max) => value === undefined || text(value, max);

  function validateEvidence(e) {
    if (!isObj(e) || !EVIDENCE_TYPES.includes(e.type)) return 'needs "evidence" with a "type" of ' + EVIDENCE_TYPES.join(', ');
    const extra = unknown(e, ['type'].concat(EVIDENCE_KEYS[e.type]));
    if (extra.length) return 'has unknown evidence fields: ' + extra.join(', ');
    if (!optionalText(e.avatar, 3) || !optionalText(e.meta, 80) || !optionalText(e.note, 120) || !optionalText(e.label, 40)) {
      return 'has a "' + e.type + '" evidence field that is too long or empty';
    }
    const ok = {
      post: () => text(e.account, 60) && text(e.text, 400) && (e.meta === undefined || text(e.meta, 80)) &&
        (e.image === undefined || (isObj(e.image) && /^[\w.-]+\.(svg|png|webp|jpg)$/.test(e.image.src) && text(e.image.alt, 300))),
      quote: () => text(e.quote, 300) && text(e.author, 80),
      webpage: () => text(e.url, 120) && text(e.heading, 120) && textList(e.paragraphs, 600),
      reviews: () => text(e.url, 120) && Array.isArray(e.reviews) && e.reviews.length > 0 &&
        e.reviews.every((r) => Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 5 && text(r.text, 300)),
      chat: () => Array.isArray(e.messages) && e.messages.length > 0 && e.messages.every((m) => ['me', 'bot', 'them'].includes(m.from) && text(m.text, 400)),
      scenario: () => text(e.situation, 600) && text(e.question, 200),
    }[e.type];
    return ok() ? null : 'has incomplete "' + e.type + '" evidence';
  }

  function validateDetectiveCase(c, set, where, errors) {
    const extra = unknown(c, DETECTIVE_KEYS);
    if (extra.length) errors.push(where + ' has unknown fields: ' + extra.join(', ') + '.');
    if (c.grade !== set.grade) errors.push(where + ': "grade" must match the set grade (' + set.grade + ').');
    if (!sameKeys(c.item, ['kind', 'description']) || !text(c.item.kind, 40) || !text(c.item.description, 400)) {
      errors.push(where + ': "item" needs a short "kind" and a "description".');
    }
    if (!sameKeys(c.clues, QUESTION_IDS) || !QUESTION_IDS.every((q) => text(c.clues[q], 300))) {
      errors.push(where + ': "clues" needs exactly one clue for each of ' + QUESTION_IDS.join(', ') + '.');
    }
    if (!VERDICTS.detective.includes(c.verdict)) errors.push(where + ': "verdict" must be "person" or "ai".');
    if (c.verdictNote !== undefined && !text(c.verdictNote, 200)) errors.push(where + ': "verdictNote" is too long.');
    if (!text(c.lesson, 300)) errors.push(where + ': "lesson" is missing or too long.');
    if (!sameKeys(c.fib, ['right', 'wrong']) || !text(c.fib.right, 200) || !text(c.fib.wrong, 200)) {
      errors.push(where + ': "fib" needs a "right" line and a "wrong" line.');
    }
  }

  function validateInvestigateCase(c, where, errors) {
    const extra = unknown(c, INVESTIGATE_KEYS);
    if (extra.length) errors.push(where + ' has unknown fields: ' + extra.join(', ') + '.');
    if (c.kind !== 'investigate' && c.kind !== 'choose') errors.push(where + ': "kind" must be "investigate" or "choose".');
    if (!sameKeys(c.fib, ['taunt', 'neutral']) || !text(c.fib.taunt, 200) || !text(c.fib.neutral, 200)) {
      errors.push(where + ': "fib" needs a "taunt" line and a "neutral" line.');
    }
    const evidenceError = validateEvidence(c.evidence);
    if (evidenceError) errors.push(where + ' ' + evidenceError + '.');
    if (c.kind === 'investigate') {
      const checks = c.checks;
      const okChecks = Array.isArray(checks) && checks.length === CHECKS_PER_CASE &&
        checks.every((k) => sameKeys(k, ['label', 'result', 'strong']) && text(k.label, 120) && text(k.result, 300) && typeof k.strong === 'boolean');
      if (!okChecks) errors.push(where + ': "checks" needs exactly ' + CHECKS_PER_CASE + ' checks, each with "label", "result" and "strong".');
      else if (!checks.some((k) => k.strong) || !checks.some((k) => !k.strong)) errors.push(where + ': "checks" needs at least one strong and one weak check.');
      if (!VERDICTS.investigate.includes(c.verdict)) errors.push(where + ': "verdict" must be "trust" or "distrust".');
      if (c.options !== undefined) errors.push(where + ': an "investigate" case has no "options".');
    } else if (c.kind === 'choose') {
      const options = c.options;
      const okOptions = Array.isArray(options) && options.length >= 2 && options.length <= 5 &&
        options.every((o) => sameKeys(o, ['text', 'right']) && text(o.text, 300) && typeof o.right === 'boolean') &&
        options.filter((o) => o.right).length === 1;
      if (!okOptions) errors.push(where + ': "options" needs 2 to 5 plans with exactly one right one.');
      if (c.checks !== undefined || c.verdict !== undefined) errors.push(where + ': a "choose" case has no "checks" or "verdict".');
    }
    if (!text(c.explain, 500)) errors.push(where + ': "explain" is missing or too long.');
    if (!text(c.skill, 80)) errors.push(where + ': "skill" is missing or too long.');
  }

  function validateInvestigateSet(set, errors) {
    const quiz = set.checkQuiz;
    const okQuiz = Array.isArray(quiz) && quiz.length >= 2 && quiz.length <= 8 &&
      quiz.every((q) => sameKeys(q, ['question', 'options', 'answer']) && text(q.question, 200) && textList(q.options, 200, 2) &&
        Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
    if (!okQuiz) errors.push('"checkQuiz" needs 2 to 8 questions, each with "options" and the index of the right "answer".');
    if (!text(set.pack, 40)) errors.push('"pack" needs a short case pack name, like "Fall 2026".');
    if (!textList(set.discussion, 300)) errors.push('"discussion" needs at least one discussion question.');
    const g = set.guide;
    if (!isObj(g) || !text(g.summary, 300) || !Array.isArray(g.plan) || !g.plan.every((p) => text(p.time, 20) && text(p.what, 300)) ||
        !text(g.keyIdea, 600) || !text(g.extension, 400)) errors.push('"guide" needs "summary", "plan", "keyIdea" and "extension".');
    const ids = new Set((set.cases || []).map((c) => c && c.id));
    const okStandards = Array.isArray(set.standards) && set.standards.every((s) =>
      text(s.code, 60) && s.code.includes('{grade}') && text(s.text, 300) && Array.isArray(s.cases) && s.cases.every((id) => ids.has(id)));
    if (!okStandards) errors.push('"standards" entries need a "code" with {grade}, "text", and "cases" that exist in this file.');
    const investigate = (set.cases || []).filter((c) => c && c.kind === 'investigate');
    if (!investigate.some((c) => c.verdict === 'trust')) errors.push('At least one case must be true ("trust"), so students learn not to distrust everything.');
  }

  // Returns a list of problems; an empty list means the file is usable.
  function validateCaseSet(set) {
    const errors = [];
    if (!isObj(set)) return ['The file is not a JSON object.'];
    if (!RULES.includes(set.rules)) return ['"rules" must be "detective" or "investigate".'];
    const extra = unknown(set, SET_KEYS[set.rules]);
    if (extra.length) errors.push('The file has unknown fields: ' + extra.join(', ') + '.');
    if (typeof set.id !== 'string' || !SLUG.test(set.id)) errors.push('Set "id" must be lower-case words joined by dashes.');
    if (!text(set.title, 80)) errors.push('Set "title" is missing or longer than 80 characters.');
    if (!text(set.label, 24)) errors.push('Set "label" (shown in the picker and progress line) is missing or longer than 24 characters.');
    if (!text(set.blurb, 60)) errors.push('Set "blurb" (the picker\'s second line) is missing or longer than 60 characters.');
    if (set.grade !== null && (!Number.isInteger(set.grade) || set.grade < 1 || set.grade > 12)) errors.push('Set "grade" must be a whole number from 1 to 12, or null for all grades.');
    if (!Array.isArray(set.cases) || set.cases.length < 4) {
      errors.push('Set "cases" must list at least 4 cases.');
      return errors;
    }
    const seen = new Set();
    set.cases.forEach((c, i) => {
      const where = 'Case ' + (i + 1) + (c && c.id ? ' (' + c.id + ')' : '');
      if (!isObj(c)) {
        errors.push(where + ' is not an object.');
        return;
      }
      if (typeof c.id !== 'string' || !SLUG.test(c.id)) errors.push(where + ': "id" must be lower-case words joined by dashes.');
      else if (seen.has(c.id)) errors.push(where + ': "id" is used twice.');
      else seen.add(c.id);
      if (!text(c.title, 80)) errors.push(where + ': "title" is missing or too long.');
      if (set.rules === 'detective') validateDetectiveCase(c, set, where, errors);
      else validateInvestigateCase(c, where, errors);
    });
    if (set.rules === 'detective') {
      const ai = set.cases.filter((c) => c && c.verdict === 'ai').length;
      const share = ai / set.cases.length;
      if (share < 0.4 || share > 0.6) errors.push('About half the cases must be AI-made; this set has ' + ai + ' of ' + set.cases.length + '.');
    } else {
      validateInvestigateSet(set, errors);
    }
    return errors;
  }

  const api = { QUESTIONS, QUESTION_IDS, RULES, VERDICTS, CHECKS_PER_CASE, EVIDENCE_TYPES, validateCaseSet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AIDetectiveCaseData = api;
})(typeof window !== 'undefined' ? window : globalThis);
