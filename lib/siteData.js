/**
 * Facts about the trust that several public pages repeat. One place to change them.
 *
 * Where the old site (puneckptrust.org) contradicted itself, these are the
 * versions the trust has settled on: phone 7447794477, email
 * puneckpfamily@gmail.com, registration E-8167 dated 14 May 2018.
 * No 80G number is published and no tax deduction is promised anywhere.
 */
export const TRUST = {
  name: 'Pune CKP Family Public Trust',
  nameMr: 'पुणे सीकेपी फॅमिली पब्लिक ट्रस्ट',
  shortName: 'Pune CKP Family',
  regNo: 'E-8167',
  regDate: '14 May 2018',
  pan: 'AADTP7440A',
  phoneDisplay: '+91 7447794477',
  phoneHref: 'tel:+917447794477',
  email: 'puneckpfamily@gmail.com',
  membershipContact: { name: 'Shri Nilesh Gupte', role: 'Secretary', phoneDisplay: '8669151533', phoneHref: 'tel:+918669151533' },
  // As printed on the old site's contact page and footer.
  addressLines: ['Survey No 129/26, 602 Niranka Co-op Housing Society,', 'Ideal Colony, Paud Road, Kothrud,', 'Pune 411038, Maharashtra'],
  motto: 'समाज हिताय सर्वजनसुखाय',
  mottoRoman: 'Samaj Hitaya Sarvajan Sukhaya',
  mottoMeaning: 'for the good of society, for the happiness of all',
  tagline: 'समाजाचे देणं समाजालाच द्यावं',
  taglineMeaning: 'what society gives should be given back to society',
  social: [
    { label: 'Facebook', href: 'https://www.facebook.com/people/Pune-CKP-Family-Public-Trust/100085493575064/' },
    { label: 'YouTube', href: 'https://www.youtube.com/channel/UC56iaWQtXX6Oe_0KemuxOtg' },
    { label: 'Instagram', href: 'https://www.instagram.com/puneckpfamilypublic/' },
  ],
};

/** Main navigation, shared by the header (desktop and mobile drawer) and the footer. */
export const NAV_GROUPS = [
  {
    label: 'About',
    match: ['/about', '/milestones', '/team', '/business-promotion', '/faq'],
    items: [
      { href: '/about', label: 'About the Trust', note: 'Story, objectives and vision' },
      { href: '/milestones', label: 'Milestones', note: 'The journey since 2016' },
      { href: '/team', label: 'Chairman & Team', note: 'Who runs the trust' },
      { href: '/business-promotion', label: 'Business Promotion', note: 'Businesses from the community' },
      { href: '/faq', label: 'FAQ', note: 'Donations, receipts, membership' },
    ],
  },
  {
    label: 'Our Work',
    match: ['/areas-of-work', '/projects', '/impact', '/events'],
    items: [
      { href: '/areas-of-work', label: 'Areas of Work', note: 'Education, health, environment, society, sport' },
      { href: '/projects', label: 'Projects', note: 'Dnyan Kiran, Diya, Udaan and more' },
      { href: '/impact', label: 'Donations & Impact', note: 'Where the support has gone' },
      { href: '/events', label: 'Events & Activities', note: 'Camps, culture, literature, music' },
    ],
  },
  {
    label: 'Gaurav Sohala',
    match: ['/gaurav-sohala'],
    items: [
      { href: '/gaurav-sohala', label: 'All Ceremonies', note: 'The annual felicitation, 2018 to 2025' },
      ...[2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018].map((y) => ({ href: `/gaurav-sohala/${y}`, label: `Gaurav Sohala ${y}` })),
    ],
  },
  {
    label: 'Gallery',
    match: ['/gallery'],
    items: [
      { href: '/gallery', label: 'Photo Albums', note: 'Events and service work in pictures' },
      { href: '/gallery/videos', label: 'Video Gallery', note: 'Programmes and films on YouTube' },
    ],
  },
];

export const NAV_LINKS = [
  { href: '/membership', label: 'Membership' },
  { href: '/contact', label: 'Contact' },
];
