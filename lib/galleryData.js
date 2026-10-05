/**
 * Photo and video gallery data for the public site.
 *
 * Source: docs/old-site-scrape/images.csv (the photo galleries of the old
 * site, puneckptrust.org). The album list lives in lib/data/galleryAlbums.json
 * and the named portraits/logos in lib/data/siteImages.json.
 *
 * Local first, remote as fallback:
 *   `node scripts/fetch-old-images.js` downloads every image into
 *   public/gallery/<album-slug>/image1.jpg, image2.jpg ... and writes
 *   public/gallery/manifest.json (old URL -> local path). Whenever the manifest
 *   has an entry for an image, the local file is used; otherwise the old-site
 *   URL is used. So the site works today, and keeps working after the old
 *   domain is switched off (run the script, rebuild).
 *
 * To add new photos by hand: put them in public/gallery/<album-slug>/ as
 * image1.jpg, image2.jpg ... and add an album (or images) to
 * lib/data/galleryAlbums.json with `src` set to "/gallery/<album-slug>/image1.jpg".
 *
 * Server-side module: import it from server components only and pass plain
 * data down to client components.
 */
import albumsSource from './data/galleryAlbums.json';
import siteImages from './data/siteImages.json';
import videosSource from './data/videos.json';
import manifest from '../public/gallery/manifest.json';

const LOCAL = (manifest && manifest.images) || {};

/** The local copy of an old-site image when one has been downloaded, else the URL itself. */
export function resolveImage(url) {
  if (!url) return null;
  return LOCAL[url] || url;
}

/** A named portrait or logo, e.g. siteImage('people', 'satish-pradhan'). Null when unknown. */
export function siteImage(group, key) {
  const url = siteImages[group] && siteImages[group][key];
  return url ? resolveImage(url) : null;
}

export const GALLERY_ALBUMS = albumsSource.map((album) => {
  const images = album.images.map((image) => ({
    src: resolveImage(image.src),
    alt: image.alt,
    caption: image.caption || '',
  }));
  return { ...album, images, count: images.length, cover: images[0] };
});

export const GALLERY_CATEGORIES = [...new Set(GALLERY_ALBUMS.map((a) => a.category))];

export const GALLERY_TOTAL_IMAGES = GALLERY_ALBUMS.reduce((sum, a) => sum + a.count, 0);

export function getAlbum(slug) {
  return GALLERY_ALBUMS.find((a) => a.slug === slug) || null;
}

/** Up to `count` images from an album, for teasers on other pages. Empty array when the album is unknown. */
export function albumPreview(slug, count = 4, start = 0) {
  const album = getAlbum(slug);
  return album ? album.images.slice(start, start + count) : [];
}

/** One image from an album found by a fragment of its original file name (stable across re-ordering). */
export function findImage(slug, fragment) {
  const source = albumsSource.find((a) => a.slug === slug);
  if (!source) return null;
  const index = source.images.findIndex((image) => image.src.includes(fragment));
  return index === -1 ? null : getAlbum(slug).images[index];
}

/** Alt text for the named "stories" images (lib/data/siteImages.json). */
const STORY_ALT = {
  'mahad-temple-1': 'The Prabhu Ram Mandir at Mahad, photographed during the trust’s visit of 28 August 2021',
  'mahad-temple-2': 'The Prabhu Ram Mandir at Mahad, 28 August 2021 (second view)',
  'mahad-visit': 'Photograph from the trust’s visit to Mahad on 28 August 2021',
  'wari-camp-saswad': 'Ashadh Wari medical camp at Saswad',
  'bhise-old-age-home': 'At Bhise Old-Age Home, 26 June 2017',
  'kolhapur-notebooks': 'Notebooks for schools in the flood-affected area of Kolhapur',
  'project-diya': 'Project Diya: bicycles for students',
};

export function storyImage(key) {
  const src = siteImage('stories', key);
  return src ? { src, alt: STORY_ALT[key] || '', caption: '' } : null;
}

/**
 * The lead photo of an event, project or area of work: its explicit `cover`
 * ({ story } or { album, file }) if set, otherwise the first photo of its
 * first album. Null when there is no fitting photo (pages then show a motif).
 */
export function coverOf(item) {
  if (!item) return null;
  if (item.cover && item.cover.story) return storyImage(item.cover.story);
  if (item.cover && item.cover.album) {
    const found = findImage(item.cover.album, item.cover.file || '');
    if (found) return found;
  }
  const slugs = item.albums || (item.albumSlug ? [item.albumSlug] : []);
  for (const slug of slugs) {
    const album = getAlbum(slug);
    if (album && album.cover) return album.cover;
  }
  return null;
}

export const VIDEOS = videosSource.map((video) => ({
  ...video,
  url: `https://www.youtube.com/watch?v=${video.id}`,
  thumbnail: resolveImage(`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`),
}));

export const VIDEO_CATEGORIES = [...new Set(VIDEOS.map((v) => v.category))];
