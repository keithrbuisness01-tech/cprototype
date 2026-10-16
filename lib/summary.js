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
  const date = new Date(generatedAt).toISOString().slice(0, 10);
  const trend = s.early !== null && s.late !== null
    ? (s.late > s.early ? 'Up ' + (s.late - s.early) + ' points' : s.late < s.early ? 'Down ' + (s.early - s.late) + ' points' : 'No change') + ' from the first cases to the last.'
    : 'Not enough cases played yet to compare.';

  const fooled = s.fooledBy.length
    ? '<ol>' + s.fooledBy.map((c) => '<li><strong>' + e(c.title) + '</strong>: ' + c.pct + '% right</li>').join('') + '</ol>'
    : '<p>No case fooled most of the class.</p>';

  const skipped = s.answered
    ? '<ol>' + s.skipped.slice(0, 3).map((q) => '<li><strong>' + e(q.id) + '. ' + e(q.text) + '</strong>: skipped in ' + q.pct + '% of cases</li>').join('') + '</ol>'
    : '<p>No cases played yet.</p>';

  let next = '<p>Once the class has played, a suggested next step appears here.</p>';
  if (s.suggestion) {
    next = '<p>Revisit case ' + s.suggestion.caseNumber + ', <strong>' + e(s.suggestion.caseTitle) + '</strong> (' + s.suggestion.casePct +
      '% right). Its lesson: <em>' + e(s.suggestion.lesson) + '</em></p>';
    if (s.suggestion.question) {
      next += '<p>Then model question ' + e(s.suggestion.question.id) + ', "' + e(s.suggestion.question.text) + '", which the class asked least.</p>';
    }
  }

  const rows = s.perCase.map((c) => '<tr><td>' + c.number + '. ' + e(c.title) + '</td><td class="sum-bar-cell">' + bar(c.pct) + '</td><td class="num">' + pctText(c.pct) + '</td></tr>').join('');

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
    <p class="sum-meta">${e(caseSet.title)} · Grade ${caseSet.grade} · ${date}</p>
    <p class="sum-note">Anonymous class totals. No student names or individual scores are collected.</p>
  </header>
  <section class="sum-stats">
    <div><span class="sum-num">${s.finished}</span><span>finished all cases</span></div>
    <div><span class="sum-num">${s.averageScore === null ? '–' : s.averageScore}</span><span>average score out of ${caseSet.cases.length}</span></div>
    <div><span class="sum-num">${s.early === null ? '–' : s.early + '%'}</span><span>right on the first ${s.trendWindow} cases</span></div>
    <div><span class="sum-num">${s.late === null ? '–' : s.late + '%'}</span><span>right on the last ${s.trendWindow} cases</span></div>
  </section>
  <p class="sum-trend">${trend}</p>
  <section class="sum-grid">
    <div><h2>Cases that fooled the class</h2>${fooled}</div>
    <div><h2>Questions the class skipped most</h2>${skipped}</div>
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
