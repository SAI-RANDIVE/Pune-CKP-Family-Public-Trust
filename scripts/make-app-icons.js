/**
 * Makes the icons a phone needs to install the website as an app, from the
 * trust's logo. Run once (and again only if the logo changes):
 *
 *   node scripts/make-app-icons.js
 *
 * Writes public/icons/icon-192.png, icon-512.png and icon-maskable-512.png
 * (the "maskable" one has a cream margin so Android can crop it to a circle).
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const logo = path.join(__dirname, '..', 'public', 'logo', 'logo.png');
const out = path.join(__dirname, '..', 'public', 'icons');
const CREAM = { r: 253, g: 245, b: 231, alpha: 1 };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const size of [192, 512]) {
    await sharp(logo).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(out, `icon-${size}.png`));
  }
  const inner = await sharp(logo).resize(384, 384, { fit: 'contain', background: CREAM }).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: CREAM } })
    .composite([{ input: inner, gravity: 'center' }]).png().toFile(path.join(out, 'icon-maskable-512.png'));
  await sharp(logo).resize(180, 180, { fit: 'contain', background: CREAM }).flatten({ background: CREAM }).png().toFile(path.join(out, 'apple-touch-icon.png'));
  console.log('Icons written to public/icons');
})().catch((err) => { console.error(err.message); process.exit(1); });
