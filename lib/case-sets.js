// Loads every case set listed in cases/sets.json and refuses to start if any
// file breaks the rules in js/casedata.js.
const fs = require('fs');
const path = require('path');
const { validateCaseSet } = require('../js/casedata.js');

function loadCaseSets(dir) {
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'sets.json'), 'utf8'));
  const sets = new Map();
  const problems = [];
  for (const entry of index.sets) {
    const file = path.join(dir, path.basename(entry.file));
    let set;
    try {
      set = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      problems.push(entry.file + ': ' + e.message);
      continue;
    }
    const errors = validateCaseSet(set);
    if (set.id !== entry.id) errors.push('id "' + set.id + '" does not match sets.json ("' + entry.id + '").');
    if (errors.length) problems.push(...errors.map((e) => entry.file + ': ' + e));
    else sets.set(set.id, set);
  }
  if (!sets.has(index.default)) problems.push('sets.json: default set "' + index.default + '" is missing.');
  if (problems.length) throw new Error('Case files have problems:\n  ' + problems.join('\n  '));
  return {
    defaultId: index.default,
    get: (id) => sets.get(id),
    list: () => Array.from(sets.values()).map((s) => ({ id: s.id, title: s.title, grade: s.grade, count: s.cases.length })),
  };
}

module.exports = { loadCaseSets };
