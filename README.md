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
| `js/app.js` | Screen flow and interaction |
| `server.js` | Optional zero-dependency server for shared class totals |

## Known gaps

- The cases were written for ages 9 to 12. The pilot targets ages 11 to 13, so
  the cases need to be harder.
- Fib is a placeholder drawing until the illustrator's art exists. There is no sound yet.
- Anyone who knows a class code can add to its totals. That's acceptable for a
  pilot with teachers you know, but needs sign-in before schools pay.
- To clear the server's totals, use a new class code or delete `data/totals.json`.
