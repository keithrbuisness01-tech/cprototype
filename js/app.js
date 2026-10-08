// Screens and interaction. Rules live in game.js; storage in store.js.
(function () {
  const { QUESTIONS, CASES } = window.AIDetectiveData;
  const Game = window.AIDetectiveGame;
  const Store = window.AIDetectiveStore;

  const $ = (id) => document.getElementById(id);
  const screens = ['home', 'howto', 'case', 'end', 'report'];

  let run = null;
  let classCode = Store.savedClassCode();

  // ---- Fib -----------------------------------------------------------------
  // A placeholder drawing until the illustrator's art exists.
  const MOUTHS = {
    smug: 'M38 66 Q50 74 64 62',
    gleeful: 'M34 62 Q50 82 66 62 Z',
    annoyed: 'M38 70 Q50 62 62 70',
  };
  const BROWS = {
    smug: '<path d="M30 38 L44 42" /><path d="M56 40 L70 32" />',
    gleeful: '<path d="M30 36 L44 38" /><path d="M56 38 L70 36" />',
    annoyed: '<path d="M30 34 L44 42" /><path d="M56 42 L70 34" />',
  };

  function fibSvg(mood) {
    const filled = mood === 'gleeful';
    return (
      '<svg viewBox="0 0 100 100" role="img" aria-label="Fib looks ' + mood + '">' +
      '<path class="fib-hat" d="M22 30 L50 4 L78 30 Z" />' +
      '<circle class="fib-hat-pom" cx="50" cy="6" r="5" />' +
      '<circle class="fib-head" cx="50" cy="56" r="34" />' +
      '<g class="fib-brow">' + BROWS[mood] + '</g>' +
      '<circle class="fib-eye" cx="38" cy="50" r="4" />' +
      '<circle class="fib-eye" cx="62" cy="50" r="4" />' +
      '<path class="fib-mouth' + (filled ? ' filled' : '') + '" d="' + MOUTHS[mood] + '" />' +
      '</svg>'
    );
  }

  function setFib(el, mood) {
    el.innerHTML = fibSvg(mood);
    el.dataset.fib = mood;
  }

  // ---- Navigation ------------------------------------------------------------

  function show(name) {
    for (const s of screens) $('screen-' + s).hidden = s !== name;
    $('scoreboard').hidden = !(name === 'case' || name === 'end');
    window.scrollTo(0, 0);
    const heading = $('screen-' + name).querySelector('h1, h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    if (name === 'report') loadReport();
  }

  function goHome() {
    $('class-code').value = classCode === 'MY-CLASS' ? '' : classCode;
    show('home');
  }

  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-go]');
    if (!target) return;
    const where = target.dataset.go;
    if (where === 'home') {
      if (run && !Game.isOver(run) && run.results.length > 0 &&
          !window.confirm('Leave this game? Your progress in this run will be lost.')) return;
      run = null;
      goHome();
    } else {
      if (where === 'report' && !$('screen-home').hidden) {
        reportClass = Store.normalizeClassCode($('class-code').value);
      }
      show(where);
    }
  });

  // ---- A run -----------------------------------------------------------------

  function startRun() {
    classCode = Store.normalizeClassCode($('class-code').value);
    Store.saveClassCode(classCode);
    run = Game.newRun(CASES.length);
    Store.send(classCode, { type: 'start' });
    updateScore();
    show('howto');
  }

  function updateScore() {
    const s = run ? Game.scores(run) : { player: 0, fib: 0 };
    $('score-you').textContent = s.player;
    $('score-fib').textContent = s.fib;
  }

  function renderCase() {
    const c = CASES[run.index];
    $('case-tag').textContent = 'Case ' + (run.index + 1) + ' of ' + CASES.length;
    $('case-title').textContent = c.title;
    $('case-setup').textContent = c.setup;
    $('progress-fill').style.width = ((run.index) / CASES.length) * 100 + '%';

    const list = $('questions');
    list.innerHTML = '';
    for (const q of QUESTIONS) {
      const li = document.createElement('li');
      li.className = 'question';
      li.dataset.id = q.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'question-btn';
      btn.innerHTML = '<span class="q-letter"></span><span class="q-text"></span>';
      btn.querySelector('.q-letter').textContent = q.id;
      btn.querySelector('.q-text').textContent = q.text;
      btn.addEventListener('click', () => onPick(q.id));
      const clue = document.createElement('p');
      clue.className = 'clue';
      clue.hidden = true;
      li.append(btn, clue);
      list.appendChild(li);
    }

    $('verdict').hidden = true;
    $('reveal').hidden = true;
    for (const b of document.querySelectorAll('.verdict-btn')) b.disabled = false;
    updatePickState();
    show('case');
  }

  function updatePickState() {
    const left = Game.PICKS_PER_CASE - run.picks.length;
    $('pick-count').textContent = left === 0 ? 'All three asked' : left + ' left';
    for (const li of $('questions').children) {
      const id = li.dataset.id;
      const picked = run.picks.includes(id);
      const btn = li.querySelector('button');
      li.classList.toggle('picked', picked);
      li.classList.toggle('unpicked', !picked && left === 0);
      btn.disabled = picked || left === 0 || run.guess !== null;
      btn.setAttribute('aria-pressed', String(picked));
    }
  }

  function onPick(id) {
    if (!Game.pick(run, id)) return;
    const li = $('questions').querySelector('[data-id="' + id + '"]');
    const clue = li.querySelector('.clue');
    clue.textContent = CASES[run.index].clues[id];
    clue.hidden = false;
    updatePickState();
    if (Game.readyToGuess(run)) {
      $('verdict').hidden = false;
      $('verdict').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function onGuess(value) {
    const c = CASES[run.index];
    const result = Game.guess(run, c.answer, value);
    if (!result) return;
    for (const b of document.querySelectorAll('.verdict-btn')) b.disabled = true;
    updatePickState();
    updateScore();
    Store.send(classCode, { type: 'case', caseIndex: result.index, correct: result.correct, picks: result.picks });

    const banner = $('result-banner');
    banner.className = 'result-banner ' + (result.correct ? 'right' : 'wrong');
    banner.textContent = result.correct ? 'You got it. Point to you.' : 'Fooled! Point to Fib.';
    setFib($('reveal-fib'), result.correct ? 'annoyed' : 'gleeful');
    $('reveal-speech').textContent = result.correct ? c.fibRight : c.fibWrong;
    $('reveal-verdict').textContent = c.verdict;
    $('reveal-lesson').textContent = c.lesson;

    const others = $('other-clues');
    others.innerHTML = '';
    for (const q of QUESTIONS) {
      if (result.picks.includes(q.id)) continue;
      const li = document.createElement('li');
      const label = document.createElement('strong');
      label.textContent = q.id + '. ' + q.text + ' ';
      li.append(label, document.createTextNode(c.clues[q.id]));
      others.appendChild(li);
    }
    $('reveal').querySelector('details').open = false;

    $('next-btn').textContent = run.index + 1 >= CASES.length ? 'See my rank' : 'Next case';
    $('verdict').hidden = true;
    $('reveal').hidden = false;
    $('reveal').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function onNext() {
    Game.next(run);
    if (Game.isOver(run)) finishRun();
    else renderCase();
  }

  function finishRun() {
    const s = Game.scores(run);
    const rank = Game.rankFor(s.player);
    Store.send(classCode, { type: 'finish', score: s.player });
    $('progress-fill').style.width = '100%';
    $('end-score').textContent = s.player;
    $('end-total').textContent = CASES.length;
    $('end-rank').textContent = rank.name;
    $('end-rank').dataset.rank = rank.name.toLowerCase();
    setFib($('end-fib'), s.player >= 7 ? 'annoyed' : 'gleeful');
    $('end-speech').textContent = rank.fib;

    const recap = $('recap');
    recap.innerHTML = '';
    for (const r of run.results) {
      const c = CASES[r.index];
      const li = document.createElement('li');
      li.className = r.correct ? 'right' : 'wrong';
      const mark = document.createElement('span');
      mark.className = 'recap-mark';
      mark.textContent = r.correct ? '✓' : '✗';
      mark.setAttribute('aria-label', r.correct ? 'right' : 'wrong');
      const body = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = c.title;
      const lesson = document.createElement('p');
      lesson.textContent = c.lesson;
      body.append(title, lesson);
      li.append(mark, body);
      recap.appendChild(li);
    }
    show('end');
  }

  $('start-btn').addEventListener('click', startRun);
  $('howto-go').addEventListener('click', renderCase);
  $('next-btn').addEventListener('click', onNext);
  $('again-btn').addEventListener('click', () => {
    run = Game.newRun(CASES.length);
    Store.send(classCode, { type: 'start' });
    updateScore();
    renderCase();
  });
  for (const b of document.querySelectorAll('.verdict-btn')) {
    b.addEventListener('click', () => onGuess(b.dataset.guess));
  }

  // ---- Teacher report --------------------------------------------------------

  let reportClass = classCode;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

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
      const label = el('span', 'bar-label', row.label);
      const track = el('span', 'bar-track');
      const bar = el('span', 'bar');
      bar.style.width = (row.value === null ? 0 : row.value) + '%';
      track.appendChild(bar);
      const value = el('span', 'bar-value', row.value === null ? 'none yet' : row.value + '%');
      li.append(label, track, value);
      list.appendChild(li);
    }
    fig.appendChild(list);
    return fig;
  }

  function renderReport(summary) {
    const body = $('report-body');
    body.innerHTML = '';

    if (summary.answered === 0) {
      const empty = el('div', 'empty');
      empty.append(
        el('p', null, 'No answers yet for class code ' + reportClass + '.'),
        el('p', 'muted', 'Give students this class code on the start screen. Totals appear here as they play.')
      );
      body.appendChild(empty);
      return;
    }

    const stats = el('div', 'stats');
    stats.append(
      statTile('Finished all ten', String(summary.finished), summary.started + ' started'),
      statTile('Average score', summary.averageScore === null ? '–' : summary.averageScore + ' / 10', 'finished runs only'),
      statTile('First ' + summary.trendWindow + ' cases', summary.early === null ? '–' : summary.early + '%', 'right'),
      statTile('Last ' + summary.trendWindow + ' cases', summary.late === null ? '–' : summary.late + '%', 'right')
    );
    body.appendChild(stats);

    if (summary.early !== null && summary.late !== null) {
      const diff = summary.late - summary.early;
      const trend = el('p', 'trend ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'));
      trend.textContent = diff > 0
        ? 'Up ' + diff + ' points from the first cases to the last.'
        : diff < 0
          ? 'Down ' + Math.abs(diff) + ' points from the first cases to the last.'
          : 'No change from the first cases to the last.';
      body.appendChild(trend);
    }

    if (summary.suggestion) {
      const s = summary.suggestion;
      const card = el('section', 'next-lesson');
      card.append(el('h3', null, 'Suggested next lesson'));
      const p1 = el('p');
      p1.append(
        'Case ' + s.caseNumber + ', ',
        el('strong', null, s.caseTitle),
        ', fooled the most students (' + s.casePct + '% right). Start from its lesson: '
      );
      p1.append(el('em', null, s.lesson));
      card.appendChild(p1);
      if (s.question) {
        card.append(el('p', null,
          'Students asked question ' + s.question.id + ', "' + s.question.text + '", least often. Model it first next time.'));
      }
      body.appendChild(card);
    }

    const charts = el('div', 'charts');
    charts.append(
      barChart(
        summary.perCase.map((c) => ({
          label: c.number + '. ' + c.title,
          value: c.pct,
          tooltip: c.title + ': ' + c.correct + ' of ' + c.answered + ' right',
        })),
        'Right verdicts per case'
      ),
      barChart(
        summary.picks.map((p) => ({
          label: p.id + '. ' + p.text,
          value: p.pct,
          tooltip: p.text + ': picked ' + p.count + ' times',
        })),
        'Share of questions asked'
      )
    );
    body.appendChild(charts);
  }

  async function loadReport() {
    $('report-class').value = reportClass;
    const shared = Store.mode === 'shared';
    $('report-mode').textContent = shared
      ? 'Anonymous totals from every device that used class code ' + reportClass + '.'
      : 'Anonymous totals from this device only. Run server.js to combine totals across student devices.';
    $('report-reset').hidden = shared;
    $('report-body').innerHTML = '<p class="muted">Loading…</p>';
    try {
      const totals = await Store.getTotals(reportClass);
      renderReport(Game.summarize(totals, CASES, QUESTIONS));
    } catch (err) {
      $('report-body').innerHTML = '';
      $('report-body').appendChild(el('p', 'error', err.message));
    }
  }

  $('report-form').addEventListener('submit', (e) => {
    e.preventDefault();
    reportClass = Store.normalizeClassCode($('report-class').value);
    loadReport();
  });
  $('report-refresh').addEventListener('click', loadReport);
  $('report-print').addEventListener('click', () => window.print());
  $('report-reset').addEventListener('click', () => {
    if (!window.confirm('Clear the totals for ' + reportClass + ' on this device?')) return;
    Store.resetLocal(reportClass);
    loadReport();
  });

  // ---- Boot --------------------------------------------------------------------

  setFib(document.querySelector('#screen-home .fib-avatar'), 'smug');
  Store.init(CASES.length).then(() => {
    if (location.hash === '#report') show('report');
  });
  goHome();
})();
