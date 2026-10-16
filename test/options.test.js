const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Options = require('../js/options.js');

test('defaults are standard text, sound off, Case Board, no high contrast', () => {
  assert.deepEqual(Options.defaults(false), {
    textSize: 'standard',
    sound: false,
    reducedMotion: false,
    highContrast: false,
    theme: 'case-board',
  });
});

test('reduced motion starts from the device setting until the student picks', () => {
  assert.equal(Options.normalize({}, true).reducedMotion, true);
  assert.equal(Options.normalize({ reducedMotion: false }, true).reducedMotion, false);
});

test('valid saved choices are kept', () => {
  const saved = { textSize: 'xlarge', sound: true, reducedMotion: true, highContrast: true, theme: 'night-shift' };
  assert.deepEqual(Options.normalize(saved, false), saved);
});

test('bad, old or tampered saves fall back to defaults', () => {
  const d = Options.defaults(false);
  assert.deepEqual(Options.normalize(null, false), d);
  assert.deepEqual(Options.normalize('large', false), d);
  assert.deepEqual(Options.parse('not json', false), d);
  const odd = Options.normalize({ textSize: 'huge', sound: 'yes', theme: 'javascript:alert(1)', highContrast: 1, name: 'Sam' }, false);
  assert.deepEqual(odd, d);
  assert.equal('name' in odd, false, 'unknown keys are dropped');
});

test('only known keys are saved', () => {
  const text = Options.serialize({ textSize: 'large', classCode: 'ROOM12', theme: 'calm' });
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['highContrast', 'reducedMotion', 'sound', 'textSize', 'theme']);
});

test('options and sound code never talk to the network', () => {
  for (const file of ['options.js', 'options-panel.js', 'sound.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, file);
  }
});

const Panel = require('../js/options-panel.js');

test('the options panel has no free-text inputs', () => {
  const html = Panel.displayOptionsHtml();
  const inputs = html.match(/<input[^>]*>/g) || [];
  assert.ok(inputs.length >= 10);
  for (const input of inputs) assert.match(input, /type="(radio|checkbox)"/, input);
  assert.doesNotMatch(html, /<textarea|contenteditable|<select/);
});

test('every choice in the panel is one options.js accepts', () => {
  const html = Panel.displayOptionsHtml();
  for (const [, key, value] of html.matchAll(/name="opt-(\w+)" value="([\w-]+)"/g)) {
    assert.ok(Options.CHOICES[key].includes(value), key + '=' + value);
  }
  for (const [, key] of html.matchAll(/data-option="(\w+)"/g)) {
    assert.deepEqual(Options.CHOICES[key], [false, true], key);
  }
  assert.deepEqual(Panel.THEMES.map((t) => t.id), Options.CHOICES.theme);
  assert.deepEqual(Panel.SIZES.map((t) => t.id), Options.CHOICES.textSize);
});

test('students can type nothing but a six-character class code', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const inputs = html.match(/<input[^>]*>/g) || [];
  assert.equal(inputs.length, 1, 'one input on the student page');
  assert.match(inputs[0], /id="class-code"/);
  assert.match(inputs[0], /maxlength="6"/);
  assert.match(inputs[0], /pattern="\[A-HJKMNP-Z2-9\]\{6\}"/);
  assert.doesNotMatch(html, /<textarea|contenteditable|<select/);
  // The student scripts build no inputs of their own.
  for (const file of ['app.js', 'store.js', 'fib.js', 'ui.js', 'game.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
    assert.doesNotMatch(src, /createElement\(['"](input|textarea|select)['"]\)|contenteditable/, file);
  }
});
