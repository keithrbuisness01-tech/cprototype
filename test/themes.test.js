// Every color theme, and high contrast, must keep text readable.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CHOICES } = require('../js/options.js');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

function tokens(selector) {
  const start = css.indexOf(selector + ' {');
  assert.ok(start >= 0, 'missing block ' + selector);
  const body = css.slice(start, css.indexOf('}', start));
  const out = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[name] = value;
  return out;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// [text, background] pairs the page actually uses.
const PAIRS = [
  ['ink', 'paper'],
  ['ink-2', 'paper'],
  ['ink', 'tint'],
  ['ink', 'you-tint'],
  ['on-you', 'you'],
  ['on-fib', 'fib'],
  ['on-fib', 'fib-neon'],
  ['you-ink', 'paper'],
  ['fib-ink', 'paper'],
];

const base = tokens(':root');
const variants = CHOICES.theme.map((theme) => [
  theme,
  theme === 'case-board' ? base : Object.assign({}, base, tokens(`html[data-color="${theme}"]`)),
]);
variants.push(['high contrast', Object.assign({}, base, tokens('html[data-contrast="high"]'))]);

for (const [name, t] of variants) {
  test(`${name}: text meets 4.5:1 contrast`, () => {
    for (const [fg, bg] of PAIRS) {
      const ratio = contrast(t[fg], t[bg]);
      assert.ok(ratio >= 4.5, `${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  });
}

test('high contrast reaches 7:1 for text on the board and on both team colors', () => {
  const t = variants[variants.length - 1][1];
  for (const [fg, bg] of [['ink', 'paper'], ['on-you', 'you'], ['on-fib', 'fib']]) {
    assert.ok(contrast(t[fg], t[bg]) >= 7, `${fg} on ${bg}`);
  }
});
