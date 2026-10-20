// Game rules and class-report maths. No DOM access here, so the same file
// runs in the browser, in server.js, and in the tests.
//
// Two kinds of case file (see js/casedata.js):
// - "detective": pick three of six questions, then Person or AI.
// - "investigate": open two of four checks, then Trust it or Don't trust it.
//   Strong checks earn points; a right verdict without one is a lucky guess.
(function (root) {
  const PICKS_PER_CASE = 3;
  const CHECKS_ALLOWED = 2;
  const CHECKS_PER_CASE = 4;
  const QUESTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'];
  // How many cases at each end of a run the report compares.
  const TREND_WINDOW = 3;

  const RANKS = [
    { name: 'Rookie', min: 0, pose: 'smug', fib: "Ha! I fooled you over and over. Come back when you've practised your questions.", neutral: 'Keep practising your questions. You will get sharper.' },
    { name: 'Detective', min: 0.4, pose: 'smug', fib: 'Not bad. But I still slipped a few past you. Next time I will slip in more.', neutral: 'Good work. A few cases still got past you.' },
    { name: 'Inspector', min: 0.7, pose: 'sulking', fib: "Hmph. You're getting annoying. I'll have to make my fakes better.", neutral: 'Strong work. Very few cases got past you.' },
    { name: 'Chief', min: 0.9, pose: 'impressed', fib: "Impossible! Fine. You're the Chief... for now.", neutral: 'Outstanding. You cracked nearly every case.' },
  ];

  // Neutral lines for Person-or-AI cases when Fib's trash talk is off.
  const DETECTIVE_NEUTRAL = { right: 'Right call.', wrong: 'Not this time. Read the lesson.' };

  // Results for "How would you check?" cases, with Fib's taunt and neutral lines.
  const OUTCOMES = {
    solved: {
      head: (pts) => 'Solved! +' + pts + ' points',
      detail: (strong) => 'Right call, backed by ' + strong + ' strong ' + (strong === 1 ? 'check' : 'checks') + '.',
      taunt: 'What? You actually checked. Lucky… I mean, fine.',
      neutral: 'Well investigated.',
      pose: 'caught',
    },
    lucky: {
      head: () => 'Right answer, weak case. +1 point',
      detail: () => 'Your verdict was right, but none of your checks could prove it. Fib gets a point for the lucky guess.',
      taunt: 'Ha! You guessed. A real detective needs proof.',
      neutral: 'Right answer, but it needed stronger checks.',
      pose: 'smug',
    },
    fooled: {
      head: () => 'Fooled! Fib scores 2',
      detail: () => 'Your verdict didn’t match the evidence. Look at which checks were strong.',
      taunt: 'Gotcha! One more for Fib.',
      neutral: 'Not this time. Look at the strong checks.',
      pose: 'smug',
    },
    good: {
      head: () => 'Good plan! +3 points',
      detail: () => 'You followed the rules and kept the thinking yours.',
      taunt: 'Boring! But… correct.',
      neutral: 'Responsible choice.',
      pose: 'caught',
    },
    bad: {
      head: () => 'Not quite. Fib scores 2',
      detail: () => 'That plan breaks the rules or skips your own thinking.',
      taunt: 'Ooh, risky. I like it. Your teacher won’t.',
      neutral: 'Look at the highlighted plan.',
      pose: 'smug',
    },
  };

  // The final screen of a "How would you check?" run.
  const FINISH = {
    won: { heading: 'Case closed. You win!', taunt: 'You beat me this time. Next semester I’m coming back with new tricks.', neutral: 'You outscored Fib. Great investigating.', pose: 'caught' },
    lost: { heading: 'Fib wins this round', taunt: 'Fib wins! Come back and try to catch me next time.', neutral: 'Fib won this round. Try again and use stronger checks.', pose: 'smug' },
  };

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

  function shuffle(list, random = Math.random) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Points for one "How would you check?" verdict.
  function investigateScore(correct, strongChecks) {
    if (correct && strongChecks > 0) return { outcome: 'solved', you: 2 + strongChecks, fib: 0 };
    if (correct) return { outcome: 'lucky', you: 1, fib: 1 };
    return { outcome: 'fooled', you: 0, fib: 2 };
  }

  function maxPoints(set) {
    if (set.rules !== 'investigate') return set.cases.length;
    return set.cases.reduce((sum, c) => sum + (c.kind === 'choose' ? 3 : 2 + Math.min(CHECKS_ALLOWED, c.checks.filter((k) => k.strong).length)), 0);
  }

  // ---- One player's run -------------------------------------------------
  // newRun(caseSet, { shuffled }) or newRun(caseCount) for a plain
  // Person-or-AI run in file order.

  function newRun(set, { shuffled = false, random } = {}) {
    const count = typeof set === 'number' ? set : set.cases.length;
    const indexes = Array.from({ length: count }, (_, i) => i);
    return {
      rules: typeof set === 'number' ? 'detective' : set.rules,
      caseCount: count,
      order: shuffled ? shuffle(indexes, random) : indexes,
      index: 0,
      picks: [],
      opened: [],
      done: false,
      results: [],
      you: 0,
      fib: 0,
    };
  }

  const caseIndex = (run) => run.order[run.index];

  function canPick(run, questionId) {
    return !run.done && run.picks.length < PICKS_PER_CASE && QUESTION_IDS.includes(questionId) && !run.picks.includes(questionId);
  }

  function pick(run, questionId) {
    if (!canPick(run, questionId)) return false;
    run.picks.push(questionId);
    return true;
  }

  function readyToGuess(run) {
    return !run.done && run.picks.length === PICKS_PER_CASE;
  }

  // Person or AI. Returns the result for this case, or null.
  function guess(run, answer, value) {
    if (!readyToGuess(run) || (value !== 'person' && value !== 'ai')) return null;
    run.done = true;
    const correct = value === answer;
    if (correct) run.you += 1;
    else run.fib += 1;
    const result = { index: caseIndex(run), position: run.index, picks: run.picks.slice(), guess: value, correct };
    run.results.push(result);
    return result;
  }

  function canOpen(run, check) {
    return !run.done && run.opened.length < CHECKS_ALLOWED && Number.isInteger(check) && check >= 0 && check < CHECKS_PER_CASE && !run.opened.includes(check);
  }

  function openCheck(run, check) {
    if (!canOpen(run, check)) return false;
    run.opened.push(check);
    return true;
  }

  // Trust it or Don't trust it, for an "investigate" case.
  function judge(run, c, verdict) {
    if (run.done || (verdict !== 'trust' && verdict !== 'distrust')) return null;
    run.done = true;
    const correct = verdict === c.verdict;
    const strong = run.opened.filter((i) => c.checks[i].strong).length;
    const score = investigateScore(correct, strong);
    run.you += score.you;
    run.fib += score.fib;
    const result = { index: caseIndex(run), position: run.index, checks: run.opened.slice(), verdict, correct, strong, ...score };
    run.results.push(result);
    return result;
  }

  // Pick a plan, for a "choose" case.
  function choose(run, c, option) {
    if (run.done || !Number.isInteger(option) || option < 0 || option >= c.options.length) return null;
    run.done = true;
    const correct = c.options[option].right;
    const score = correct ? { outcome: 'good', you: 3, fib: 0 } : { outcome: 'bad', you: 0, fib: 2 };
    run.you += score.you;
    run.fib += score.fib;
    const result = { index: caseIndex(run), position: run.index, choice: option, correct, ...score };
    run.results.push(result);
    return result;
  }

  function next(run) {
    if (!run.done) return false;
    run.index += 1;
    run.picks = [];
    run.opened = [];
    run.done = false;
    return true;
  }

  function isOver(run) {
    return run.index >= run.caseCount;
  }

  function scores(run) {
    return { player: run.you, fib: run.fib };
  }

  // What a student device sends after a case: which case, where it fell in
  // the run, and what was chosen. Never who, and never whether it was right:
  // the server works that out from the case file.
  function caseEvent(run, result) {
    const base = { type: 'case', caseIndex: result.index, position: result.position };
    if (result.picks) return Object.assign(base, { picks: result.picks, guess: result.guess });
    if (result.checks) return Object.assign(base, { checks: result.checks, verdict: result.verdict });
    return Object.assign(base, { choice: result.choice });
  }

  // ---- Anonymous class totals ---------------------------------------------
  // Only counts are kept: no names, no per-student records.

  function emptyTotals(set) {
    const n = set.cases.length;
    const totals = {
      rules: set.rules,
      started: 0,
      finished: 0,
      positions: Array.from({ length: n }, () => ({ answered: 0, correct: 0 })),
      scores: Array(maxPoints(set) + 1).fill(0),
    };
    if (set.rules === 'investigate') {
      totals.cases = set.cases.map((c) => (c.kind === 'choose'
        ? { answered: 0, correct: 0, choices: Array(c.options.length).fill(0) }
        : { answered: 0, correct: 0, solved: 0, lucky: 0, opened: Array(CHECKS_PER_CASE).fill(0) }));
      totals.checksOpened = { strong: 0, weak: 0 };
      const len = set.checkQuiz.length;
      totals.quiz = { pre: Array(len + 1).fill(0), post: Array(len + 1).fill(0), improved: 0, same: 0, dropped: 0 };
    } else {
      totals.cases = set.cases.map(() => ({ answered: 0, correct: 0 }));
      totals.picks = {};
      for (const id of QUESTION_IDS) totals.picks[id] = 0;
    }
    return totals;
  }

  // Exactly the fields a student device may send, per event.
  function eventKeys(set, event) {
    if (event.type === 'start') return ['type'];
    if (event.type === 'finish') {
      return set.rules === 'investigate' && ('pre' in event || 'post' in event) ? ['post', 'pre', 'score', 'type'] : ['score', 'type'];
    }
    if (event.type !== 'case') return null;
    const c = set.cases[event.caseIndex];
    if (!c) return null;
    if (set.rules === 'detective') return ['caseIndex', 'guess', 'picks', 'position', 'type'];
    if (c.kind === 'choose') return ['caseIndex', 'choice', 'position', 'type'];
    return ['caseIndex', 'checks', 'position', 'type', 'verdict'];
  }

  const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const unique = (list) => new Set(list).size === list.length;

  // Applies one event to the totals. Returns false (and changes nothing) when
  // the event is malformed or carries anything extra, so the server can
  // reject it.
  function applyEvent(totals, event, set) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
    const keys = eventKeys(set, event);
    if (!keys || Object.keys(event).sort().join() !== keys.join()) return false;
    const n = set.cases.length;
    if (event.type === 'start') {
      totals.started += 1;
      return true;
    }
    if (event.type === 'finish') {
      if (!int(event.score, 0, totals.scores.length - 1)) return false;
      if ('pre' in event) {
        const len = set.checkQuiz.length;
        if (!int(event.pre, 0, len) || !int(event.post, 0, len)) return false;
        totals.quiz.pre[event.pre] += 1;
        totals.quiz.post[event.post] += 1;
        if (event.post > event.pre) totals.quiz.improved += 1;
        else if (event.post === event.pre) totals.quiz.same += 1;
        else totals.quiz.dropped += 1;
      }
      totals.finished += 1;
      totals.scores[event.score] += 1;
      return true;
    }
    // A case.
    const i = event.caseIndex;
    if (!int(i, 0, n - 1) || !int(event.position, 0, n - 1)) return false;
    const c = set.cases[i];
    const t = totals.cases[i];
    let correct;
    if (set.rules === 'detective') {
      const picks = event.picks;
      if (!Array.isArray(picks) || picks.length > PICKS_PER_CASE || !unique(picks) || !picks.every((p) => QUESTION_IDS.includes(p))) return false;
      if (event.guess !== 'person' && event.guess !== 'ai') return false;
      correct = event.guess === c.verdict;
      for (const p of picks) totals.picks[p] += 1;
    } else if (c.kind === 'choose') {
      if (!int(event.choice, 0, c.options.length - 1)) return false;
      correct = c.options[event.choice].right;
      t.choices[event.choice] += 1;
    } else {
      const checks = event.checks;
      if (!Array.isArray(checks) || checks.length > CHECKS_ALLOWED || !unique(checks) || !checks.every((k) => int(k, 0, CHECKS_PER_CASE - 1))) return false;
      if (event.verdict !== 'trust' && event.verdict !== 'distrust') return false;
      correct = event.verdict === c.verdict;
      const strong = checks.filter((k) => c.checks[k].strong).length;
      for (const k of checks) {
        t.opened[k] += 1;
        totals.checksOpened[c.checks[k].strong ? 'strong' : 'weak'] += 1;
      }
      if (correct && strong > 0) t.solved += 1;
      else if (correct) t.lucky += 1;
    }
    t.answered += 1;
    if (correct) t.correct += 1;
    totals.positions[event.position].answered += 1;
    if (correct) totals.positions[event.position].correct += 1;
    return true;
  }

  function pct(part, whole) {
    return whole ? Math.round((100 * part) / whole) : null;
  }

  function windowPct(rows) {
    return pct(rows.reduce((s, r) => s + r.correct, 0), rows.reduce((s, r) => s + r.answered, 0));
  }

  function average(counts) {
    const n = counts.reduce((s, c) => s + c, 0);
    return n ? Math.round((10 * counts.reduce((s, c, v) => s + c * v, 0)) / n) / 10 : null;
  }

  function summarize(totals, set, questionList) {
    const investigate = set.rules === 'investigate';
    const perCase = totals.cases.map((t, i) => {
      const c = set.cases[i];
      const row = {
        number: i + 1,
        id: c.id,
        title: c.title,
        kind: investigate ? (c.kind === 'choose' ? 'plan' : c.evidence.type) : c.item.kind,
        verdict: investigate ? (c.kind === 'choose' ? null : c.verdict) : c.verdict,
        lesson: investigate ? c.explain : c.lesson,
        skill: investigate ? c.skill : null,
        answered: t.answered,
        correct: t.correct,
        pct: pct(t.correct, t.answered),
      };
      if (investigate && c.kind !== 'choose') {
        row.solvedPct = pct(t.solved, t.answered);
        row.luckyPct = pct(t.lucky, t.answered);
        row.checks = c.checks.map((k, j) => ({ label: k.label, strong: k.strong, pct: pct(t.opened[j], t.answered) }));
      }
      return row;
    });
    const answered = perCase.reduce((s, c) => s + c.answered, 0);
    const window = Math.min(TREND_WINDOW, Math.floor(totals.positions.length / 2));
    const fooledBy = perCase.filter((c) => c.pct !== null && c.pct < 50).sort((a, b) => a.pct - b.pct);

    let hardest = null;
    for (const c of perCase) if (c.pct !== null && (!hardest || c.pct < hardest.pct)) hardest = c;

    const summary = {
      rules: set.rules,
      started: totals.started,
      finished: totals.finished,
      answered,
      averageScore: average(totals.scores),
      maxScore: totals.scores.length - 1,
      early: windowPct(totals.positions.slice(0, window)),
      late: windowPct(totals.positions.slice(totals.positions.length - window)),
      trendWindow: window,
      perCase,
      fooledBy,
      suggestion: hardest ? { caseNumber: hardest.number, caseTitle: hardest.title, casePct: hardest.pct, lesson: hardest.lesson, skill: hardest.skill } : null,
    };

    if (investigate) {
      const opened = totals.checksOpened.strong + totals.checksOpened.weak;
      const investigated = totals.cases.filter((t, i) => set.cases[i].kind !== 'choose');
      const correctInvestigated = investigated.reduce((s, t) => s + t.correct, 0);
      const quizRuns = totals.quiz.pre.reduce((s, c) => s + c, 0);
      summary.strongShare = pct(totals.checksOpened.strong, opened);
      summary.luckyPct = pct(investigated.reduce((s, t) => s + t.lucky, 0), correctInvestigated);
      summary.quiz = {
        length: set.checkQuiz.length,
        runs: quizRuns,
        preAvg: average(totals.quiz.pre),
        postAvg: average(totals.quiz.post),
        improvedPct: pct(totals.quiz.improved, quizRuns),
        samePct: pct(totals.quiz.same, quizRuns),
        droppedPct: pct(totals.quiz.dropped, quizRuns),
      };
    } else {
      const pickTotal = QUESTION_IDS.reduce((s, id) => s + totals.picks[id], 0);
      summary.picks = QUESTION_IDS.map((id) => {
        const q = questionList.find((x) => x.id === id);
        return { id, text: q ? q.text : id, count: totals.picks[id], pct: pct(totals.picks[id], pickTotal) };
      });
      // How often the class left each question unasked, out of every case answered.
      summary.skipped = summary.picks
        .map((p) => ({ id: p.id, text: p.text, pct: answered ? Math.round(100 - (100 * p.count) / answered) : null }))
        .sort((a, b) => (b.pct || 0) - (a.pct || 0));
      summary.rankCounts = RANKS.map((r) => ({ name: r.name, count: 0 }));
      totals.scores.forEach((count, score) => {
        summary.rankCounts[RANKS.indexOf(rankFor(score, set.cases.length))].count += count;
      });
      if (summary.suggestion && pickTotal > 0) {
        summary.suggestion.question = summary.picks.reduce((least, p) => (p.count < least.count ? p : least));
      }
    }
    return summary;
  }

  const api = {
    PICKS_PER_CASE,
    CHECKS_ALLOWED,
    CHECKS_PER_CASE,
    QUESTION_IDS,
    RANKS,
    OUTCOMES,
    FINISH,
    DETECTIVE_NEUTRAL,
    rankFor,
    rankBands,
    shuffle,
    investigateScore,
    maxPoints,
    newRun,
    canPick,
    pick,
    readyToGuess,
    guess,
    canOpen,
    openCheck,
    judge,
    choose,
    next,
    isOver,
    scores,
    caseEvent,
    emptyTotals,
    eventKeys,
    applyEvent,
    summarize,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AIDetectiveGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
