/* Build targets:
 *   dist/gully-cricket.html                       claude.ai artifact (page content only; the host adds the skeleton)
 *   dist/test.html                                same page wrapped in the host skeleton, for local browser tests
 *   android/app/src/main/assets/www/index.html    offline Android build: fonts inlined, no network needed
 */
const fs = require('fs');
const path = require('path');
const root = __dirname;
const src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');

const js = { engine: src('engine.js'), i18n: src('i18n.js'), app: src('app.js') };
for (const [k, v] of Object.entries(js)) {
  if (/<\/script/i.test(v)) throw new Error(k + '.js contains a closing script tag');
}
const css = src('styles.css');
if (/<\/style/i.test(css)) throw new Error('styles.css contains a closing style tag');

// Images (cap awards) ship inside the page; three.js is loaded on demand for the 3D coin.
const b64 = (f) => fs.readFileSync(path.join(root, f)).toString('base64');
const assetsJs = 'window.GullyAssets=' + JSON.stringify({ capO: 'data:image/webp;base64,' + b64('assets/cap-orange.webp'), capP: 'data:image/webp;base64,' + b64('assets/cap-purple.webp'), three: '__THREE_SRC__' }) + ';';
const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const page0 = src('template.html')
  .replace('/*__ASSETS__*/', () => assetsJs)
  .replace('/*__CSS__*/', () => css)
  .replace('/*__ENGINE__*/', () => js.engine)
  .replace('/*__I18N__*/', () => js.i18n)
  .replace('/*__APP__*/', () => js.app);
const page = page0.replace('__THREE_SRC__', THREE_CDN);
const localPage = page0.replace('__THREE_SRC__', 'three.min.js');

const RESET = ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}';

// 1) Artifact + local test copy
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'gully-cricket.html'), page);
fs.writeFileSync(path.join(root, 'dist', 'test.html'),
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>' + RESET + '</style></head><body>' + localPage + '</body></html>');
fs.copyFileSync(path.join(root, 'vendor', 'three.min.js'), path.join(root, 'dist', 'three.min.js'));

// 2) Android: same page, Google Fonts link swapped for inlined OFL fonts so the app works fully offline.
const font = (file) => 'url(data:font/woff2;base64,' + fs.readFileSync(path.join(root, 'fonts', file)).toString('base64') + ') format("woff2")';
const KANNADA = 'U+0C80-0CFF, U+200C-200D, U+20B9, U+25CC';
const faces = [
  ['Anton', 400, 'anton-latin-400-normal.woff2'],
  ...[500, 600, 700, 800].map((w) => ['Barlow Condensed', w, 'barlow-condensed-latin-' + w + '-normal.woff2']),
  ...[400, 600, 700, 800].map((w) => ['Noto Sans Kannada', w, 'noto-sans-kannada-kannada-' + w + '-normal.woff2', KANNADA])
].map(([family, weight, file, range]) =>
  '@font-face{font-family:"' + family + '";font-style:normal;font-weight:' + weight + ';font-display:swap;src:' + font(file) + (range ? ';unicode-range:' + range : '') + '}').join('\n');
const fontLinks = /<link rel="preconnect"[^>]*>\s*<link rel="preconnect"[^>]*>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/;
if (!fontLinks.test(localPage)) throw new Error('Google Fonts links not found in template');
const androidPage = localPage.replace(fontLinks, () => '<style>\n' + faces + '\n</style>');
if (/https?:\/\//.test(androidPage.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, ''))) {
  const hit = androidPage.match(/https?:\/\/[^\s"')]+/);
  if (hit && !/w3\.org/.test(hit[0])) console.warn('note: android page still references', hit[0]);
}
const androidHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<meta name="theme-color" content="#0A0D13"><style>' + RESET + '</style></head><body>' + androidPage + '</body></html>';
const assets = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'www');
fs.mkdirSync(assets, { recursive: true });
fs.writeFileSync(path.join(assets, 'index.html'), androidHtml);
fs.copyFileSync(path.join(root, 'vendor', 'three.min.js'), path.join(assets, 'three.min.js'));

console.log('built dist/gully-cricket.html', (Buffer.byteLength(page) / 1024).toFixed(1) + ' KB');
console.log('built android/app/src/main/assets/www/index.html', (Buffer.byteLength(androidHtml) / 1024).toFixed(1) + ' KB');
