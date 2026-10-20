// Student screens. Rules live in game.js, server traffic in store.js, Fib in
// fib.js, evidence drawing in evidence.js. Students never type anything except
// a class code, and nothing about them is stored or sent: see store.js.
(function () {
  const { QUESTIONS } = window.AIDetectiveCaseData;
  const Game = window.AIDetectiveGame;
  const Store = window.AIDetectiveStore;
  const Options = window.AIDetectiveOptions;
  const Sound = window.AIDetectiveSound;
  const Fib = window.AIDetectiveFib;
  const Evidence = window.AIDetectiveEvidence;
  const { el, ask } = window.AIDetectiveUI;

  const $ = (id) => document.getElementById(id);
  const screens = ['home', 'howto', 'quiz', 'case', 'inv', 'end', 'finish'];

  let sets = []; // case files this student may play
  let fixedSetId = null; // set by the teacher: no picker
  let chosenId = null;
  let set = null; // the case file being played
  let run = null;
  let quiz = null; // { phase: 'pre' | 'post', answers: [], pre }
  const quizDone = new Set(); // case files whose warm-up and wrap-up ran this visit
  let checkOrder = []; // shuffled display order of the four checks
  let panel = null;

  const taunts = () => Options.get().taunts;

  // ---- Navigation ------------------------------------------------------------

  function show(name) {
    for (const s of screens) $('screen-' + s).hidden = s !== name;
    $('scoreboard').hidden = !['case', 'inv', 'end', 'finish'].includes(name);
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
    quiz = null;
    return true;
  }

  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-go="home"]') && (await leaveGame())) showHome();
    if (e.target.closest('[data-choose]')) showHome();
    if (e.target.closest('[data-again]')) startRun(true);
  });

  function scrollToNode(node, block) {
    node.scrollIntoView({ behavior: Options.get().reducedMotion ? 'auto' : 'smooth', block });
  }

  const progressText = (position) => set.label + ': case ' + (position + 1) + ' of ' + set.cases.length;

  // ---- Start screen: joining and choosing a case file ---------------------------

  const JOIN_ERRORS = {
    missing: "That code doesn't match a class. Check it with your teacher.",
    expired: 'That class code has expired. Ask your teacher for the new one.',
    'slow-down': 'Too many tries. Wait a minute, then try again.',
    network: "Couldn't reach the classroom server. Check the connection and try again.",
  };

  function useSets(list, defaultId, settings) {
    sets = list;
    fixedSetId = settings && settings.caseSetId ? settings.caseSetId : null;
    window.AIDetectiveClass = { soundMuted: Boolean(settings && settings.soundMuted) };
    if (panel) panel.lockSound(window.AIDetectiveClass.soundMuted);
    if (!sets.some((s) => s.id === chosenId)) chosenId = fixedSetId || defaultId || sets[0].id;
    renderPicker();
    $('start-btn').disabled = false;
  }

  function setFacts(s) {
    return s.rules === 'investigate'
      ? [s.cases.length + ' cases', '4 checks each', '1 rival']
      : [s.cases.length + ' cases', '6 questions', '1 rival'];
  }

  function renderPicker() {
    const fixed = fixedSetId && sets.find((s) => s.id === fixedSetId);
    $('picker-block').hidden = Boolean(fixed);
    $('fixed-set').hidden = !fixed;
    if (fixed) $('fixed-set').textContent = 'Your teacher picked the case file: ' + fixed.label + ' · ' + fixed.blurb;
    const picker = $('picker');
    picker.innerHTML = '';
    for (const s of sets) {
      const b = el('button', 'set-btn');
      b.type = 'button';
      b.dataset.set = s.id;
      b.setAttribute('aria-pressed', String(s.id === chosenId));
      b.append(el('b', null, s.label), el('span', null, s.blurb));
      b.addEventListener('click', () => {
        chosenId = s.id;
        renderPicker();
      });
      picker.appendChild(b);
    }
    const chosen = sets.find((s) => s.id === chosenId);
    if (!chosen) return;
    const facts = setFacts(chosen);
    $('kicker').innerHTML = '';
    facts.forEach((f, i) => {
      if (i) $('kicker').append(' ', el('span', null, '/'), ' ');
      $('kicker').append(f);
    });
    $('kicker').querySelectorAll('span').forEach((sp) => sp.setAttribute('aria-hidden', 'true'));
    $('lead').textContent = chosen.rules === 'investigate'
      ? 'How would you check? Run two of four checks on each case, then decide whether to trust it. You score by checking well, not by guessing.'
      : 'Read each case. Ask three of the six detective questions. Then decide: made by a person, or made by AI?';
    $('pack-note').hidden = !chosen.pack;
    if (chosen.pack) $('pack-note').textContent = 'Case pack: ' + chosen.pack + '. ' + (chosen.packNote || '');
  }

  function showJoinForm(message) {
    sets = [];
    $('join').hidden = false;
    $('joined').hidden = true;
    $('picker-block').hidden = true;
    $('fixed-set').hidden = true;
    $('pack-note').hidden = true;
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
    $('join').hidden = true;
    $('joined').hidden = false;
    $('joined-detail').textContent = result.settings.caseSetId ? 'Your teacher picked the case file' : 'Choose a case file below';
    useSets(result.caseSets, result.defaultSetId, result.settings);
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

  function showHome() {
    run = null;
    quiz = null;
    renderPicker();
    show('home');
  }

  // ---- Starting a run ------------------------------------------------------------

  function updateScore() {
    $('score-you').textContent = run ? run.you : 0;
    $('score-fib').textContent = run ? run.fib : 0;
  }

  // First play of a case file uses the file's order; "Play again" shuffles.
  function startRun(shuffled) {
    set = sets.find((s) => s.id === chosenId);
    if (!set) return;
    run = Game.newRun(set, { shuffled });
    Store.send(set.id, { type: 'start' });
    updateScore();
    if (shuffled) {
      quiz = null;
      firstCase();
      return;
    }
    $('howto-detective').hidden = set.rules !== 'detective';
    $('howto-investigate').hidden = set.rules !== 'investigate';
    if (set.rules === 'detective') {
      $('ranks-line').innerHTML = '';
      for (const band of Game.rankBands(set.cases.length)) $('ranks-line').appendChild(el('span', null, band.from + '–' + band.to + ' ' + band.name));
    }
    show('howto');
  }

  function firstCase() {
    if (set.rules === 'detective') renderCase();
    else renderInvestigate();
  }

  $('start-btn').addEventListener('click', () => startRun(false));
  $('howto-go').addEventListener('click', () => {
    // The warm-up runs once per case file per visit, before the first play.
    if (set.rules === 'investigate' && !quizDone.has(set.id)) startQuiz('pre');
    else firstCase();
  });

  // ---- Warm-up and wrap-up ---------------------------------------------------------

  function startQuiz(phase) {
    quiz = { phase, answers: Array(set.checkQuiz.length).fill(null), pre: quiz ? quiz.pre : null };
    const pre = phase === 'pre';
    $('quiz-step').textContent = pre ? 'Before the cases' : 'After the cases';
    $('quiz-title').textContent = pre ? 'Warm-up' : 'Wrap-up';
    $('quiz-intro').textContent = pre
      ? set.checkQuiz.length + ' quick questions before the cases. Just answer what you think right now.'
      : 'The same ' + set.checkQuiz.length + ' questions again. See what changed.';
    $('quiz-go').textContent = pre ? 'Start the cases' : 'See my results';
    $('quiz-error').hidden = true;
    const list = $('quiz');
    list.innerHTML = '';
    set.checkQuiz.forEach((q, qi) => {
      const li = el('li', 'quiz-q');
      const legend = el('p', 'quiz-question', q.question);
      legend.id = 'quiz-q-' + qi;
      const group = el('div', 'quiz-options');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-labelledby', legend.id);
      q.options.forEach((option, oi) => {
        const b = el('button', 'quiz-option', option);
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          quiz.answers[qi] = oi;
          for (const other of group.children) other.setAttribute('aria-pressed', String(other === b));
        });
        group.appendChild(b);
      });
      li.append(legend, group);
      list.appendChild(li);
    });
    show('quiz');
  }

  $('quiz-go').addEventListener('click', () => {
    if (quiz.answers.some((a) => a === null)) {
      $('quiz-error').hidden = false;
      $('quiz-error').textContent = 'Answer all ' + set.checkQuiz.length + ' questions to continue.';
      return;
    }
    const score = quiz.answers.filter((a, i) => a === set.checkQuiz[i].answer).length;
    if (quiz.phase === 'pre') {
      quiz.pre = score;
      firstCase();
    } else {
      quiz.post = score;
      quizDone.add(set.id);
      finishInvestigate();
    }
  });

  // ---- Person or AI cases ----------------------------------------------------------

  const cases = () => set.cases;
  const currentCase = () => cases()[run.order[run.index]];

  function renderCase() {
    const c = currentCase();
    $('case-tag').textContent = progressText(run.index);
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
    for (const b of document.querySelectorAll('#screen-case .verdict-btn')) b.disabled = false;
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
      btn.disabled = picked || left === 0 || run.done;
      btn.setAttribute('aria-pressed', String(picked));
    }
  }

  // Only the clue for a chosen question is ever shown before the verdict.
  function onPick(id) {
    if (!Game.pick(run, id)) return;
    const clue = $('questions').querySelector('[data-id="' + id + '"] .clue');
    clue.textContent = currentCase().clues[id];
    clue.hidden = false;
    Sound.play('clue');
    updatePickState();
    if (Game.readyToGuess(run)) {
      $('verdict').hidden = false;
      scrollToNode($('verdict'), 'nearest');
    }
  }

  function onGuess(value) {
    const c = currentCase();
    const result = Game.guess(run, c.verdict, value);
    if (!result) return;
    for (const b of document.querySelectorAll('#screen-case .verdict-btn')) b.disabled = true;
    updatePickState();
    updateScore();
    Store.send(set.id, Game.caseEvent(run, result));

    const banner = $('result-banner');
    banner.className = 'result-banner ' + (result.correct ? 'right' : 'wrong');
    Sound.play(result.correct ? 'right' : 'wrong');
    banner.innerHTML = '';
    banner.append(
      el('span', 'stamp', result.correct ? 'Case cracked' : 'Fooled!'),
      el('span', 'stamp-note', result.correct ? 'Point to the Detective.' : 'Point to Fib.')
    );
    Fib.set($('reveal-fib'), result.correct ? 'caught' : 'smug');
    $('reveal-speech').textContent = taunts()
      ? (result.correct ? c.fib.right : c.fib.wrong)
      : (result.correct ? Game.DETECTIVE_NEUTRAL.right : Game.DETECTIVE_NEUTRAL.wrong);
    $('reveal-verdict').textContent = c.verdictNote || (c.verdict === 'ai' ? 'AI.' : 'Person.');
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

  $('next-btn').addEventListener('click', () => {
    Game.next(run);
    if (Game.isOver(run)) finishDetective();
    else renderCase();
  });
  for (const b of document.querySelectorAll('#screen-case .verdict-btn')) {
    b.addEventListener('click', () => onGuess(b.dataset.guess));
  }

  function finishDetective() {
    const s = Game.scores(run);
    const rank = Game.rankFor(s.player, cases().length);
    Store.send(set.id, { type: 'finish', score: s.player });
    $('progress-fill').style.width = '100%';
    $('end-score').textContent = s.player;
    $('end-total').textContent = cases().length;
    $('end-rank').textContent = rank.name;
    Fib.set($('end-fib'), rank.pose);
    $('end-speech').textContent = taunts() ? rank.fib : rank.neutral;

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
    endButtons($('screen-end'));
    run = null;
    show('end');
  }

  // "Choose another case file" only when the student may choose.
  function endButtons(screen) {
    screen.querySelector('[data-choose]').hidden = Boolean(fixedSetId);
  }

  // ---- "How would you check?" cases ----------------------------------------------

  function renderInvestigate() {
    const c = currentCase();
    $('inv-tag').textContent = progressText(run.index);
    $('inv-title').textContent = c.title;
    $('inv-progress').style.width = (run.index / cases().length) * 100 + '%';
    const ev = $('inv-evidence');
    ev.innerHTML = '';
    ev.appendChild(Evidence.render(c.evidence));
    Fib.set($('inv-fib'), 'scheming');
    $('inv-speech').textContent = taunts() ? c.fib.taunt : c.fib.neutral;
    $('inv-result').hidden = true;

    const investigate = c.kind === 'investigate';
    $('inv-checks-block').hidden = !investigate;
    $('inv-options-block').hidden = investigate;
    if (investigate) {
      // A new order each time, so the strong checks aren't always on top.
      checkOrder = Game.shuffle(c.checks.map((_, i) => i));
      renderChecks();
      for (const b of document.querySelectorAll('#inv-checks-block .verdict-btn')) b.disabled = false;
    } else {
      const list = $('inv-options');
      list.innerHTML = '';
      c.options.forEach((option, i) => {
        const li = el('li');
        const b = el('button', 'plan-btn', option.text);
        b.type = 'button';
        b.dataset.option = i;
        b.addEventListener('click', () => onChoose(i));
        li.appendChild(b);
        list.appendChild(li);
      });
    }
    show('inv');
  }

  function renderChecks() {
    const c = currentCase();
    const left = Game.CHECKS_ALLOWED - run.opened.length;
    $('inv-count').textContent = run.done ? 'Done' : left > 0 ? 'Time for ' + left + (left === 1 ? ' more check' : ' checks') : 'No more checks';
    const list = $('inv-checks');
    list.innerHTML = '';
    for (const i of checkOrder) {
      const check = c.checks[i];
      const opened = run.opened.includes(i);
      const li = el('li', 'check' + (opened ? ' opened' : ''));
      const b = el('button', 'check-btn', check.label);
      b.type = 'button';
      b.disabled = opened || left <= 0 || run.done;
      b.setAttribute('aria-pressed', String(opened));
      b.addEventListener('click', () => {
        if (!Game.openCheck(run, i)) return;
        Sound.play('clue');
        renderChecks();
      });
      li.appendChild(b);
      if (opened) li.appendChild(el('p', 'check-result', check.result));
      // Every check's label shows once it's opened, and all show after the verdict.
      if (opened || run.done) {
        li.appendChild(el('span', 'check-tag ' + (check.strong ? 'strong' : 'weak'), check.strong ? 'Strong check' : 'Weak check'));
      }
      list.appendChild(li);
    }
  }

  function showResult(result, c) {
    const o = Game.OUTCOMES[result.outcome];
    const good = result.outcome === 'solved' || result.outcome === 'good';
    const banner = $('inv-banner');
    banner.className = 'result-banner ' + (good ? 'right' : result.outcome === 'lucky' ? 'lucky' : 'wrong');
    banner.innerHTML = '';
    banner.append(el('span', 'stamp', o.head(result.you)));
    $('inv-detail').textContent = o.detail(result.strong);
    $('inv-explain').textContent = c.explain;
    $('inv-skill').textContent = c.skill;
    Fib.set($('inv-fib'), o.pose);
    $('inv-speech').textContent = taunts() ? o.taunt : o.neutral;
    Sound.play(good ? 'right' : 'wrong');
    updateScore();
    Store.send(set.id, Game.caseEvent(run, result));
    $('inv-next').textContent = run.index + 1 >= cases().length ? (quiz && quiz.phase === 'pre' ? 'Go to the wrap-up' : 'See the results') : 'Next case';
    $('inv-result').hidden = false;
    scrollToNode($('inv-result'), 'start');
  }

  for (const b of document.querySelectorAll('#inv-checks-block .verdict-btn')) {
    b.addEventListener('click', () => {
      const c = currentCase();
      const result = Game.judge(run, c, b.dataset.verdict);
      if (!result) return;
      for (const v of document.querySelectorAll('#inv-checks-block .verdict-btn')) v.disabled = true;
      renderChecks();
      showResult(result, c);
    });
  }

  function onChoose(i) {
    const c = currentCase();
    const result = Game.choose(run, c, i);
    if (!result) return;
    for (const b of $('inv-options').querySelectorAll('button')) {
      b.disabled = true;
      const option = c.options[Number(b.dataset.option)];
      if (option.right) b.classList.add('right');
      else if (Number(b.dataset.option) === i) b.classList.add('wrong');
    }
    showResult(result, c);
  }

  $('inv-next').addEventListener('click', () => {
    Game.next(run);
    if (!Game.isOver(run)) renderInvestigate();
    else if (quiz && quiz.phase === 'pre') startQuiz('post');
    else finishInvestigate();
  });

  function finishInvestigate() {
    const s = Game.scores(run);
    const won = s.player > s.fib;
    const f = won ? Game.FINISH.won : Game.FINISH.lost;
    const withQuiz = quiz && quiz.post !== undefined;
    const event = { type: 'finish', score: s.player };
    if (withQuiz) Object.assign(event, { pre: quiz.pre, post: quiz.post });
    Store.send(set.id, event);

    $('finish-pack').textContent = set.pack ? 'Case pack: ' + set.pack : set.label;
    $('finish-title').textContent = f.heading;
    $('finish-score').textContent = 'You ' + s.player + ', Fib ' + s.fib;
    Fib.set($('finish-fib'), f.pose);
    $('finish-speech').textContent = taunts() ? f.taunt : f.neutral;
    const cards = $('finish-cards');
    cards.innerHTML = '';
    const card = (big, label) => {
      const d = el('div', 'scorecard');
      d.append(el('span', 'big', big), el('span', null, label));
      cards.appendChild(d);
    };
    if (withQuiz) {
      const len = set.checkQuiz.length;
      const diff = quiz.post - quiz.pre;
      card(quiz.pre + '/' + len, 'Warm-up');
      card(quiz.post + '/' + len, 'Wrap-up');
      card((diff > 0 ? '+' : '') + diff, 'Change');
    } else {
      card(s.player + '/' + Game.maxPoints(set), 'Your points');
      card(String(s.fib), 'Fib’s points');
    }
    const talk = $('finish-talk');
    talk.innerHTML = '';
    for (const q of set.discussion) talk.appendChild(el('li', null, q));
    endButtons($('screen-finish'));
    run = null;
    quiz = null;
    show('finish');
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
        const demo = await Store.demoCaseSets();
        useSets(demo.caseSets, demo.defaultSetId, null);
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
