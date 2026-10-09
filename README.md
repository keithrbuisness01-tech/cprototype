# AI Detective (prototype)

A classroom game that teaches students to judge whether something was made by a
person or by AI. It follows the design in the *AI Detective: ten test cases* and
*customer profile and business model canvas* docs.

- **Ten cases.** Half are AI-made fakes, and half are real things Fib hopes you'll doubt.
- **Six detective questions.** The player asks three per case, and each reveals one clue.
  Some clues help, some don't, and some mislead.
- **Verdict.** The player decides between "Made by a person" and "Made by AI". Fib, the
  rival, gloats or grumbles, and the lesson line follows.
- **Score and rank.** The player scores a point for each right verdict and Fib scores one
  for each wrong one. Ranks: 0–3 Rookie, 4–6 Detective, 7–8 Inspector, 9–10 Chief.
- **One-screen class report.** It shows anonymous totals: how many students finished, the
  average score, the first three cases against the last three, right answers per case,
  which questions students ask, and one suggested next lesson.

The game uses no live AI, has no accounts, and stores no names. Only counts are kept.

## Run it

**Classroom mode (recommended).** This needs Node 18 or later and has no dependencies:

```sh
npm start            # or: node server.js
```

Open <http://localhost:8080>. Students enter the class code their teacher gives
them. The teacher opens **Teacher: class report** (or `/#report`) and enters the
same code. Every device using that code adds to one set of totals, which the
server saves in `data/totals.json`. Set `PORT` or `DATA_FILE` to change the port
or the file.

**Single-device mode.** Open `index.html` directly in a browser, or host the
folder on any static host such as GitHub Pages. The game plays the same way, but
the class report only counts games played in that browser.

## Options

A tab in the bottom-right corner opens the Options panel on every screen:

- **Text size:** Standard, Large or Extra large.
- **Sound:** off by default. Three short effects are made in the browser, with
  no audio files: a tick when a clue opens, a chime when you're right, and
  Fib's "wah-wah" when you're fooled.
- **Reduced motion:** starts matched to the device's own setting.
- **High contrast:** black and white with thicker outlines. It overrides the
  color theme while on.
- **Color theme:** Case Board, Pink & Blue, Night Shift or Calm.

Choices are saved in the browser only (`js/options.js`) and are never sent to
the server. The panel has no text boxes. "Teacher sign-in" at the bottom opens
the class report for now.

## Design

The look is a white case board, with ink outlines and hard offset shadows like
evidence cards pinned to a board. The colors are two teams:

- **Neon blue is the player:** your score, the questions you picked, and the
  "Case cracked" banner.
- **Deep purple is Fib:** his score and speech bubbles, plus a neon purple
  "Fooled!" banner when he takes the point.
- **Pink only decorates** (Fib's hat band) and never carries text.

Fonts come from Google Fonts: Bungee for headings, Atkinson Hyperlegible for
body text (designed to be easy to read), and Courier Prime for case files and
clues. Without internet, the page falls back to system fonts.

## Test

```sh
npm test
```

The tests cover the case data, the scoring and ranks, the three-question rule,
the anonymous totals, the report maths, and the server, including a check that
it serves only the game's own files.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/styles.css` | Screens and styling |
| `js/cases.js` | The six questions and ten cases. Edit cases here. |
| `js/game.js` | Rules and report maths, shared by the browser and the server |
| `js/store.js` | Saves totals to the server, or to the browser when there's no server |
| `js/options.js` | Student options, saved in the browser only and applied before the page paints |
| `js/sound.js` | The three sound effects, played only when sound is on |
| `js/app.js` | Screen flow and interaction |
| `server.js` | Optional zero-dependency server for shared class totals |

## Known gaps

- The cases were made harder for ages 11 to 13: neutral setups, no clue that
  gives the answer away on its own, red-herring clues in every case, and an
  answer order with no pattern. They haven't been tried with students yet, and
  they now differ from the *ten test cases* doc.
- Fib is a placeholder drawing until the illustrator's art exists. The sound
  effects are placeholders until the musician's work exists.
- "Teacher sign-in" opens the class report; there is no real sign-in yet.
- Anyone who knows a class code can add to its totals. That's acceptable for a
  pilot with teachers you know, but needs sign-in before schools pay.
- To clear the server's totals, use a new class code or delete `data/totals.json`.
