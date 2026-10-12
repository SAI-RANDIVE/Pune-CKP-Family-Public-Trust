/**
 * Downloads the web fonts the two sites use into public/fonts and writes
 * app/fonts.css, so that building and running the project never depends on
 * Google's font servers being reachable.
 *
 *   node scripts/fetch-fonts.js
 *
 * Run it again only to add a font or a weight (edit FAMILIES below). The
 * downloaded files and app/fonts.css are committed.
 *
 * Only the Latin and Devanagari parts of each font are kept; each @font-face
 * carries its unicode-range, so a browser downloads the Devanagari file only
 * on a page that actually shows Marathi.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const FAMILIES = [
  { name: 'Yatra One', query: 'Yatra+One', subsets: ['latin', 'devanagari'] },
  { name: 'Poppins', query: 'Poppins:wght@300;400;500;600;700', subsets: ['latin'] },
  { name: 'IBM Plex Mono', query: 'IBM+Plex+Mono:wght@400;500', subsets: ['latin'] },
  { name: 'Mukta', query: 'Mukta:wght@400;500;600;700;800', subsets: ['latin', 'devanagari'] },
  { name: 'Inter', query: 'Inter:wght@400;500;600;700;800', subsets: ['latin'] },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const OUT = path.join(__dirname, '..', 'public', 'fonts');
const CSS = path.join(__dirname, '..', 'app', 'fonts.css');

function get(url, binary = false, attempt = 1) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA }, timeout: 20000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`${res.statusCode} for ${url}`)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => (attempt < 4 ? resolve(get(url, binary, attempt + 1)) : reject(err)));
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const rules = [
    '/* Written by scripts/fetch-fonts.js. Do not edit by hand: run the script again. */',
    '/* The font files are served from /fonts (see the cache header in next.config.js). */',
  ];
  let files = 0;

  for (const family of FAMILIES) {
    const css = await get(`https://fonts.googleapis.com/css2?family=${family.query}&display=swap`);
    // Each block is preceded by a comment naming its subset: /* latin */ @font-face { ... }
    const blocks = [...css.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g)];
    for (const [, subset, body] of blocks) {
      if (!family.subsets.includes(subset)) continue;
      const weight = (body.match(/font-weight:\s*(\d+)/) || [])[1] || '400';
      const url = (body.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
      const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1];
      if (!url) continue;
      const file = `${family.name.toLowerCase().replace(/\s+/g, '-')}-${weight}-${subset}.woff2`;
      const target = path.join(OUT, file);
      if (!fs.existsSync(target)) fs.writeFileSync(target, await get(url, true));
      files += 1;
      rules.push(`@font-face {
  font-family: '${family.name}';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url('/fonts/${file}') format('woff2');${range ? `\n  unicode-range: ${range.trim()};` : ''}
}`);
    }
  }
  fs.writeFileSync(CSS, `${rules.join('\n\n')}\n`);
  console.log(`${files} font files in public/fonts, rules written to app/fonts.css`);
}

main().catch((err) => { console.error('Could not fetch the fonts:', err.message); process.exit(1); });
