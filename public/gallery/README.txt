Gallery photographs
===================

One folder per album, files named image1.jpg, image2.jpg, image3.jpg ...
(keep the original extension: .jpg, .jpeg, .png or .webp).

  public/gallery/<album-slug>/image1.jpg
  public/gallery/<album-slug>/image2.jpg

1) Photos from the old website (puneckptrust.org)

   The album list is in lib/data/galleryAlbums.json and currently points at
   the old site's image URLs. To copy every one of them here, run once:

       node scripts/fetch-old-images.js

   It fills these folders and writes manifest.json (old URL -> local file).
   The website then uses the local copies automatically and no longer needs
   the old domain. Rebuild/redeploy afterwards. Safe to run again at any time.
   Folders named "people", "sohala", "team", "supporters", "business",
   "stories" and "videos" hold portraits, posters, logos and video thumbnails.

2) New photos

   Create public/gallery/<album-slug>/ and add image1.jpg, image2.jpg ...
   Then add the album to lib/data/galleryAlbums.json:

       {
         "slug": "<album-slug>",
         "title": "Album title",
         "year": 2026,
         "category": "Community",
         "description": "One sentence about the occasion.",
         "images": [
           { "src": "/gallery/<album-slug>/image1.jpg", "alt": "What the photo shows", "caption": "" }
         ]
       }

   Write the alt text for the photo it actually shows. Use only photographs
   the trust has approved for publication.

Do not edit manifest.json by hand.
