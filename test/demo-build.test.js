// The public demo page: self-contained, every case file, nothing external.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

test('the demo build is one page with every case file and no outside links', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-'));
  try {
    execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-demo.js'), dir]);
    const page = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    assert.match(page, /^<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">/);
    const data = JSON.parse(page.match(/<script type="application\/json" id="demo-data">([\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(data.caseSets.map((s) => s.id), ['fall-2026', 'warmup', 'grade6', 'grade7', 'grade8', 'grade6-core']);
    assert.equal(data.defaultSetId, 'fall-2026');
    const images = JSON.parse(page.match(/id="demo-images">([\s\S]*?)<\/script>/)[1]);
    assert.ok(images['storm-shark.svg'].startsWith('data:image/svg+xml;base64,'));
    assert.doesNotMatch(page, /<script src=|<link rel="stylesheet"|url\((?!data:)/, 'everything is inline');
    assert.doesNotMatch(page, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/, 'no outside addresses');
    for (const file of ['ui.js', 'casedata.js', 'game.js', 'store.js', 'evidence.js', 'app.js']) {
      assert.ok(page.includes(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8').slice(0, 200)), file + ' is inlined');
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
