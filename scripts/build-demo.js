// Builds the public demo: one self-contained page with every case file, the
// fonts and the evidence images inline, so it runs from any static host with
// no server. It sends nothing anywhere and has no teacher features.
//
//   node scripts/build-demo.js [output folder, default dist-demo]
//
// Vercel runs this (see vercel.json) and serves the folder.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'dist-demo');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const base64 = (file) => fs.readFileSync(path.join(ROOT, file)).toString('base64');
// JSON inside <script> must not be able to close the tag.
const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const html = read('index.html');
const bodyStart = html.indexOf('<body>') + '<body>'.length;
const body = html.slice(bodyStart, html.indexOf('</body>'));
const scripts = [...body.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const markup = body.replace(/\s*<script src="[^"]+"><\/script>/g, '').trim();

const fonts = read('css/fonts.css').replace(/url\(\.\.\/assets\/fonts\/([\w.-]+)\)/g, (_, file) => 'url(data:font/woff2;base64,' + base64('assets/fonts/' + file) + ')');
const css = read('css/styles.css');

const index = JSON.parse(read('cases/sets.json'));
const caseSets = index.sets.map((entry) => JSON.parse(read('cases/' + entry.file)));
const images = {};
for (const file of fs.readdirSync(path.join(ROOT, 'assets/evidence'))) {
  if (file.endsWith('.svg')) images[file] = 'data:image/svg+xml;base64,' + base64('assets/evidence/' + file);
}

const inline = (file) => '<script>\n' + read(file).replace(/<\/script/gi, '<\\/script') + '\n</script>';
const favicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='13' cy='13' r='9' fill='%23e5f8ff' stroke='%233d1a78' stroke-width='4'/%3E%3Cpath d='M20 20l8 8' stroke='%233d1a78' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E";

const page = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>AI Detective · Demo</title>',
  '<meta name="description" content="A classroom game: investigate before you trust it, and beat Fib the prankster. Demo: nothing you do is sent anywhere.">',
  '<link rel="icon" href="' + favicon + '">',
  '<style>\n' + fonts + '\n' + css + '\n</style>',
  // options.js runs in <head> so the saved look applies before first paint.
  inline('js/options.js'),
  '</head>',
  '<body>',
  markup,
  '<script type="application/json" id="demo-data">' + scriptJson({ caseSets, defaultSetId: index.default }) + '</script>',
  '<script type="application/json" id="demo-images">' + scriptJson(images) + '</script>',
  ...scripts.filter((s) => s !== 'js/options.js').map(inline),
  '</body>',
  '</html>',
  '',
].join('\n');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), page);
console.log('Demo written to ' + path.relative(ROOT, path.join(OUT, 'index.html')) + ' (' + Math.round(page.length / 1024) + ' KB, ' + caseSets.length + ' case files)');
