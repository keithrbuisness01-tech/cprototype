# AI Detective

A classroom game for students aged 11 to 13 (Grade 6 in year one). Students
judge whether an item was made by a person or by AI, competing against Fib, a
prankster rival. Teachers sign in to see anonymous class totals, share a
one-page results summary, and get an AI-suggested next lesson.

## How it works

**Students**
- Join with a class code. Usually they follow the teacher's join link and the
  code is already filled in. The code opens the game and nothing else.
- Each case shows one item: a photo, message, homework answer and so on.
  Students pick three of six fixed detective questions and see only those
  clues. Then they give a verdict, Person or AI. Fib reveals the answer with his
  right or wrong line, followed by the lesson.
- Scoreboard: Detective vs Fib. Ranks: Rookie, Detective, Inspector, Chief.
  A session is one pass through the case set and then ends. There are no
  streaks, random rewards or replay loops.
- No accounts, no names, no free-text input (only the six-character class code
  box), no live AI, no ads, analytics or trackers.

**Teachers**
- Sign in with a school Google or Microsoft account. Only emails on the
  approved list get in. Everyone else is refused, including students with
  school accounts.
- After 10 idle minutes (configurable) the server signs the teacher out, with a
  warning a minute before.
- **Class report (one screen):** anonymous totals, scores on early vs later
  cases, which questions the class skipped, which cases fooled them, and one
  suggested next step.
- **One-page results summary:** a printable page, plus an optional read-only
  share link that shows only anonymous totals, expires after 30 days, and can
  be turned off.
- **AI lesson planner:** calls Claude from the server only. It receives only the
  class's anonymous totals, never the class name, join code, teacher email or
  anything about a student. A monthly spending cap applies.
- **Options menu (corner tab):** class code (show, copy link, reset, expire),
  grade level and case set, mute sound for the class, share the join link and
  results summary, the signed-in email (partly hidden), a support link, and
  sign out.

**Options menu for students:** text size, sound, reduced motion, high contrast
and color theme, saved in the browser only.

## Run it

Needs Node 18 or later.

```sh
npm install
cp config/approved-teachers.example.txt config/approved-teachers.txt   # then add emails
cp .env.example .env    # fill in, then load it however you run Node
npm start
```

Students open `PUBLIC_URL` and join with a code. Teachers go to
`PUBLIC_URL/sign-in`.

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

- **What a student device sends:** the class code, the case set id, and
  anonymous answers (which case, right or wrong, which three question letters,
  and the final score). The server refuses requests with any other field.
  Students get no cookies.
- **What the server stores:** counts per class and case set (`data/totals.json`),
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

Case sets live in `cases/` as JSON and are listed in `cases/sets.json`.
Adding a set or updating cases needs no code changes. The server refuses to
start if a file breaks the rules in `js/casedata.js`. Each case looks like this:

```json
{
  "id": "highway-shark",
  "title": "The shark on the highway",
  "grade": 6,
  "item": { "kind": "photo", "description": "During a real flood, a photo shows a shark ..." },
  "clues": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "...", "F": "..." },
  "verdict": "ai",
  "verdictNote": "AI. The flood was real. The shark was not.",
  "lesson": "Lots of shares can all lead back to one source. ...",
  "fib": { "right": "Fine. Two news sites, one source. You spotted it.", "wrong": "Gotcha! ..." }
}
```

Rules:
- One clue for each question, A to F.
- The verdict is `person` or `ai`.
- The item kind comes from the list in `js/casedata.js`.
- Every case has the set's grade.
- Between 40% and 60% of a set's cases are AI-made.

## Fib's art

Fib has five poses: **scheming** (start screen), **smug** (when he wins a
point), **caught** (when the student is right), **sulking** (end of a good
session), and **impressed** (Chief rank). Each pose shows a hand-coded
placeholder until the illustrator's file is in `assets/fib/` and named in
`assets/fib/poses.json`. Use hand-drawn art only, not AI-generated images.

## Demo mode

Opened as a plain file or from a static host, the game runs as a demo with the
default case set. It sends nothing anywhere and has no teacher features.

## Test

```sh
npm test                 # 69 tests, no network needed
npm run check:network    # plays a full session in Chromium and checks every request
```

The tests cover:
- **Sign-in:** a stand-in provider that issues real signed tokens, used to
  check forged, expired and wrong-audience tokens, nonce and state replay, and
  non-approved accounts.
- **Every teacher route,** read from the server's route table: refused when
  signed out, for non-approved accounts, after the idle timeout, for another
  teacher's class, and for cross-site writes.
- **Student requests:** what they may contain and which codes are accepted.
- **The planner:** exactly what is sent, the cap, and error handling.
- **Case data, game rules and the report maths.**
- **Options,** and contrast in every theme.

`check:network` needs Playwright with Chromium (`npm i -g playwright`).

## Files

| Path | What it is |
|---|---|
| `index.html`, `js/app.js` | Student game |
| `js/store.js` | Every request a student device makes |
| `js/casedata.js` | The six questions and the case-file rules |
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
| `cases/` | Case sets (JSON) |

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
