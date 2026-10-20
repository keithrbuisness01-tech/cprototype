// The one-page results summary. Rendered on the server as plain HTML, so it
// prints well and opens anywhere it's forwarded. Anonymous totals only.
const { escapeHtml: e } = require('./http.js');

function bar(pct) {
  const w = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return '<svg class="sum-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">' +
    '<rect class="sum-bar-track" x="0" y="0" width="100" height="8" rx="2"></rect>' +
    '<rect class="sum-bar-fill" x="0" y="0" width="' + w + '" height="8" rx="2"></rect></svg>';
}

function pctText(pct) {
  return pct === null ? 'not played' : pct + '%';
}

function renderSummaryPage({ summary, caseSet, label, generatedAt, shared }) {
  const s = summary;
  const investigate = s.rules === 'investigate';
  const date = new Date(generatedAt).toISOString().slice(0, 10);
  const grade = caseSet.grade === null ? 'Grades 6 to 8' : 'Grade ' + caseSet.grade;
  const trend = s.early !== null && s.late !== null
    ? (s.late > s.early ? 'Up ' + (s.late - s.early) + ' points' : s.late < s.early ? 'Down ' + (s.early - s.late) + ' points' : 'No change') + ' from the first cases to the last.'
    : 'Not enough cases played yet to compare.';
  const num = (v, suffix = '') => (v === null || v === undefined ? '–' : v + suffix);

  const fooled = s.fooledBy.length
    ? '<ol>' + s.fooledBy.map((c) => '<li><strong>' + e(c.title) + '</strong>: ' + c.pct + '% right</li>').join('') + '</ol>'
    : '<p>No case fooled most of the class.</p>';

  let second;
  if (investigate) {
    second = '<h2>How the class checked</h2><ul>' +
      '<li><strong>' + num(s.strongShare, '%') + '</strong> of the checks students opened were strong checks.</li>' +
      '<li><strong>' + num(s.luckyPct, '%') + '</strong> of right verdicts were lucky guesses, with no strong check behind them.</li>' +
      '<li>Warm-up average <strong>' + num(s.quiz.preAvg) + '</strong>, wrap-up average <strong>' + num(s.quiz.postAvg) + '</strong> (out of ' + s.quiz.length + '). ' +
      '<strong>' + num(s.quiz.improvedPct, '%') + '</strong> improved.</li></ul>';
  } else {
    second = '<h2>Questions the class skipped most</h2>' + (s.answered
      ? '<ol>' + s.skipped.slice(0, 3).map((q) => '<li><strong>' + e(q.id) + '. ' + e(q.text) + '</strong>: skipped in ' + q.pct + '% of cases</li>').join('') + '</ol>'
      : '<p>No cases played yet.</p>');
  }

  let next = '<p>Once the class has played, a suggested next step appears here.</p>';
  if (s.suggestion) {
    next = '<p>Revisit <strong>' + e(s.suggestion.caseTitle) + '</strong> (' + s.suggestion.casePct + '% right). ' +
      (s.suggestion.skill ? 'Skill: ' + e(s.suggestion.skill) + '. ' : '') + '<em>' + e(s.suggestion.lesson) + '</em></p>';
    if (s.suggestion.question) {
      next += '<p>Then model question ' + e(s.suggestion.question.id) + ', "' + e(s.suggestion.question.text) + '", which the class asked least.</p>';
    }
  }

  const rows = s.perCase.map((c) => '<tr><td>' + c.number + '. ' + e(c.title) + '</td><td class="sum-bar-cell">' + bar(c.pct) + '</td><td class="num">' + pctText(c.pct) + '</td></tr>').join('');
  const stats = investigate
    ? [[s.finished, 'finished the case pack'], [num(s.averageScore), 'average points out of ' + s.maxScore], [num(s.quiz.preAvg), 'warm-up average out of ' + s.quiz.length], [num(s.quiz.postAvg), 'wrap-up average out of ' + s.quiz.length]]
    : [[s.finished, 'finished all cases'], [num(s.averageScore), 'average score out of ' + caseSet.cases.length], [num(s.early, '%'), 'right on the first ' + s.trendWindow + ' cases'], [num(s.late, '%'), 'right on the last ' + s.trendWindow + ' cases']];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>AI Detective results summary</title>
<link rel="stylesheet" href="/css/fonts.css">
<link rel="stylesheet" href="/css/styles.css">
</head>
<body class="summary-page">
<main class="summary">
  <header class="sum-head">
    <p class="eyebrow">AI Detective · results summary</p>
    <h1>${shared ? 'Class results' : e(label)}</h1>
    <p class="sum-meta">${e(caseSet.label)} · ${grade} · ${date}</p>
    <p class="sum-note">Anonymous class totals. No student names or individual scores are collected.</p>
  </header>
  <section class="sum-stats">
    ${stats.map(([n, t]) => '<div><span class="sum-num">' + n + '</span><span>' + t + '</span></div>').join('\n    ')}
  </section>
  <p class="sum-trend">${trend}</p>
  <section class="sum-grid">
    <div><h2>Cases that fooled the class</h2>${fooled}</div>
    <div>${second}</div>
  </section>
  <section><h2>Suggested next step</h2>${next}</section>
  <section>
    <h2>Right answers by case</h2>
    <table class="sum-table"><tbody>${rows}</tbody></table>
  </section>
</main>
</body>
</html>`;
}

module.exports = { renderSummaryPage };
