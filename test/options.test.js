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
  for (const file of ['options.js', 'sound.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, file);
  }
});

test('the options panel has no free-text inputs', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const panel = html.split('id="options-panel"')[1].split('</section>')[0];
  const inputs = panel.match(/<input[^>]*>/g) || [];
  assert.ok(inputs.length >= 10);
  for (const input of inputs) assert.match(input, /type="(radio|checkbox)"/, input);
  assert.doesNotMatch(panel, /<textarea|contenteditable/);
});

test('every choice in the panel is one options.js accepts', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const [, key, value] of html.matchAll(/name="opt-(\w+)" value="([\w-]+)"/g)) {
    assert.ok(Options.CHOICES[key].includes(value), key + '=' + value);
  }
  for (const [, key] of html.matchAll(/data-option="(\w+)"/g)) {
    assert.deepEqual(Options.CHOICES[key], [false, true], key);
  }
});
