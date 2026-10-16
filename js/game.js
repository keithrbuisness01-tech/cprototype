// Game rules and class-report maths. No DOM access here, so the same file
// runs in the browser, in server.js, and in the tests.
(function (root) {
  const PICKS_PER_CASE = 3;
  const QUESTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'];
  // How many cases at each end of the run the report compares.
  const TREND_WINDOW = 3;

  const RANKS = [
    { name: 'Rookie', min: 0, pose: 'smug', fib: "Ha! I fooled you over and over. Come back when you've practised your questions." },
    { name: 'Detective', min: 0.4, pose: 'smug', fib: 'Not bad. But I still slipped a few past you. Next time I will slip in more.' },
    { name: 'Inspector', min: 0.7, pose: 'sulking', fib: "Hmph. You're getting annoying. I'll have to make my fakes better." },
    { name: 'Chief', min: 0.9, pose: 'impressed', fib: "Impossible! Fine. You're the Chief... for now." },
  ];

  // Ranks are shares of the cases in the set: with 10 cases that is
  // 0-3 Rookie, 4-6 Detective, 7-8 Inspector, 9-10 Chief.
  const lowest = (min, total) => Math.max(0, Math.ceil(min * total - 1e-9));

  function rankFor(score, total = 10) {
    let rank = RANKS[0];
    for (const r of RANKS) if (score >= lowest(r.min, total)) rank = r;
    return rank;
  }

  // [{ name, from, to }] score bands for a set of `total` cases.
  function rankBands(total) {
    return RANKS.map((r, i) => ({
      name: r.name,
      from: lowest(r.min, total),
      to: i + 1 < RANKS.length ? lowest(RANKS[i + 1].min, total) - 1 : total,
    }));
  }

  // ---- One player's run -------------------------------------------------

  function newRun(caseCount) {
    return { caseCount, index: 0, picks: [], guess: null, results: [] };
  }

  function canPick(run, questionId) {
    return run.guess === null &&
      run.picks.length < PICKS_PER_CASE &&
      QUESTION_IDS.includes(questionId) &&
      !run.picks.includes(questionId);
  }

  function pick(run, questionId) {
    if (!canPick(run, questionId)) return false;
    run.picks.push(questionId);
    return true;
  }

  function readyToGuess(run) {
    return run.guess === null && run.picks.length === PICKS_PER_CASE;
  }

  // guess is 'person' or 'ai'. Returns the result for this case, or null.
  function guess(run, answer, guessValue) {
    if (!readyToGuess(run) || (guessValue !== 'person' && guessValue !== 'ai')) return null;
    run.guess = guessValue;
    const result = { index: run.index, picks: run.picks.slice(), guess: guessValue, correct: guessValue === answer };
    run.results.push(result);
    return result;
  }

  function next(run) {
    if (run.guess === null) return false;
    run.index += 1;
    run.picks = [];
    run.guess = null;
    return true;
  }

  function isOver(run) {
    return run.index >= run.caseCount;
  }

  function scores(run) {
    const player = run.results.filter((r) => r.correct).length;
    return { player, fib: run.results.length - player };
  }

  // ---- Anonymous class totals ---------------------------------------------
  // Only counts are kept: no names, no per-student records.

  function emptyTotals(caseCount) {
    const picks = {};
    for (const id of QUESTION_IDS) picks[id] = 0;
    return {
      started: 0,
      finished: 0,
      cases: Array.from({ length: caseCount }, () => ({ answered: 0, correct: 0 })),
      picks,
      scores: Array(caseCount + 1).fill(0),
    };
  }

  // Applies one event to the totals. Returns false (and changes nothing) when
  // the event is malformed, so the server can reject junk.
  function applyEvent(totals, event) {
    if (!event || typeof event !== 'object') return false;
    const caseCount = totals.cases.length;
    if (event.type === 'start') {
      totals.started += 1;
      return true;
    }
    if (event.type === 'case') {
      const i = event.caseIndex;
      const picks = event.picks;
      if (!Number.isInteger(i) || i < 0 || i >= caseCount) return false;
      if (typeof event.correct !== 'boolean') return false;
      if (!Array.isArray(picks) || picks.length > PICKS_PER_CASE) return false;
      if (new Set(picks).size !== picks.length || !picks.every((p) => QUESTION_IDS.includes(p))) return false;
      totals.cases[i].answered += 1;
      if (event.correct) totals.cases[i].correct += 1;
      for (const p of picks) totals.picks[p] += 1;
      return true;
    }
    if (event.type === 'finish') {
      const s = event.score;
      if (!Number.isInteger(s) || s < 0 || s > caseCount) return false;
      totals.finished += 1;
      totals.scores[s] += 1;
      return true;
    }
    return false;
  }

  function pct(correct, answered) {
    return answered ? Math.round((100 * correct) / answered) : null;
  }

  function windowPct(cases) {
    const answered = cases.reduce((n, c) => n + c.answered, 0);
    const correct = cases.reduce((n, c) => n + c.correct, 0);
    return pct(correct, answered);
  }

  function summarize(totals, caseList, questionList) {
    const perCase = totals.cases.map((c, i) => ({
      number: i + 1,
      title: caseList[i] ? caseList[i].title : 'Case ' + (i + 1),
      kind: caseList[i] && caseList[i].item ? caseList[i].item.kind : null,
      verdict: caseList[i] ? caseList[i].verdict : null,
      lesson: caseList[i] ? caseList[i].lesson : null,
      answered: c.answered,
      correct: c.correct,
      pct: pct(c.correct, c.answered),
    }));
    const answered = perCase.reduce((n, c) => n + c.answered, 0);
    const finishedScoreSum = totals.scores.reduce((sum, count, score) => sum + count * score, 0);
    const window = Math.min(TREND_WINDOW, Math.floor(totals.cases.length / 2));
    const early = windowPct(totals.cases.slice(0, window));
    const late = windowPct(totals.cases.slice(totals.cases.length - window));

    const rankCounts = RANKS.map((r) => ({ name: r.name, count: 0 }));
    totals.scores.forEach((count, score) => {
      const idx = RANKS.indexOf(rankFor(score, totals.cases.length));
      rankCounts[idx].count += count;
    });

    const pickTotal = QUESTION_IDS.reduce((n, id) => n + totals.picks[id], 0);
    const picks = QUESTION_IDS.map((id) => {
      const q = questionList.find((x) => x.id === id);
      return { id, text: q ? q.text : id, count: totals.picks[id], pct: pct(totals.picks[id], pickTotal) };
    });

    // How often the class left each question unasked, out of every case answered.
    const skipped = picks
      .map((p) => ({ id: p.id, text: p.text, pct: answered ? Math.round(100 - (100 * p.count) / answered) : null }))
      .sort((a, b) => (b.pct || 0) - (a.pct || 0));
    // Cases most of the class got wrong, worst first.
    const fooledBy = perCase.filter((c) => c.pct !== null && c.pct < 50).sort((a, b) => a.pct - b.pct);

    let hardest = null;
    for (const c of perCase) {
      if (c.pct === null) continue;
      if (!hardest || c.pct < hardest.pct) hardest = c;
    }
    let leastPicked = null;
    if (pickTotal > 0) {
      for (const p of picks) if (!leastPicked || p.count < leastPicked.count) leastPicked = p;
    }

    let suggestion = null;
    if (hardest) {
      const lesson = caseList[hardest.number - 1] ? caseList[hardest.number - 1].lesson : '';
      suggestion = {
        caseNumber: hardest.number,
        caseTitle: hardest.title,
        casePct: hardest.pct,
        lesson,
        question: leastPicked,
      };
    }

    return {
      started: totals.started,
      finished: totals.finished,
      answered,
      averageScore: totals.finished ? Math.round((10 * finishedScoreSum) / totals.finished) / 10 : null,
      early,
      late,
      trendWindow: window,
      perCase,
      picks,
      skipped,
      fooledBy,
      rankCounts,
      suggestion,
    };
  }

  const api = {
    PICKS_PER_CASE,
    QUESTION_IDS,
    RANKS,
    rankFor,
    rankBands,
    newRun,
    canPick,
    pick,
    readyToGuess,
    guess,
    next,
    isOver,
    scores,
    emptyTotals,
    applyEvent,
    summarize,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AIDetectiveGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
