/**
 * Areas of work.
 *
 * The first five are the objectives in the trust deed (old site:
 * /about-the-trust/objectives/). The sixth, Literature & Art, is the extra
 * focus area the trust added in its Vision 2021 (old site: /future/); it is
 * marked `fromVision: true` so pages can say so rather than call it a deed
 * objective.
 *
 * `points` are the objectives as published. `initiatives` are named schemes
 * and recorded work; `href` links to a project, event or impact page.
 * `icon` is a key understood by components/AreaIcon.js.
 * `cover` picks one real photo: { album, file } or { story } (lib/galleryData.js).
 */
export const AREAS_OF_WORK = [
  {
    slug: 'educational',
    title: 'Educational',
    titleMr: 'शैक्षणिक',
    icon: 'book',
    tagline: 'A good education within reach of every deserving child.',
    metaDescription: 'Scholarships, notebooks, uniforms and coaching for deserving students, plus Dnyan Kiran aid, Project Diya bicycles, Project Udaan and computers for rural schools.',
    summary: 'Scholarships, notebooks, uniforms and coaching support for deserving and needy students, bicycles for rural students, and computers for rural schools.',
    points: [
      'To run, maintain or assist any educational or other institution for coaching, guidance, counselling or vocational training.',
      'To grant individual scholarships to poor, deserving and needy students for elementary and higher education.',
      'To give financial or other assistance in kind, by way of distribution of books, notebooks, clothes and uniforms, to needy and poor children.',
      'To assist in the financial expenses of poor and needy students.',
    ],
    initiatives: [
      { name: 'Dnyan Kiran: Student Assistance Fund', note: 'School support, scholarships and help with higher education for needy and deserving students, including the "Adopt a Needy and Poor Child" plan (₹3,000, ₹5,000 or ₹10,000 per year per student, covering books, bag, uniform and meals).', href: '/projects/dnyan-kiran' },
      { name: 'Project Diya', note: 'Bicycles, many of them reused, so that students can travel to school (₹5,000 to donate a bicycle, ₹1,500 to repair one, or give your old bicycle).', href: '/projects/project-diya' },
      { name: 'Project Udaan', note: 'Special initiatives for the quality education of deaf-mute children.', href: '/projects/project-udaan' },
      { name: 'Computers for rural schools', note: 'Computers and a laptop donated to needy schools in rural areas, to help them hold online classes during the pandemic.', href: '/impact#computers' },
      { name: 'Notebooks and felicitations', note: 'Notebooks for needy and flood-affected students; felicitation of 10th and 12th standard students and of teachers on Shikshak Din.', href: '/events/shikshak-din-2021' },
    ],
    cover: { album: 'computer-donation', file: 'Computer-Donation' },
  },
  {
    slug: 'medical',
    title: 'Medical',
    titleMr: 'वैद्यकीय',
    icon: 'heart',
    tagline: 'Standing with members and the community through medical distress.',
    metaDescription: 'Interest-free loans of up to ₹25,000 for members facing medical costs, the Niramay Arogya Yojana, and medical camps for Pandharpur Warkari pilgrims and tribal areas.',
    summary: 'Interest-free loans of up to ₹25,000 for members facing medical costs, medical aid for families, and medical camps for Warkari pilgrims and tribal areas.',
    points: [
      'To give interest-free loans of up to Rs 25,000 to needy members for meeting the cost of medical treatment.',
      'To provide assistance among the CKP community in case of medical distress.',
      'To create awareness among poor and indigent people about various illnesses, and provide medical assistance.',
    ],
    initiatives: [
      { name: 'Niramay Arogya Yojana', note: 'Medical assistance and health services for needy families.', href: '/projects/niramay-arogya-yojana' },
      { name: 'Interest-free medical loan', note: 'Up to Rs 25,000 for a needy member. Nothing is repaid for the first two months; then 10% a month over the next ten months.', href: '/projects/niramay-arogya-yojana' },
      { name: 'Sahyadri Manav Seva Manch', note: 'Since July 2018, volunteers and funds (Rs 3.61 lakh in all) for the Manch’s charitable medical camps for the pilgrims of the Pandharpur Wari.', href: '/events/pandharpur-wari-medical-camps' },
      { name: 'Medical camps', note: 'Camps in tribal areas near Lonavla (2019), the Medical Wari at Zendewadi (2023) and a blood donation camp (13 September 2020).', href: '/events' },
    ],
    cover: { story: 'wari-camp-saswad' },
  },
  {
    slug: 'environmental',
    title: 'Environmental',
    titleMr: 'पर्यावरण',
    icon: 'leaf',
    tagline: 'Save the environment, save lives, save the country.',
    metaDescription: 'Tree plantation and conservation drives, support for the Anandwan Bhujal Yojana water-conservation work, and environmental awareness in the community.',
    summary: 'Tree plantation and conservation, support for water conservation, and awareness of the environment in the community.',
    points: [
      'To create environmental awareness amongst the community.',
      'To undertake and organise tree plantation drives in various areas.',
      'To undertake any activity that will be supplemental to fulfilling the environmental objects.',
      'To undertake any activity, programme or project incidental to the above objects of the trust, at the discretion of the Board of Trustees.',
    ],
    initiatives: [
      { name: 'Anandwan Bhujal Yojana', note: 'Rs 50,000 donated for water conservation projects.', href: '/impact' },
      { name: 'Tree plantation and conservation', note: 'The trust has taken up tree planting and tree conservation, under the motto "Save the environment, save lives, save the country".' },
    ],
  },
  {
    slug: 'social',
    title: 'Social',
    titleMr: 'सामाजिक कार्य',
    icon: 'hands',
    tagline: 'Samaj Hitaya Sarvajan Sukhaya: for the good of society, for the happiness of all.',
    metaDescription: 'Mahad flood relief, support for old-age homes, COVID-19 rations for 100 families, aid to institutions for disabled soldiers and special adults, and Blossoming Buds.',
    summary: 'Relief in floods and the pandemic, support for old-age homes and institutions, and help for economically weaker families, irrespective of caste, creed or religion.',
    points: [
      'To promote welfare, social, cultural, charitable, health, education, humanitarian and relief activities that protect, safeguard and improve the quality of human life, particularly for economically weaker sections of society, irrespective of caste, creed, race, colour, sex or religion, so that they may lead a healthy, happy, contented and dignified life.',
      'To undertake projects and conduct programmes for social and cultural activities which promote peace and harmony in and among various communities.',
      'To award Gaurav Puraskars to people who have dedicated their lives to, or are doing, work worth recognising in fields such as social and religious work, the arts, academics and sport.',
      'To work for noble humanity, world peace, eternal values and sustainable life.',
    ],
    initiatives: [
      { name: 'Mahad flood relief and the Prabhu Ram Mandir', note: 'Blankets for 55 families and Rs 51,000 towards restoring the historic temple of the CKP community at Mahad (2021).', href: '/projects/mahad-ram-mandir' },
      { name: 'COVID-19 relief', note: 'Monthly rations for 100 needy families, safety kits for Pune police, and food grain and oil for old-age homes and SAMPARC (2020).', href: '/events/covid-19-relief' },
      { name: 'Old-age homes', note: 'Support for Bhise Old-Age Home (Talegaon), "Aai", "Nivara" and Matoshree old-age homes, including a Diwali evening with the residents of "Aai".', href: '/impact' },
      { name: 'Institutions supported', note: 'Queen Mary’s Technical Institute for disabled soldiers, Advitya Kala Sangam Trust for specially abled adults, and Seva Sahayog Foundation for needy students.', href: '/impact' },
      { name: 'Blossoming Buds', note: 'Sanitary napkins for girls in rural areas during their periods.', href: '/projects/blossoming-buds' },
      { name: 'Pune CKP Gaurav Sohala', note: 'The annual felicitation of people whose work deserves recognition, held since 2018.', href: '/gaurav-sohala' },
    ],
    cover: { album: 'album-2020', file: 'Food-Grains-Donation-at-Nivara' },
  },
  {
    slug: 'sports',
    title: 'Sports',
    titleMr: 'क्रीडा',
    icon: 'trophy',
    tagline: 'Good health through sports.',
    metaDescription: 'The CKP Badminton Tournament Pune 2019, a Carrom competition in 2021 and the trust’s plans for cricket, box football and table tennis for the community’s youth.',
    summary: 'Tournaments and competitions that build sportsmanship and good health across the community.',
    points: [
      'To create awareness about sports, all types of games and sportsmanship in society, and to arrange training and guidance camps, championships, tournaments and other programmes for the growth of sports culture and a healthy life for the new generation.',
      'To get affiliated to bodies working at district, regional and national levels for the promotion of these aims.',
    ],
    initiatives: [
      { name: 'CKP Badminton Tournament Pune 2019', note: 'The trust was the main sponsor, to promote "good health through sports".', href: '/events/ckp-badminton-tournament-2019' },
      { name: 'Carrom competition, 2021', note: 'Held for the community’s sports enthusiasts on 14 February 2021.', href: '/events/carrom-competition-2021' },
      { name: 'Planned competitions', note: 'Vision 2021 set out yearly competitions in cricket, badminton, box football, carrom and table tennis, to encourage the community’s youth.' },
    ],
    cover: { album: 'badminton-tournament-2019', file: 'Champions-of-Badminton' },
  },
  {
    slug: 'literature-and-art',
    title: 'Literature & Art',
    titleMr: 'साहित्य व कलाक्षेत्र',
    icon: 'music',
    fromVision: true,
    tagline: 'Literature is a mirror of our life.',
    metaDescription: 'Literary, musical and cultural work of Pune CKP Family Public Trust: the CKP Sahitya Sammelan, Sangeet Rajani, Swaranche Chandane, Diwali Delight and competitions.',
    summary: 'Literary meets, music programmes and festival competitions that give the community’s writers and artists a stage.',
    points: [
      'To organise literary competitions (poems, stories, essays) for the community’s writers, judged by veterans and experts in the field.',
      'To give the many members active in the arts an opportunity to progress in their field.',
      'To provide, through CKP Sangeet Rajani, a platform that promotes and brings out talented artists in music, whether singers or instrumentalists.',
      'To keep up the enthusiasm for the festivals of Marathi culture, with a decoration competition at Gauri-Ganpati and Rangoli and fort (killa) competitions at Diwali.',
    ],
    initiatives: [
      { name: 'Second CKP Sahitya Sammelan, Pune 2022', note: 'A literary meet with a Kavyakatta poetry session and a Sahitya Dindi and book publication.', href: '/events/second-ckp-sahitya-sammelan-2022' },
      { name: 'Music programmes', note: 'Sangeet Rajani auditions (2021), Swaranche Chandane on Gudi Padwa and Lata Taal Part 2 (2023), Kayastha Swararang and Retro2Metro.', href: '/events' },
      { name: 'Diwali Delight', note: 'Cultural entertainment and a CKP food competition in 2022; an evening of music at Nivara Vrudhashram in 2023.', href: '/events/diwali-delight-2023' },
      { name: 'Competitions', note: 'A Kavya Spardha (poetry competition) in January 2020 and a Rangoli competition in September 2020.', href: '/events/rangoli-competition-2020' },
      { name: 'Publications', note: 'The e-magazine "CKP Pratibimba" and the book "The Pride of Chandraseniya Kayastha Prabhu Community".', href: '/about#publications' },
    ],
    cover: { album: 'swaranche-chandane-2023', file: 'SC1' },
  },
];

export function getAreaBySlug(slug) {
  return AREAS_OF_WORK.find((a) => a.slug === slug);
}

/** The five objectives named in the trust deed (everything except the Vision 2021 addition). */
export const DEED_AREAS = AREAS_OF_WORK.filter((a) => !a.fromVision);
