/**
 * Published impact figures, the donations ledger and testimonials.
 *
 * SOURCE (docs/old-site-scrape/pages/): _front-page.md (the four counters),
 * donations-and-contributions.md (the ledger and the list of schools),
 * historical-events.md, testimonials.md.
 *
 * These are figures the trust itself published on its old site. They are
 * totals by cause or by recipient organisation; no individual beneficiary is
 * named anywhere on the public site.
 *
 * Contradictions on the old site, and what is used here:
 *  - Total spent: the four counters add up to Rs 60,13,537, while a paragraph
 *    below them says "more than about Rs 64 lakh". The lower, itemised figure
 *    is used ("more than Rs 60 lakh").
 *  - Computers: "16 computers and 1 laptop" on two pages, "15 computers and 1
 *    laptop" on a third, and the itemised list adds up to 11 + 1. No total is
 *    stated; the itemised list is shown as published.
 *  - Mahad flood relief: Rs 1,25,000 in the ledger, other amounts elsewhere.
 *    Every version is above Rs 1 lakh, so the row says "more than Rs 1,00,000".
 *  - Gaurav Sohala 2019 donations: the narrative and the photo captions differ
 *    on which institutions received Rs 1.5 lakh. Only the ledger rows are shown.
 */

/** The four counters on the old home page: rupees contributed, by cause. */
export const CONTRIBUTION_COUNTERS = [
  { key: 'education', label: 'Educational Support', amount: 1872250, note: 'Student aid, notebooks, bicycles and computers for schools', href: '/areas-of-work/educational' },
  { key: 'health', label: 'Healthcare Initiatives', amount: 2152310, note: 'Medical aid, medical camps and support for Warkari pilgrims', href: '/areas-of-work/medical' },
  { key: 'social', label: 'Social Welfare & Community Development', amount: 1917977, note: 'Flood relief, old-age homes and pandemic aid', href: '/areas-of-work/social' },
  { key: 'environment', label: 'Environmental Programs', amount: 71000, note: 'Water conservation and tree plantation', href: '/areas-of-work/environmental' },
];

export const CONTRIBUTION_TOTAL = CONTRIBUTION_COUNTERS.reduce((sum, c) => sum + c.amount, 0);

/**
 * Static figures for the home page "Our Impact" band, used whenever the
 * database (view v_public_impact) cannot be read. All from the old site.
 */
export const STATIC_IMPACT = [
  { key: 'contributed', value: CONTRIBUTION_TOTAL, notation: 'lakh', prefix: '₹', unit: 'lakh+', label: 'Contributed to social causes', note: 'Education, health, welfare and environment' },
  { key: 'years', value: 8, suffix: '', label: 'Years of service as a trust', note: 'Registered on 14 May 2018' },
  { key: 'sohala', value: 8, suffix: '', label: 'Years of the Gaurav Sohala', note: '2018 to 2025; the 2020 awards were presented at home' },
  { key: 'families', value: 100, suffix: '', label: 'Families given monthly rations', note: 'In the first wave of the pandemic, 2020' },
];

/** The "Donations & Contributions" ledger of the old site, by recipient. Amounts in rupees. */
export const DONATIONS_LEDGER = [
  { recipient: 'Sahyadri Manav Seva Manch', amount: 361000, purpose: 'Medical aid to the Pandharpur Wari pilgrimage', area: 'Medical' },
  { recipient: 'Queen Mary’s Technical Institute (QMTI)', amount: 150000, purpose: 'For disabled soldiers', area: 'Social' },
  { recipient: 'Bhise Old-Age Home, Talegaon', amount: 150000, purpose: 'Extension work of the old-age home', area: 'Social' },
  { recipient: 'Police stations and old-age homes, Pune', amount: 150000, purpose: 'Covid-19 prevention healthcare items to various police stations in Pune, and food grains to old-age homes', area: 'Social' },
  { recipient: 'Seva Sahayog Foundation', amount: 150000, purpose: 'Educational aid to needy students', area: 'Educational' },
  { recipient: 'Advitya Kala Sangam Trust', amount: 150000, purpose: 'Help to specially abled adults', area: 'Social' },
  { recipient: 'Mahad flood relief', amount: null, amountText: 'More than ₹1,00,000', purpose: 'Relief for families affected by the Mahad floods of 2021', area: 'Social' },
  { recipient: 'Anandwan Bhujal Yojana', amount: 50000, purpose: 'Water conservation projects', area: 'Environmental' },
  { recipient: 'CKP families', amount: 35000, purpose: 'Medical aid', area: 'Medical' },
  { recipient: 'Ekvira Devi Devasthan', amount: 11111, purpose: 'Temple work', area: 'Social' },
  { recipient: 'Various institutions', amount: 25000, purpose: 'Books and notebooks (value of goods donated)', area: 'Educational' },
  { recipient: 'Rural schools in and around Pune', amount: null, amountText: 'In kind', purpose: 'Computers and a laptop, for online classes during the pandemic', area: 'Educational' },
];

/** "For computerisation of schools in the corona pandemic situation": as itemised on the old site. */
export const COMPUTER_DONATIONS = [
  { items: '2 computers', recipient: 'Zilla Parishad Kendra Shala, Alyani, Shahapur', recipientMr: 'जिल्हा परिषद केंद्रशाळा, अल्याणी, शहापूर' },
  { items: '3 computers', recipient: 'Rayari Madhyamik Vidyalaya, Rayari, Bhor', recipientMr: 'रायरी माध्यमिक विद्यालय, रायरी, भोर' },
  { items: '3 computers', recipient: 'Radhabai A. Sathe Madhyamik, Dombivli', recipientMr: 'राधाबाई ए. साठे माध्यमिक, डोंबिवली' },
  { items: '1 computer', recipient: 'Sant Tukaram Shikshan Prasarak Mandal, Mahadevi Madhyamik Vidyalaya, Ingalun, Maval', recipientMr: 'संत तुकाराम शिक्षण प्रसारक मंडळ, महादेवी माध्यमिक विद्यालय, इंगळुन, मावळ' },
  { items: '1 laptop', recipient: 'An individual recipient at Vangani', recipientMr: null },
  { items: '2 computers', recipient: 'Late Baburao Genuji Pingale Patil Vidyalaya, Gulani, Khed', recipientMr: 'कै. बाबुराव गेनूजी पिंगळे पाटील विद्यालय, गुळाणी, खेड' },
];

/** Other relief and welfare work recorded on the old site, without rupee totals of their own. */
export const RELIEF_WORK = [
  { title: 'Rations for 100 families', text: 'Monthly rations for 100 needy families during the lockdown of 2020.' },
  { title: 'Safety kits for Pune police', text: 'Sets of sanitiser, face masks and gloves for police at outposts and on patrol across Pune city.' },
  { title: 'Old-age homes and SAMPARC', text: 'Food grain and edible oil for "Aai" and "Nivara" old-age homes in Pune and for SAMPARC, Lonavla; food packets at Matoshree old-age home.' },
  { title: 'Notebooks for schools', text: '65 kg of notebooks to Nutan Samarth Vidyalaya at the first Gaurav Sohala (2018), 50 dozen for flood-affected students around Sangli and Kolhapur (2019), and 200-page notebooks to Swami Vivekananda Jeevanjyot Sanstha, Pune (2020).' },
  { title: 'Emergency medical help', text: 'Rs 25,000 to a needy family at the first Gaurav Sohala, Rs 11,000 to a heart patient in Virar a week after the trust was formed, and an interest-free medical loan of Rs 25,000 to a member in May 2019.' },
  { title: 'A goshala in the lockdown', text: 'Rs 10,000 in cash for fodder to the goshala run by Vaze Guruji.' },
];

/**
 * Quoted from the organisations' own letters, as published on the old site.
 * Attributed quotations: do not paraphrase.
 */
export const TESTIMONIALS = [
  { quote: 'We thank you for arranging the financial assistance which will be of a great help to us.', org: 'Advitya Kala Sangam Trust', place: 'Mumbai' },
  { quote: 'We thank you for your support and donation towards CKP Gaurav Sohala.', org: 'Chandraseniy Kayastha Prabhu Sabha', place: 'Dadar, Mumbai' },
  { quote: 'We have no words to convey our feelings to you for your valuable contribution, but to say "May the blessing of Lord Vithoba be showered on you all".', org: 'Sahyadri Manav Seva Manch', place: 'Thane' },
];

/** "Special Thanks" on the old home page. `logo` is a key in lib/data/siteImages.json ("supporters"). */
export const SUPPORTERS = [
  { name: 'Dnyansadhana College', logo: 'dnyansadhana' },
  { name: 'Deccan Investments', logo: 'deccan' },
  { name: 'Sajag Securities Pvt. Ltd.', logo: 'sajag' },
  { name: 'Wisdom Labs', logo: 'wisdom' },
  { name: 'VFC', logo: 'vfc' },
];
