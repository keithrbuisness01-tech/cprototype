// Student screens. Rules live in game.js, server traffic in store.js, Fib in
// fib.js. Students never type anything except a class code, and nothing about
// them is stored or sent: see store.js.
(function () {
  const { QUESTIONS } = window.AIDetectiveCaseData;
  const Game = window.AIDetectiveGame;
  const Store = window.AIDetectiveStore;
  const Options = window.AIDetectiveOptions;
  const Sound = window.AIDetectiveSound;
  const Fib = window.AIDetectiveFib;
  const { el, ask } = window.AIDetectiveUI;

  const $ = (id) => document.getElementById(id);
  const screens = ['home', 'howto', 'case', 'end'];

  let caseSet = null;
  let run = null;
  let panel = null;

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
  }

  async function leaveGame() {
    if (run && !Game.isOver(run) && run.results.length > 0 &&
        !(await ask('Leave this game? Your score so far will be lost.', 'Leave game'))) return false;
    run = null;
    return true;
  }

  document.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-go="home"]');
    if (target && (await leaveGame())) show('home');
  });

  function scrollToNode(node, block) {
    node.scrollIntoView({ behavior: Options.get().reducedMotion ? 'auto' : 'smooth', block });
  }

  // ---- Joining a class ---------------------------------------------------------

  const JOIN_ERRORS = {
    missing: "That code doesn't match a class. Check it with your teacher.",
    expired: 'That class code has expired. Ask your teacher for the new one.',
    'slow-down': 'Too many tries. Wait a minute, then try again.',
    network: "Couldn't reach the classroom server. Check the connection and try again.",
  };

  function useCaseSet(set, settings) {
    caseSet = set;
    window.AIDetectiveClass = { soundMuted: Boolean(settings && settings.soundMuted) };
    if (panel) panel.lockSound(window.AIDetectiveClass.soundMuted);
    $('case-count').textContent = set.cases.length;
    $('ranks-line').innerHTML = '';
    for (const band of Game.rankBands(set.cases.length)) {
      $('ranks-line').appendChild(el('span', null, band.from + '–' + band.to + ' ' + band.name));
    }
    $('start-btn').disabled = false;
  }

  function showJoinForm(message) {
    caseSet = null;
    $('join').hidden = false;
    $('joined').hidden = true;
    $('start-btn').disabled = true;
    $('join-error').hidden = !message;
    $('join-error').textContent = message || '';
  }

  async function joinWith(code) {
    $('join-btn').disabled = true;
    const result = await Store.join(code);
    $('join-btn').disabled = false;
    if (result.error) {
      showJoinForm(JOIN_ERRORS[result.error]);
      return;
    }
    useCaseSet(result.caseSet, result.settings);
    $('join').hidden = true;
    $('joined').hidden = false;
    $('joined-detail').textContent = 'Grade ' + result.caseSet.grade + ' · ' + result.caseSet.cases.length + ' cases';
  }

  // Only letters and numbers from the code alphabet can be typed.
  $('class-code').addEventListener('input', () => {
    const clean = Store.cleanCode($('class-code').value);
    if (clean !== $('class-code').value) $('class-code').value = clean;
  });

  $('join').addEventListener('submit', (e) => {
    e.preventDefault();
    joinWith($('class-code').value);
  });

  $('change-class').addEventListener('click', () => {
    Store.leave();
    $('class-code').value = '';
    showJoinForm('');
    $('class-code').focus();
  });

  // ---- A run -----------------------------------------------------------------

  const cases = () => caseSet.cases;

  function startRun() {
    if (!caseSet) return;
    run = Game.newRun(cases().length);
    Store.send({ type: 'start' });
    updateScore();
    show('howto');
  }

  function updateScore() {
    const s = run ? Game.scores(run) : { player: 0, fib: 0 };
    $('score-you').textContent = s.player;
    $('score-fib').textContent = s.fib;
  }

  function renderCase() {
    const c = cases()[run.index];
    $('case-tag').textContent = 'Case ' + (run.index + 1) + ' of ' + cases().length;
    $('case-kind').textContent = c.item.kind;
    $('case-title').textContent = c.title;
    $('case-setup').textContent = c.item.description;
    $('progress-fill').style.width = (run.index / cases().length) * 100 + '%';

    const list = $('questions');
    list.innerHTML = '';
    for (const q of QUESTIONS) {
      const li = el('li', 'question');
      li.dataset.id = q.id;
      const btn = el('button', 'question-btn');
      btn.type = 'button';
      btn.append(el('span', 'q-letter', q.id), el('span', 'q-text', q.text));
      btn.addEventListener('click', () => onPick(q.id));
      const clue = el('p', 'clue');
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
      const picked = run.picks.includes(li.dataset.id);
      const btn = li.querySelector('button');
      li.classList.toggle('picked', picked);
      li.classList.toggle('unpicked', !picked && left === 0);
      btn.disabled = picked || left === 0 || run.guess !== null;
      btn.setAttribute('aria-pressed', String(picked));
    }
  }

  // Only the clue for a chosen question is ever shown before the verdict.
  function onPick(id) {
    if (!Game.pick(run, id)) return;
    const clue = $('questions').querySelector('[data-id="' + id + '"] .clue');
    clue.textContent = cases()[run.index].clues[id];
    clue.hidden = false;
    Sound.play('clue');
    updatePickState();
    if (Game.readyToGuess(run)) {
      $('verdict').hidden = false;
      scrollToNode($('verdict'), 'nearest');
    }
  }

  function onGuess(value) {
    const c = cases()[run.index];
    const result = Game.guess(run, c.verdict, value);
    if (!result) return;
    for (const b of document.querySelectorAll('.verdict-btn')) b.disabled = true;
    updatePickState();
    updateScore();
    Store.send({ type: 'case', caseIndex: result.index, correct: result.correct, picks: result.picks });

    const banner = $('result-banner');
    banner.className = 'result-banner ' + (result.correct ? 'right' : 'wrong');
    Sound.play(result.correct ? 'right' : 'wrong');
    banner.innerHTML = '';
    banner.append(
      el('span', 'stamp', result.correct ? 'Case cracked' : 'Fooled!'),
      el('span', 'stamp-note', result.correct ? 'Point to the Detective.' : 'Point to Fib.')
    );
    Fib.set($('reveal-fib'), result.correct ? 'caught' : 'smug');
    $('reveal-speech').textContent = result.correct ? c.fib.right : c.fib.wrong;
    $('reveal-verdict').textContent = c.verdictNote;
    $('reveal-lesson').textContent = c.lesson;

    const others = $('other-clues');
    others.innerHTML = '';
    for (const q of QUESTIONS) {
      if (result.picks.includes(q.id)) continue;
      const li = el('li');
      li.append(el('strong', null, q.id + '. ' + q.text + ' '), document.createTextNode(c.clues[q.id]));
      others.appendChild(li);
    }
    $('reveal').querySelector('details').open = false;

    $('next-btn').textContent = run.index + 1 >= cases().length ? 'See my rank' : 'Next case';
    $('verdict').hidden = true;
    $('reveal').hidden = false;
    scrollToNode($('reveal'), 'start');
  }

  function onNext() {
    Game.next(run);
    if (Game.isOver(run)) finishRun();
    else renderCase();
  }

  // The session ends here: no replay loop, streaks or rewards.
  function finishRun() {
    const s = Game.scores(run);
    const rank = Game.rankFor(s.player, cases().length);
    Store.send({ type: 'finish', score: s.player });
    $('progress-fill').style.width = '100%';
    $('end-score').textContent = s.player;
    $('end-total').textContent = cases().length;
    $('end-rank').textContent = rank.name;
    Fib.set($('end-fib'), rank.pose);
    $('end-speech').textContent = rank.fib;

    const recap = $('recap');
    recap.innerHTML = '';
    for (const r of run.results) {
      const c = cases()[r.index];
      const li = el('li', r.correct ? 'right' : 'wrong');
      const mark = el('span', 'recap-mark', r.correct ? '✓' : '✗');
      mark.setAttribute('aria-label', r.correct ? 'right' : 'wrong');
      const body = el('div');
      body.append(el('strong', null, c.title), el('p', null, c.lesson));
      li.append(mark, body);
      recap.appendChild(li);
    }
    run = null;
    show('end');
  }

  $('start-btn').addEventListener('click', startRun);
  $('howto-go').addEventListener('click', renderCase);
  $('next-btn').addEventListener('click', onNext);
  for (const b of document.querySelectorAll('.verdict-btn')) {
    b.addEventListener('click', () => onGuess(b.dataset.guess));
  }

  // ---- Options panel -----------------------------------------------------------

  const signIn = el('button', 'text-link', 'Teacher sign-in');
  signIn.type = 'button';
  signIn.addEventListener('click', async () => {
    panel.close(false);
    if (Store.mode !== 'server') {
      await ask('Teacher tools need the classroom server. This copy is a demo.', 'OK');
      return;
    }
    if (await leaveGame()) window.location.href = 'sign-in';
  });
  panel = window.AIDetectiveOptionsPanel.mount({ footer: signIn });

  // ---- Boot --------------------------------------------------------------------

  async function boot() {
    show('home');
    // A self-contained demo page carries no art files; use the placeholders.
    if (!document.getElementById('demo-data')) await Fib.load('');
    Fib.set($('home-fib'), 'scheming');
    const mode = await Store.init();
    if (mode === 'demo') {
      $('demo-note').hidden = false;
      try {
        useCaseSet(await Store.demoCaseSet(), null);
      } catch (e) {
        $('demo-note').textContent = "This demo couldn't load its cases. Open it through the classroom server instead.";
      }
      return;
    }
    // A join link looks like /?class=ABC234. Take the code, then tidy the URL.
    const params = new URLSearchParams(window.location.search);
    const fromLink = Store.cleanCode(params.get('class'));
    if (params.has('class')) history.replaceState(null, '', window.location.pathname);
    const code = fromLink || Store.savedCode();
    if (code) {
      $('class-code').value = code;
      await joinWith(code);
    } else {
      showJoinForm('');
    }
  }

  boot();
})();
