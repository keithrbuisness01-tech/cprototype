// AI lesson planner for teachers. Runs on the server only: the browser never
// sees the API key or talks to Anthropic. Claude receives anonymous class
// totals and the case set's content, never anything about a student, the
// teacher, the class label or the join code.
const MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 8000;
// Dollars per million tokens. Server-side fallbacks may run an attempt on a
// pricier model, so the cap counts every attempt at the highest rate.
const PRICE = { 'claude-opus-5-5': { input: 4, output: 20 } };
const WORST = { input: 5, output: 25 };
// A refused attempt plus a fallback attempt can each use the full output budget.
const WORST_ATTEMPTS = 2;

const SYSTEM = [
  'You help a middle school English teacher plan the next lesson after their class played AI Detective.',
  'The game has two kinds of case file. In "detective" files, students judge whether an item was made by a',
  'person or by AI by choosing three of six detective questions. In "investigate" files, students open two',
  'of four checks (each strong or weak) and decide whether to trust an item; a right verdict without a',
  'strong check counts as a lucky guess. You receive only anonymous class totals: there is no information',
  'about any individual student, so never ask for any or speculate about individuals.',
  '',
  'Write a plan for one class period (about 45 minutes) that targets what the totals show the class',
  'struggled with. Use these headings, in plain text with no markdown symbols:',
  'Goal, Warm-up, Main activity, Discussion questions, Exit ticket.',
  'Refer to cases by their titles and to questions by their letters. Keep it under 400 words, practical,',
  'and suitable for the grade given. Do not suggest using AI detection tools.',
].join('\n');

function monthKey(t) {
  const d = new Date(t);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// Exactly what Claude is told about the class. Built from the report summary,
// field by field, so nothing else can slip in.
function plannerInput(summary, caseSet) {
  const input = {
    grade: caseSet.grade === null ? 'grades 6 to 8' : caseSet.grade,
    caseFile: caseSet.title,
    rules: caseSet.rules,
    studentsStarted: summary.started,
    studentsFinished: summary.finished,
    averageScore: summary.averageScore,
    maxScore: summary.maxScore,
    percentRightFirstCases: summary.early,
    percentRightLastCases: summary.late,
    cases: summary.perCase.map((c) => {
      const row = {
        number: c.number,
        title: c.title,
        itemKind: c.kind,
        answer: c.verdict,
        lesson: c.lesson,
        timesAnswered: c.answered,
        percentRight: c.pct,
      };
      if (c.skill) row.skill = c.skill;
      if (c.solvedPct !== undefined) {
        row.percentSolvedWithStrongCheck = c.solvedPct;
        row.percentLuckyGuess = c.luckyPct;
        row.checks = c.checks.map((k) => ({ check: k.label, strong: k.strong, percentOpened: k.pct }));
      }
      return row;
    }),
  };
  if (caseSet.rules === 'investigate') {
    input.percentOfOpenedChecksThatWereStrong = summary.strongShare;
    input.percentOfRightAnswersThatWereLuckyGuesses = summary.luckyPct;
    input.warmUpAndWrapUp = {
      questions: summary.quiz.length,
      averageWarmUp: summary.quiz.preAvg,
      averageWrapUp: summary.quiz.postAvg,
      percentImproved: summary.quiz.improvedPct,
    };
  } else {
    input.questions = summary.picks.map((p) => ({
      letter: p.id,
      question: p.text,
      shareOfAllPicksPercent: p.pct,
      percentOfCasesSkipped: (summary.skipped.find((s) => s.id === p.id) || {}).pct,
    }));
  }
  return input;
}

function estimateInputTokens(text) {
  // Generous: about 3 characters per token.
  return Math.ceil(text.length / 3) + 50;
}

function worstCaseUsd(inputTokens) {
  return (WORST_ATTEMPTS * (inputTokens * WORST.input + MAX_TOKENS * WORST.output)) / 1e6;
}

function actualUsd(response) {
  const usage = response && response.usage;
  if (!usage) return null;
  const tokens = (u) => ({
    input: (u.input_tokens || 0) + 1.25 * (u.cache_creation_input_tokens || 0) + 0.1 * (u.cache_read_input_tokens || 0),
    output: u.output_tokens || 0,
  });
  if (Array.isArray(usage.iterations) && usage.iterations.length) {
    return usage.iterations.reduce((sum, it) => {
      const t = tokens(it);
      return sum + (t.input * WORST.input + t.output * WORST.output) / 1e6;
    }, 0);
  }
  const price = PRICE[response.model] || WORST;
  const t = tokens(usage);
  return (t.input * price.input + t.output * price.output) / 1e6;
}

function plannerService(store, config, { client, now = () => Date.now() } = {}) {
  let reserved = 0;
  const busy = new Set();

  function month() {
    const key = monthKey(now());
    const all = store.spend.data;
    if (!all[key]) all[key] = { usd: 0, calls: 0 };
    return all[key];
  }

  function budget() {
    const m = month();
    return { month: monthKey(now()), usedUsd: Math.round(m.usd * 100) / 100, capUsd: config.ai.monthlyCapUsd };
  }

  // Returns { status, body } for the route to send.
  async function plan(teacherEmail, summary, caseSet) {
    if (!config.ai.enabled || !client) return { status: 503, body: { error: 'planner-off', message: 'The lesson planner is not set up on this server.' } };
    if (summary.answered === 0) return { status: 409, body: { error: 'no-data', message: 'Your class needs to play some cases first.' } };
    if (busy.has(teacherEmail)) return { status: 429, body: { error: 'busy', message: 'A plan is already being written. Wait for it to finish.' } };

    const input = plannerInput(summary, caseSet);
    const userText = 'Anonymous class totals (JSON):\n' + JSON.stringify(input, null, 2) + '\n\nWrite the lesson plan.';
    const worst = worstCaseUsd(estimateInputTokens(SYSTEM + userText));
    const m = month();
    if (m.usd + reserved + worst > config.ai.monthlyCapUsd) {
      return { status: 402, body: { error: 'budget-reached', message: "This month's lesson-planner budget is used up. It resets on the 1st.", budget: budget() } };
    }

    reserved += worst;
    busy.add(teacherEmail);
    let charged = 0;
    try {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: SYSTEM,
        messages: [{ role: 'user', content: userText }],
      });
      const cost = actualUsd(response);
      charged = cost === null ? worst : cost;
      if (response.stop_reason === 'refusal') {
        return { status: 502, body: { error: 'declined', message: "The planner couldn't write a plan for this class. Try again later." } };
      }
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (!text) return { status: 502, body: { error: 'empty', message: 'The planner returned nothing. Try again.' } };
      return { status: 200, body: { plan: text, truncated: response.stop_reason === 'max_tokens' } };
    } catch (err) {
      // An HTTP error response is not billed. A dropped connection might be,
      // so it counts as the worst case.
      charged = typeof err.status === 'number' ? 0 : worst;
      return { status: 502, body: { error: 'api-error', message: 'The planner is unavailable right now. Try again later.' } };
    } finally {
      reserved -= worst;
      busy.delete(teacherEmail);
      const current = month();
      current.usd += charged;
      current.calls += 1;
      store.spend.save();
    }
  }

  return { plan, budget };
}

module.exports = { plannerService, plannerInput, worstCaseUsd, actualUsd, SYSTEM, MODEL, MAX_TOKENS };
