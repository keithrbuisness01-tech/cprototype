// The six fixed detective questions, and the rules every case file must
// follow. Case sets live in cases/*.json so they can be added or updated each
// year without code changes; the server refuses to start with a broken file.
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

  const ITEM_KINDS = [
    'photo', 'video', 'voice message', 'text message', 'chat message', 'email', 'post',
    'website text', 'news article', 'homework answer', 'artwork', 'review', 'writing',
  ];
  const VERDICTS = ['person', 'ai'];
  const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const CASE_KEYS = ['id', 'title', 'grade', 'item', 'clues', 'verdict', 'verdictNote', 'lesson', 'fib'];

  function text(value, max) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  }

  function sameKeys(obj, keys) {
    return obj && typeof obj === 'object' && !Array.isArray(obj) &&
      Object.keys(obj).length === keys.length && keys.every((k) => k in obj);
  }

  // Returns a list of problems; an empty list means the set is usable.
  function validateCaseSet(set) {
    const errors = [];
    if (!set || typeof set !== 'object') return ['The file is not a JSON object.'];
    if (typeof set.id !== 'string' || !SLUG.test(set.id)) errors.push('Set "id" must be lower-case words joined by dashes.');
    if (!text(set.title, 80)) errors.push('Set "title" is missing or longer than 80 characters.');
    if (!Number.isInteger(set.grade) || set.grade < 1 || set.grade > 12) errors.push('Set "grade" must be a whole number from 1 to 12.');
    if (!Array.isArray(set.cases) || set.cases.length < 4) {
      errors.push('Set "cases" must list at least 4 cases.');
      return errors;
    }
    const seen = new Set();
    set.cases.forEach((c, i) => {
      const where = 'Case ' + (i + 1) + (c && c.id ? ' (' + c.id + ')' : '');
      if (!c || typeof c !== 'object') {
        errors.push(where + ' is not an object.');
        return;
      }
      const extra = Object.keys(c).filter((k) => !CASE_KEYS.includes(k));
      if (extra.length) errors.push(where + ' has unknown fields: ' + extra.join(', ') + '.');
      if (typeof c.id !== 'string' || !SLUG.test(c.id)) errors.push(where + ': "id" must be lower-case words joined by dashes.');
      else if (seen.has(c.id)) errors.push(where + ': "id" is used twice.');
      else seen.add(c.id);
      if (!text(c.title, 80)) errors.push(where + ': "title" is missing or too long.');
      if (c.grade !== set.grade) errors.push(where + ': "grade" must match the set grade (' + set.grade + ').');
      if (!sameKeys(c.item, ['kind', 'description']) || !ITEM_KINDS.includes(c.item.kind) || !text(c.item.description, 400)) {
        errors.push(where + ': "item" needs a "kind" (one of: ' + ITEM_KINDS.join(', ') + ') and a "description".');
      }
      if (!sameKeys(c.clues, QUESTION_IDS) || !QUESTION_IDS.every((q) => text(c.clues[q], 300))) {
        errors.push(where + ': "clues" needs exactly one clue for each of ' + QUESTION_IDS.join(', ') + '.');
      }
      if (!VERDICTS.includes(c.verdict)) errors.push(where + ': "verdict" must be "person" or "ai".');
      if (!text(c.verdictNote, 200)) errors.push(where + ': "verdictNote" is missing or too long.');
      if (!text(c.lesson, 300)) errors.push(where + ': "lesson" is missing or too long.');
      if (!sameKeys(c.fib, ['right', 'wrong']) || !text(c.fib.right, 200) || !text(c.fib.wrong, 200)) {
        errors.push(where + ': "fib" needs a "right" line and a "wrong" line.');
      }
    });
    const ai = set.cases.filter((c) => c && c.verdict === 'ai').length;
    const share = ai / set.cases.length;
    if (share < 0.4 || share > 0.6) errors.push('About half the cases must be AI-made; this set has ' + ai + ' of ' + set.cases.length + '.');
    return errors;
  }

  const api = { QUESTIONS, QUESTION_IDS, ITEM_KINDS, VERDICTS, validateCaseSet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AIDetectiveCaseData = api;
})(typeof window !== 'undefined' ? window : globalThis);
