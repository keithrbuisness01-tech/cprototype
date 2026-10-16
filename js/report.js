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

  function render(container, summary, caseCount) {
    container.innerHTML = '';
    if (summary.answered === 0) {
      const empty = el('div', 'empty');
      empty.append(
        el('p', null, 'No answers yet for this class.'),
        el('p', 'muted', 'Share the join link with your class. Totals appear here as students play.')
      );
      container.appendChild(empty);
      return;
    }

    const stats = el('div', 'stats');
    stats.append(
      statTile('Finished all ' + caseCount, String(summary.finished), summary.started + ' started'),
      statTile('Average score', summary.averageScore === null ? '–' : summary.averageScore + ' / ' + caseCount, 'finished runs only'),
      statTile('First ' + summary.trendWindow + ' cases', summary.early === null ? '–' : summary.early + '%', 'right'),
      statTile('Last ' + summary.trendWindow + ' cases', summary.late === null ? '–' : summary.late + '%', 'right')
    );
    container.appendChild(stats);

    if (summary.early !== null && summary.late !== null) {
      const diff = summary.late - summary.early;
      container.appendChild(el('p', 'trend ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'),
        diff > 0 ? 'Up ' + diff + ' points from the first cases to the last.'
          : diff < 0 ? 'Down ' + Math.abs(diff) + ' points from the first cases to the last.'
            : 'No change from the first cases to the last.'));
    }

    if (summary.suggestion) {
      const s = summary.suggestion;
      const card = el('section', 'next-lesson');
      card.append(el('h3', null, 'Suggested next step'));
      const p = el('p');
      p.append('Revisit case ' + s.caseNumber + ', ', el('strong', null, s.caseTitle), ' (' + s.casePct + '% right). Its lesson: ', el('em', null, s.lesson));
      card.appendChild(p);
      if (s.question) card.append(el('p', null, 'Then model question ' + s.question.id + ', "' + s.question.text + '", which the class asked least.'));
      container.appendChild(card);
    }

    const lists = el('div', 'report-lists');
    const fooled = el('section', 'report-list');
    fooled.append(el('h3', null, 'Cases that fooled the class'));
    if (summary.fooledBy.length) {
      const ol = el('ol');
      for (const c of summary.fooledBy) {
        const li = el('li');
        li.append(el('strong', null, c.title), ': ' + c.pct + '% right');
        ol.appendChild(li);
      }
      fooled.appendChild(ol);
    } else {
      fooled.appendChild(el('p', 'muted', 'No case fooled most of the class.'));
    }
    const skipped = el('section', 'report-list');
    skipped.append(el('h3', null, 'Questions the class skipped most'));
    const ol = el('ol');
    for (const q of summary.skipped.slice(0, 3)) {
      const li = el('li');
      li.append(el('strong', null, q.id + '. ' + q.text), ': skipped in ' + q.pct + '% of cases');
      ol.appendChild(li);
    }
    skipped.appendChild(ol);
    lists.append(fooled, skipped);
    container.appendChild(lists);

    const charts = el('div', 'charts');
    charts.append(
      barChart(summary.perCase.map((c) => ({
        label: c.number + '. ' + c.title,
        value: c.pct,
        tooltip: c.title + ': ' + c.correct + ' of ' + c.answered + ' right',
      })), 'Right verdicts per case'),
      barChart(summary.picks.map((p) => ({
        label: p.id + '. ' + p.text,
        value: p.pct,
        tooltip: p.text + ': picked ' + p.count + ' times',
      })), 'Share of questions asked')
    );
    container.appendChild(charts);
  }

  root.AIDetectiveReport = { render };
})(window);
