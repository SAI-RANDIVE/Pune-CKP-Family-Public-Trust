/**
 * Regenerates public/logo/logo-receipt.png from public/logo/logo.png.
 *
 * Why this exists: the master logo is 2042x2042 (~1.5MB). pdf-lib embeds a PNG
 * at its native resolution regardless of the size you draw it at, so using the
 * master logo directly made every receipt ~1.7MB. The receipt draws the logo at
 * 58pt, so 256px is already more than enough for print.
 *
 * Run this only if the master logo changes:  node scripts/make-receipt-logo.js
 */
const path = require('path');
const sharp = require('sharp');

const SRC = path.join(__dirname, '..', 'public', 'logo', 'logo.png');
const OUT = path.join(__dirname, '..', 'public', 'logo', 'logo-receipt.png');

sharp(SRC)
  .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
  .png({ compressionLevel: 9, palette: true })
  .toFile(OUT)
  .then((info) => {
    console.log(`Wrote ${OUT} — ${info.width}x${info.height}, ${(info.size / 1024).toFixed(1)}KB`);
  })
  .catch((err) => {
    console.error('Failed to generate receipt logo:', err.message);
    process.exit(1);
  });
