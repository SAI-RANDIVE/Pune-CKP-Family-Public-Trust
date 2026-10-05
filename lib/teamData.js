/**
 * The people and partners named on the old site.
 *
 * SOURCE (docs/old-site-scrape/pages/): team__nandkumar-wadhavkar.md,
 * team__nilesh-r-gupte.md, about-the-trust.md, pcpt-mahad-help.md,
 * cool_timeline__14-april-2021.md, business-promotion.md, _front-page.md,
 * ckp-gaurav-yatra.md.
 *
 * The old site names exactly two office bearers: the Chairman and the
 * Secretary. Its "Meet the Team" page is empty, and both profile pages carry
 * placeholder text instead of a biography, so there are no biographies here.
 * It never published a list of trustees or the members of the working
 * committee formed in 2021. Add them here once the trust supplies them.
 *
 * `photo` / `logo` are keys in lib/data/siteImages.json.
 */
export const TEAM = [
  {
    slug: 'nandkumar-wadhavkar',
    name: 'Shri Nandkumar Wadhavkar',
    nameMr: 'श्री नंदकुमार वढावकर',
    role: 'Chairman',
    roleMr: 'अध्यक्ष',
    photo: 'chairman',
    notes: [
      'Signs the trust’s story and appeal to the community as Chairman.',
      'Was part of the trust’s delegation to flood-hit Mahad on 28 August 2021.',
    ],
  },
  {
    slug: 'nilesh-gupte',
    name: 'Shri Nilesh R. Gupte',
    nameMr: 'श्री निलेश गुप्ते',
    role: 'Secretary',
    roleMr: 'सचिव',
    photo: 'secretary',
    notes: [
      'The person to speak to about membership: 8669151533.',
      'Reported to the community on the trust’s relief visit to Mahad in 2021.',
    ],
  },
];

export const WORKING_COMMITTEE_NOTE = 'On 14 April 2021 a new working committee was formed to conduct the trust’s activities under Vision 2021-22.';

/** The closing lines of the trust's own story, as signed by the Chairman. */
export const CHAIRMAN_MESSAGE = {
  mr: 'अशी ही पुणे सीकेपी पब्लिक ट्रस्ट … समाजासाठी कार्य करणारी, सर्व सणसमारंभ एकोप्याने आनंदाने साजरे करणारी, खास सीकेप्यांची आपली आपुलकीची संस्था…!!',
  en: 'Such is the trust: a special organisation of the CKP community, working for the community and celebrating every festival together, with joy.',
  signatureMr: 'श्री नंदकुमार वढावकर, अध्यक्ष',
  signature: 'Shri Nandkumar Wadhavkar, Chairman',
};

/** Business Promotion: businesses run by members, as advertised on the old site (logos only, no text). */
export const MEMBER_BUSINESSES = [
  { name: 'Lagnagath', logo: 'lagnagath' },
  { name: 'Ojaskara', logo: 'ojaskara' },
  { name: 'Patankar', logo: 'patankar' },
  { name: 'Vaidya', logo: 'vaidya' },
  { name: 'Ashmo', logo: 'ashmo' },
  { name: 'Reshimgathi', logo: 'reshimgathi' },
  { name: 'Aarogyam', logo: 'aarogyam' },
];

/** Publications of the trust. */
export const PUBLICATIONS = [
  {
    title: 'CKP Pratibimba',
    kind: 'E-magazine',
    text: 'The e-magazine of the Pune CKP Family, published from September 2016.',
  },
  {
    title: 'The Pride of Chandraseniya Kayastha Prabhu Community',
    titleMr: 'चांद्रसेनीय कायस्थ प्रभू समाज – एक गौरवयात्रा',
    kind: 'Book, in Marathi and English',
    text: 'A book to introduce the people of the CKP community who have done notable work in many fields, and their work, to the community, to the coming generation, and to readers outside the community and outside the Marathi language. It has a digital edition in twelve chapters.',
  },
];
