// The one-screen class report, drawn from a summary the server computed with
// game.js. Anonymous totals only.
(function (root) {
  const { el } = root.AIDetectiveUI;

  function statTile(label, value, note) {
    const tile = el('div', 'stat');
    tile.append(el('p', 'stat-label', label), el('p', 'stat-value', value));
    if (note) tile.append(el('p', 'stat-note', note));
    return tile;
  }

  // Horizontal bars, one series, value at the bar tip.
  function barChart(rows, caption) {
    const fig = el('figure', 'bars');
    fig.append(el('figcaption', 'bars-caption', caption));
    const list = el('ol', 'bars-list');
    for (const row of rows) {
      const li = el('li', 'bar-row');
      li.title = row.tooltip;
      const track = el('span', 'bar-track');
      const bar = el('span', 'bar');
      bar.style.width = (row.value === null ? 0 : row.value) + '%';
      track.appendChild(bar);
      li.append(el('span', 'bar-label', row.label), track, el('span', 'bar-value', row.value === null ? 'none yet' : row.value + '%'));
      list.appendChild(li);
    }
    fig.appendChild(list);
    return fig;
  }

  const num = (v, suffix = '') => (v === null || v === undefined ? '–' : v + suffix);

  function listSection(title, items, empty) {
    const box = el('section', 'report-list');
    box.append(el('h3', null, title));
    if (!items.length) {
      box.appendChild(el('p', 'muted', empty));
      return box;
    }
    const ol = el('ol');
    for (const [strong, rest] of items) {
      const li = el('li');
      li.append(el('strong', null, strong), rest);
      ol.appendChild(li);
    }
    box.appendChild(ol);
    return box;
  }

  // render(container, summary, caseSet): caseSet is { label, rules, count }.
  function render(container, summary, caseSet) {
    container.innerHTML = '';
    const investigate = summary.rules === 'investigate';
    const count = caseSet.count;
    if (summary.answered === 0) {
      const empty = el('div', 'empty');
      empty.append(
        el('p', null, 'No answers yet for ' + caseSet.label + '.'),
        el('p', 'muted', 'Totals appear here as students play this case file. Choose another case file above to see its totals.')
      );
      container.appendChild(empty);
      return;
    }

    const stats = el('div', 'stats');
    if (investigate) {
      stats.append(
        statTile('Finished the pack', String(summary.finished), summary.started + ' started'),
        statTile('Average points', num(summary.averageScore) + ' / ' + summary.maxScore, 'finished runs'),
        statTile('Warm-up → wrap-up', num(summary.quiz.preAvg) + ' → ' + num(summary.quiz.postAvg), 'out of ' + summary.quiz.length),
        statTile('Improved', num(summary.quiz.improvedPct, '%'), summary.quiz.runs + ' did both checks')
      );
    } else {
      stats.append(
        statTile('Finished all ' + count, String(summary.finished), summary.started + ' started'),
        statTile('Average score', num(summary.averageScore) + ' / ' + count, 'finished runs only'),
        statTile('First ' + summary.trendWindow + ' cases', num(summary.early, '%'), 'right'),
        statTile('Last ' + summary.trendWindow + ' cases', num(summary.late, '%'), 'right')
      );
    }
    container.appendChild(stats);

    if (summary.early !== null && summary.late !== null) {
      const diff = summary.late - summary.early;
      container.appendChild(el('p', 'trend ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'),
        (diff > 0 ? 'Up ' + diff + ' points' : diff < 0 ? 'Down ' + Math.abs(diff) + ' points' : 'No change') +
        ' from the first cases to the last' + (investigate ? ' (right verdicts, in the order students played them).' : '.')));
    }

    if (summary.suggestion) {
      const s = summary.suggestion;
      const card = el('section', 'next-lesson');
      card.append(el('h3', null, 'Suggested next step'));
      const p = el('p');
      p.append('Revisit ', el('strong', null, s.caseTitle), ' (' + s.casePct + '% right). ');
      if (s.skill) p.append('Skill: ' + s.skill + '. ');
      p.append(el('em', null, s.lesson));
      card.appendChild(p);
      if (s.question) card.append(el('p', null, 'Then model question ' + s.question.id + ', "' + s.question.text + '", which the class asked least.'));
      if (investigate && summary.luckyPct !== null && summary.luckyPct >= 30) {
        card.append(el('p', null, summary.luckyPct + '% of right answers were lucky guesses. Before the next cases, ask the class: “How would you check?”'));
      }
      container.appendChild(card);
    }

    const lists = el('div', 'report-lists');
    lists.appendChild(listSection('Cases that fooled the class', summary.fooledBy.map((c) => [c.title, ': ' + c.pct + '% right']), 'No case fooled most of the class.'));
    if (investigate) {
      lists.appendChild(listSection('How the class checked', [
        [num(summary.strongShare, '%'), ' of the checks students opened were strong.'],
        [num(summary.luckyPct, '%'), ' of right verdicts were lucky guesses, with no strong check.'],
      ], ''));
    } else {
      lists.appendChild(listSection('Questions the class skipped most', summary.skipped.slice(0, 3).map((q) => [q.id + '. ' + q.text, ': skipped in ' + q.pct + '% of cases']), ''));
    }
    container.appendChild(lists);

    const charts = el('div', 'charts');
    charts.appendChild(barChart(summary.perCase.map((c) => ({
      label: c.number + '. ' + c.title,
      value: c.pct,
      tooltip: c.title + ': ' + c.correct + ' of ' + c.answered + ' right',
    })), 'Right verdicts per case'));
    if (investigate) {
      const backed = summary.perCase.filter((c) => c.solvedPct !== undefined);
      charts.appendChild(barChart(backed.map((c) => ({
        label: c.number + '. ' + c.title,
        value: c.solvedPct,
        tooltip: c.title + ': right with a strong check in ' + num(c.solvedPct, '%') + ' of answers',
      })), 'Right and backed by a strong check'));
    } else {
      charts.appendChild(barChart(summary.picks.map((p) => ({
        label: p.id + '. ' + p.text,
        value: p.pct,
        tooltip: p.text + ': picked ' + p.count + ' times',
      })), 'Share of questions asked'));
    }
    container.appendChild(charts);
  }

  root.AIDetectiveReport = { render };
})(window);
