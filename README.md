# AI Detective

A classroom game for students aged 11 to 13. Students investigate content
before they decide whether to trust it, competing against Fib, a prankster
rival. Teachers sign in to see anonymous class totals, share a one-page
results summary, teach from a lesson guide, and get an AI-suggested next
lesson.

## How it works

**Students**
- Join with a class code. Usually they follow the teacher's join link and the
  code is already filled in. The code opens the game and nothing else.
- Choose a case file on the start screen (Fall 2026 is picked by default). If
  the teacher has set the case file, the picker is skipped.
- **Fall 2026 case pack, "How would you check?"** Six cases from outside the
  classroom: a viral photo, a fake quote, real library news, fake reviews, a
  confidently wrong chatbot, and a responsible-use scenario. One case is true.
  On each case, students open two of four checks. Each check is labeled
  strong or weak once it's open. Then they decide: Trust it, or Don't trust it.
  - Right, backed by a strong check: +2, plus 1 per strong check.
  - Right, with no strong check: a lucky guess. +1 for the student, and Fib
    gets a point too.
  - Wrong: Fib +2. On the scenario, the right plan is +3, a wrong one gives
    Fib 2.
  - The same four warm-up questions come before the cases and again after them
    (the wrap-up), so students and the teacher can see what changed.
  - The final screen shows the result and three discussion questions.
- **Person-or-AI case files (Warm-up, Grade 6, Grade 7, Grade 8, Classic
  ten):** ten cases each. Students pick three of six fixed detective questions,
  see only those clues, then answer Person or AI. The progress line reads, for
  example, "Grade 7: case 3 of 10". Ranks: Rookie, Detective, Inspector, Chief.
- Fib keeps a live scoreboard and reacts to each verdict. His trash talk can be
  turned off in Options, which swaps in neutral lines.
- A run ends after the last case. The end screen offers **Play again** (the
  same case file, shuffled; the warm-up isn't repeated) and **Choose another
  case file**. There are no streaks, random rewards or endless loops.
- No accounts, no names, no free-text input (only the six-character class code
  box), no live AI, no ads, analytics or trackers.

**Teachers**
- Sign in with a school Google or Microsoft account. Only emails on the
  approved list get in. Everyone else is refused, including students with
  school accounts.
- Or sign in with the **teacher code** (`TEACHER_CODE`), checked on the server
  only. It's off unless set, rate limited to 10 tries per 15 minutes, and
  meant for the person who runs the app. Unsetting it ends code sessions.
- After 10 idle minutes (configurable) the server signs the teacher out, with a
  warning a minute before.
- **Class report (one screen, per case file):** anonymous totals, right answers
  on the first cases played vs the last, which cases fooled the class, and one
  suggested next step. For Fall 2026 it also shows how often students opened
  strong checks, how many right answers were lucky guesses, and the change from
  warm-up to wrap-up. For Person-or-AI files it shows which questions the class
  skipped. **Copy summary** copies a plain-text version.
- **Teaching this case pack (Fall 2026):** a 45-minute lesson guide, and a
  standards table (Common Core ELA) for grades 6, 7 or 8.
- **One-page results summary:** a printable page, plus an optional read-only
  share link that shows only anonymous totals, expires after 30 days, and can
  be turned off.
- **AI lesson planner:** calls Claude from the server only. It receives only the
  class's anonymous totals for one case file, never the class name, join code,
  teacher email or anything about a student. A monthly spending cap applies.
- **Options menu (corner tab):** class code (show, copy link, reset, expire),
  the case file (or let students choose), mute sound for the class, share the
  join link and results summary, the signed-in account (partly hidden), a
  support link, and sign out.

**Options menu for students:** text size, sound, Fib's trash talk, reduced
motion, high contrast and color theme, saved in the browser only.

## Run it

Needs Node 18 or later.

```sh
npm install
cp config/approved-teachers.example.txt config/approved-teachers.txt   # then add emails
cp .env.example .env    # fill in, then load it however you run Node
npm start
```

Students open `PUBLIC_URL` and join with a code. Teachers go to
`PUBLIC_URL/sign-in`. To get in before Google or Microsoft sign-in is set up,
set `TEACHER_CODE`.

Run it behind HTTPS in production. Session cookies are marked `Secure` only
when `PUBLIC_URL` starts with `https://`. If a proxy terminates TLS, set
`TRUST_PROXY=1` so rate limits use the real client address.

### Configuration

| Variable | What it does | Default |
|---|---|---|
| `PUBLIC_URL` | The site's public address. Sign-in redirects use it. | `http://localhost:8080` |
| `PORT` | Port to listen on | `8080` |
| `DATA_DIR` | Where class records, totals and AI spending are saved | `./data` |
| `APPROVED_TEACHERS_FILE` | The approved list, one email per line | `config/approved-teachers.txt` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Turns on Google sign-in | off |
| `GOOGLE_ALLOWED_DOMAINS` | Optional comma list of school domains | any Workspace domain |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Turns on Microsoft sign-in | off |
| `MICROSOFT_ALLOWED_TENANTS` | Optional comma list of school tenant IDs | any work or school tenant |
| `TEACHER_CODE` | Turns on teacher-code sign-in. At least 8 characters; shorter is ignored. | off |
| `TEACHER_CODE_EMAIL` | Which teacher's classes a code session owns. Set it to your school email to see the same classes either way. | `teacher-code` |
| `TEACHER_IDLE_MINUTES` | Automatic sign-out after this many idle minutes | `10` |
| `TEACHER_SESSION_MAX_HOURS` | Longest a sign-in lasts, active or not | `8` |
| `CLASS_CODE_DAYS` | How long a new or reset class code works | `180` |
| `SHARE_LINK_DAYS` | How long a results share link works | `30` |
| `SUPPORT_URL` | `https://` link shown in the teacher Options menu | none |
| `ANTHROPIC_API_KEY` | Turns on the lesson planner. Server only. | off |
| `AI_MONTHLY_CAP_USD` | Lesson-planner spending cap per calendar month (UTC) | `20` |
| `TRUST_PROXY` | `1` to read the client address from `X-Forwarded-For` | off |

### Setting up sign-in

Both providers use the redirect URI `PUBLIC_URL/auth/<provider>/callback`.

- **Google:** create an OAuth client of type "Web application" and add
  `PUBLIC_URL/auth/google/callback`. Only Google Workspace accounts (school
  accounts) are accepted, and only with a verified email.
- **Microsoft (Entra ID):** register a multi-tenant app for "accounts in any
  organizational directory" and add `PUBLIC_URL/auth/microsoft/callback` as a
  Web redirect URI. In **Token configuration**, add the optional ID-token claims
  **`email`** and **`xms_edov`**. The app accepts a Microsoft email only when
  `xms_edov` confirms the school's tenant owns that email's domain. Without
  this, any tenant could claim someone else's address. Personal Microsoft
  accounts are refused.

The server checks every sign-in token's signature against the provider's
published keys, along with its issuer, audience, expiry and nonce. It uses
PKCE and a one-time state tied to a browser cookie.

### The approved list

`config/approved-teachers.txt` holds one email per line, and `#` starts a
comment. Git ignores the file. It's re-read whenever it changes, so adding
someone works at once, and removing someone ends their session on their next
request.

## Privacy

- **What a student device sends:** the class code, the case file id, and
  anonymous answers: which case, where it fell in the run, and what was chosen
  (the question letters and Person/AI, the checks opened and Trust/Don't
  trust, or the plan picked), plus the final score and, for Fall 2026, the
  warm-up and wrap-up scores. The device never says whether an answer was
  right; the server works that out from the case file. The server refuses
  requests with any other field. Students get no cookies.
- **What the server stores:** counts per class and case file (`data/totals.json`),
  teacher-owned class records (`data/classes.json`), and planner spending
  (`data/ai-spend.json`). There are no per-student records.
- **Third parties:** none for students. Fonts are bundled (`assets/fonts`, OFL
  licensed). Every response carries a Content Security Policy that allows only
  this site.
- **Lesson planner:** see `plannerInput()` in `lib/planner.js` for exactly what
  Claude receives. The browser never contacts Anthropic.

## Lesson planner and the spending cap

- **Model:** Claude Opus 5.5 (`claude-opus-5-5`), called with the Anthropic SDK
  from the server.
- **Fallback:** the request enables Anthropic's server-side fallback
  (`fallbacks: "default"`), so a request the model declines is retried on
  another model automatically.
- **The cap:** before every call, the server works out the worst-case cost and
  refuses the call if it could take the month over `AI_MONTHLY_CAP_USD`. The
  worst case is two full attempts, priced at the fallback models' higher rate
  of $5 / $25 per million tokens: about $0.41 per call. Afterwards it records
  the actual cost from the usage the API reports. A typical call costs a few
  cents.
- **Limits:** one plan at a time per teacher, and a 20-class limit per teacher.

## Case files

Case files live in `cases/` as JSON and are listed in `cases/sets.json`, which
also names the default. Adding a file or updating cases needs no code changes.
The server refuses to start if a file breaks the rules in `js/casedata.js`.

| File | Label | Rules | Cases |
|---|---|---|---|
| `fall-2026.json` | Fall 2026 (default) | How would you check? | 6 |
| `warmup.json` | Warm-up | Person or AI | 10 |
| `grade6.json` | Grade 6 | Person or AI | 10 |
| `grade7.json` | Grade 7 | Person or AI | 10 |
| `grade8.json` | Grade 8 | Person or AI | 10 |
| `grade6-core.json` | Classic ten | Person or AI | 10 |

The Warm-up and Grade 6–8 text is copied exactly from
`reference/ai-detective-demo.html`, and the Fall 2026 pack from
`reference/ai-detective-fall-2026.html`. `test/case-data.test.js` checks both
against those files. The reference pages are not served.

**Person-or-AI case** (`"rules": "detective"`):

```json
{
  "id": "the-skateboarding-dog",
  "title": "The skateboarding dog",
  "grade": null,
  "item": { "kind": "Video", "description": "..." },
  "clues": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "...", "F": "..." },
  "verdict": "person",
  "lesson": "...",
  "fib": { "right": "...", "wrong": "..." }
}
```

- One clue for each question, A to F. The verdict is `person` or `ai`.
- Every case has the file's grade (or `null`).
- Between 40% and 60% of a file's cases are AI-made.

**"How would you check?" case** (`"rules": "investigate"`):

```json
{
  "id": "storm-shark",
  "title": "The storm shark",
  "kind": "investigate",
  "fib": { "taunt": "...", "neutral": "..." },
  "evidence": { "type": "post", "account": "StormNewsLive", "image": { "src": "storm-shark.svg", "alt": "..." }, "text": "...", "meta": "2.1M likes" },
  "checks": [{ "label": "Look at who posted it", "result": "...", "strong": true }, "... four in all"],
  "verdict": "distrust",
  "explain": "...",
  "skill": "Evaluating sources across media"
}
```

- Evidence is data, not HTML: `post`, `quote`, `webpage`, `reviews`, `chat` or
  `scenario`. Images go in `assets/evidence/`.
- Exactly four checks, at least one strong and one weak. The game shuffles
  their order on screen.
- A `"kind": "choose"` case has `options` (exactly one with `"right": true`)
  instead of checks and a verdict.
- At least one case must be true (`trust`). The file also holds the warm-up
  questions (`checkQuiz`), `discussion`, the lesson `guide` and `standards`.

## Fib's art

Fib has five poses: **scheming** (start screen), **smug** (when he wins a
point), **caught** (when the student is right), **sulking** (end of a good
session), and **impressed** (Chief rank). Each pose shows a hand-coded
placeholder until the illustrator's file is in `assets/fib/` and named in
`assets/fib/poses.json`. The placeholder has no mask: his eyelids, pupils,
white brows and mouth change with each pose. The brow and mouth color is the
`--fib-face` token in `css/styles.css`. Use hand-drawn art only, not AI-generated images.

## Demo mode

Opened as a plain file or from a static host, the game runs as a demo with
every case file. It sends nothing anywhere and has no teacher features.

`npm run build:demo` writes a single self-contained page to `dist-demo/`, with
the fonts, case files and evidence images inline. `vercel.json` tells Vercel
to run that build and serve the page with a strict Content Security Policy, so
the public demo rebuilds from the repo on every push.

## Test

```sh
npm test                 # 96 tests, no network needed
npm run check:network    # plays Fall 2026 and Grade 7 (twice) in Chromium and checks every request
```

The tests cover:
- **Sign-in:** a stand-in provider that issues real signed tokens, used to
  check forged, expired and wrong-audience tokens, nonce and state replay, and
  non-approved accounts.
- **Every teacher route,** read from the server's route table: refused when
  signed out, for non-approved accounts, after the idle timeout, for another
  teacher's class, and for cross-site writes.
- **Student requests:** what they may contain and which codes are accepted.
- **The teacher code:** right and wrong codes, the rate limit, cross-site
  requests, the code being off, and reaching every teacher route.
- **The planner:** exactly what is sent, the cap, and error handling.
- **Case data:** all 40 grade-level cases load, 10 per file with 5 Person and
  5 AI, and match the reference text exactly; the Fall 2026 pack matches its
  reference and follows its rules.
- **Game rules and the report maths** for both kinds of case file.
- **Options,** and contrast in every theme.

`check:network` needs Playwright with Chromium (`npm i -g playwright`).

## Files

| Path | What it is |
|---|---|
| `index.html`, `js/app.js` | Student game |
| `js/store.js` | Every request a student device makes |
| `js/casedata.js` | The six questions and the case-file rules |
| `js/evidence.js`, `assets/evidence/` | Draws Fall 2026 evidence from data |
| `js/game.js` | Rules, ranks and report maths (shared with the server) |
| `js/fib.js`, `assets/fib/` | Fib's poses and art slots |
| `js/options.js`, `js/options-panel.js`, `js/sound.js` | Options menu, saved in the browser |
| `teacher/` | Teacher page, served only to signed-in approved teachers |
| `sign-in.html`, `js/sign-in.js` | Teacher sign-in page |
| `server.js` | Routes; every teacher route is checked in one place |
| `lib/auth.js` | Google and Microsoft sign-in, sessions, approved list |
| `lib/classes.js` | Class codes, settings, share links |
| `lib/planner.js` | AI lesson planner and spending cap |
| `lib/summary.js` | One-page results summary |
| `cases/` | Case files (JSON) |
| `reference/` | The source pages the case text was copied from (not served) |

## Known gaps

- Real Google and Microsoft sign-in hasn't been tried against live accounts.
  The flow is tested against a stand-in provider that follows the same
  protocol.
- The lesson planner hasn't made a real Claude call yet. It's tested with a
  fake client.
- Sessions are kept in memory, so restarting the server signs teachers out.
- With very small classes (one or two players), class totals can point to an
  individual. Consider holding back the report until about five students
  have played.
- The cases haven't been tried with students yet.
- The standards table is based on Common Core ELA. Check your state's version
  before putting the codes in a lesson plan.
