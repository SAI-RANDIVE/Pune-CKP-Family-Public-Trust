#!/usr/bin/env node
/**
 * Download every old-site image the public website uses, so the site keeps
 * its photos after puneckptrust.org is switched off.
 *
 *   node scripts/fetch-old-images.js            download what is missing
 *   node scripts/fetch-old-images.js --force    download everything again
 *   node scripts/fetch-old-images.js --dry-run  list what would be downloaded
 *
 * Reads:   lib/data/galleryAlbums.json   (photo albums)
 *          lib/data/siteImages.json      (portraits, logos, story photos)
 *          lib/data/videos.json          (YouTube thumbnails)
 * Writes:  public/gallery/<album-slug>/image1.jpg, image2.jpg ... (original extension kept)
 *          public/gallery/manifest.json  { images: { "<old URL>": "/gallery/<album-slug>/imageN.ext" } }
 *
 * lib/galleryData.js prefers the local file whenever the manifest lists one
 * and falls back to the old URL otherwise. After running this, rebuild the site.
 *
 * No dependencies: Node 18+ only. Safe to re-run; existing files are kept and
 * a failed download simply stays on its remote URL.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'gallery');
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json');
const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');
const CONCURRENCY = 4;
const TIMEOUT_MS = 45000;
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function extensionOf(url) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : '.jpg';
}

/** Build the work list: [{ url, folder }], each URL once (first folder wins). */
function collect() {
  const jobs = [];
  const seen = new Set();
  const add = (url, folder) => {
    if (!/^https?:\/\//.test(url) || seen.has(url)) return;
    seen.add(url);
    jobs.push({ url, folder });
  };

  readJson('lib/data/galleryAlbums.json').forEach((album) => {
    album.images.forEach((image) => add(image.src, album.slug));
  });

  const named = readJson('lib/data/siteImages.json');
  Object.keys(named).forEach((group) => {
    Object.keys(named[group]).forEach((key) => add(named[group][key], group));
  });

  readJson('lib/data/videos.json').forEach((video) => add(`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`, 'videos'));

  return jobs;
}

function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    const target = new URL(url); // also percent-encodes Devanagari and spaces
    const client = target.protocol === 'http:' ? http : https;
    const request = client.get(target, { headers: { 'User-Agent': 'puneckptrust-image-migration/1.0' } }, (response) => {
      const { statusCode, headers } = response;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        response.resume();
        if (redirects >= 5) { reject(new Error('too many redirects')); return; }
        download(new URL(headers.location, target).toString(), destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${statusCode}`));
        return;
      }
      if (!String(headers['content-type'] || '').startsWith('image/')) {
        response.resume();
        reject(new Error(`not an image (${headers['content-type'] || 'no content-type'})`));
        return;
      }
      const temporary = `${destination}.part`;
      const file = fs.createWriteStream(temporary);
      response.pipe(file);
      file.on('finish', () => file.close(() => {
        fs.renameSync(temporary, destination);
        resolve();
      }));
      file.on('error', (error) => {
        fs.rmSync(temporary, { force: true });
        reject(error);
      });
    });
    request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('timed out')));
    request.on('error', reject);
  });
}

async function main() {
  const jobs = collect();

  // Keep numbering stable between runs: an image that already has a local
  // file keeps it, new images take the next free number in their folder.
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).images || {}; } catch (error) { previous = {}; }

  const used = {};
  Object.values(previous).forEach((localPath) => {
    const match = /^\/gallery\/([^/]+)\/image(\d+)\.[a-z0-9]+$/i.exec(localPath);
    if (!match) return;
    used[match[1]] = used[match[1]] || new Set();
    used[match[1]].add(Number(match[2]));
  });

  const plan = jobs.map((job) => {
    let localPath = previous[job.url];
    if (!localPath) {
      used[job.folder] = used[job.folder] || new Set();
      let n = 1;
      while (used[job.folder].has(n)) n += 1;
      used[job.folder].add(n);
      localPath = `/gallery/${job.folder}/image${n}${extensionOf(job.url)}`;
    }
    return { ...job, localPath, file: path.join(ROOT, 'public', ...localPath.split('/').filter(Boolean)) };
  });

  console.log(`${plan.length} images in ${new Set(plan.map((p) => p.folder)).size} folders.`);
  if (DRY_RUN) {
    plan.forEach((p) => console.log(`${p.localPath}  <-  ${p.url}`));
    return;
  }

  const images = {};
  const failures = [];
  let cursor = 0;
  let finished = 0;

  async function worker() {
    while (cursor < plan.length) {
      const item = plan[cursor];
      cursor += 1;
      try {
        fs.mkdirSync(path.dirname(item.file), { recursive: true });
        const exists = fs.existsSync(item.file) && fs.statSync(item.file).size > 0;
        if (FORCE || !exists) {
          try {
            await download(item.url, item.file);
          } catch (firstError) {
            await download(item.url, item.file); // one retry
          }
        }
        images[item.url] = item.localPath;
      } catch (error) {
        failures.push({ url: item.url, reason: error.message });
      }
      finished += 1;
      if (finished % 25 === 0 || finished === plan.length) console.log(`  ${finished}/${plan.length}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Write the manifest in the same order as the plan, so diffs stay readable.
  const ordered = {};
  plan.forEach((p) => { if (images[p.url]) ordered[p.url] = images[p.url]; });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    note: 'Written by scripts/fetch-old-images.js. Maps an old-site image URL to the local copy under /gallery.',
    images: ordered,
  }, null, 2)}\n`);

  console.log(`Saved ${Object.keys(ordered).length} images. Manifest: public/gallery/manifest.json`);
  if (failures.length) {
    console.log(`${failures.length} could not be downloaded and will keep using their remote URL:`);
    failures.forEach((f) => console.log(`  ${f.reason}  ${f.url}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
