/**
 * Named projects and schemes of the trust.
 *
 * SOURCE (docs/old-site-scrape/pages/): dnyan-kiran-student-assistance-fund.md,
 * project-diya-cycle-donation.md, future.md (Vision 2021), _front-page.md
 * (the 2026 summary that names Project Udaan, Niramay Arogya Yojana and
 * Blossoming Buds), about-the-trust__objectives.md, historical-events.md and,
 * for Mahad, mahad-floods.md, pcpt-mahad-help.md, mahad-ram-mandir.md.
 *
 * The old site says very little about Project Udaan, Niramay Arogya Yojana and
 * Blossoming Buds: one sentence each. Those entries are short on purpose.
 * Nothing here is invented to fill them out.
 *
 * `cover`: { album, file } or { story }, see lib/galleryData.js. `albums` are
 * gallery album slugs shown on the project page.
 */
export const PROJECTS = [
  {
    slug: 'dnyan-kiran',
    title: 'Dnyan Kiran',
    subtitle: 'Student Assistance Fund',
    titleMr: 'ज्ञानकिरण – विद्यार्थी सहाय्य योजना',
    area: 'educational',
    since: 'Introduced 15 March 2021',
    tagline: 'Every child deserves education.',
    metaDescription: 'Dnyan Kiran, the Student Assistance Fund of Pune CKP Family Public Trust: school support, scholarships and an "adopt a child" plan from Rs 3,000 a year.',
    summary: 'A fund to meet the educational needs of needy and deserving students: school support, scholarships, and help with the cost of higher education.',
    body: [
      'Dnyan Kiran aims to create funds to meet the educational needs of needy and deserving students in the community. The fund is collected and used by the trust under the title "Dnyan Kiran – Student Assistance Fund", and all decisions on distributing it follow the rules of the charitable trust.',
      'The trust’s Vision 2021 brought its other education work under the same name: notebooks for needy school children from time to time, bicycles for children who need them, the student adoption scheme, and computers for schools where poorer students study.',
    ],
    lists: [
      {
        heading: 'How the fund is used',
        items: ['Primary and secondary education assistance', 'Academic scholarships', 'Educational loans at a very reasonable interest rate for higher education'],
      },
      {
        heading: 'What donors who adopt a child can expect',
        items: [
          'The trust informs donors of the adopted child’s name and location.',
          'A half-yearly progress card is shared by the trust’s team.',
          'Donors are requested to adopt a child for at least three consecutive years, for the betterment of the child.',
        ],
      },
    ],
    plans: {
      heading: 'Adopt a needy and poor child',
      note: 'Per year, per student. Each category covers the same things; choose the one that suits you.',
      includes: ['School books and notebooks', 'School bag and compass box', 'Two sets of uniform', 'Meals'],
      options: [
        { name: 'Category 1', amount: '₹3,000' },
        { name: 'Category 2', amount: '₹5,000' },
        { name: 'Category 3', amount: '₹10,000' },
      ],
    },
    extra: [
      {
        heading: 'Encouragement awards',
        text: 'Vision 2021 also announced the trust’s Protsahan Puraskar (Encouragement Award) for bright and promising students from economically weaker families in Pune district: five students each from the 10th and 12th standards who have performed best.',
      },
      {
        heading: 'At V. R. Ruia school',
        text: 'In 2023, with the co-operation of Cummins India Foundation, Dnyan Kiran support reached V. R. Ruia Mook Badhir Vidyalaya, the school for deaf-mute children in Pune.',
        href: '/events/dnyan-kiran-ruia-school-2023',
      },
    ],
    albums: ['dnyan-kiran-ruia-school-2023', 'shikshak-din-2021'],
  },
  {
    slug: 'project-diya',
    title: 'Project Diya',
    subtitle: 'Bicycles for students',
    titleMr: 'प्रकल्प दिया',
    area: 'educational',
    since: 'Introduced 15 March 2021',
    tagline: 'Donate your old bicycle.',
    metaDescription: 'Project Diya gives bicycles to students who need them to reach school. Donate a bicycle (Rs 5,000), your old bicycle, or the cost of a repair (Rs 1,500).',
    summary: 'Bicycles, many of them reused, for students who need them to travel to school.',
    body: [
      'True social service is in helping people by giving them something that can empower them to live a better life. Through Project Diya the trust hopes to provide bicycles to students who can use them for travelling to school.',
      'Reused bicycles have been made available to students in rural areas. Your support in helping the trust find cycles, or students who could benefit from having one, is much appreciated.',
      'The trust also welcomes donations of books, educational material and old computers or laptops for needy and poor students.',
    ],
    plans: {
      heading: 'Three ways to help',
      options: [
        { name: 'Donate a bicycle', amount: '₹5,000' },
        { name: 'Donate an old bicycle', amount: 'Your old bike' },
        { name: 'Repair a bicycle', amount: '₹1,500' },
      ],
    },
    cover: { story: 'project-diya' },
    albums: [],
  },
  {
    slug: 'project-udaan',
    title: 'Project Udaan',
    subtitle: 'Education for deaf-mute children',
    titleMr: 'प्रकल्प उडाण',
    area: 'educational',
    tagline: 'Quality education for children who cannot hear or speak.',
    metaDescription: 'Project Udaan: special initiatives of Pune CKP Family Public Trust for the quality education of deaf-mute children.',
    summary: 'Special initiatives for the quality education of deaf-mute children.',
    body: [
      'Under Project Udaan the trust runs special initiatives for the quality education of deaf-mute children. The education of differently-abled children and children with special needs is one of the trust’s main fields of work.',
    ],
    extra: [
      {
        heading: 'With the Ruia school',
        text: 'The trust has worked with V. R. Ruia Mook Badhir Vidyalaya in Sadashiv Peth, Pune, where it celebrated Teachers’ Day on 8 September 2023.',
        href: '/events/teachers-day-ruia-school-2023',
      },
    ],
    albums: ['teachers-day-2023'],
  },
  {
    slug: 'niramay-arogya-yojana',
    title: 'Niramay Arogya Yojana',
    subtitle: 'Medical help for families in need',
    titleMr: 'निरामय आरोग्य योजना',
    area: 'medical',
    tagline: 'Standing with families through medical distress.',
    metaDescription: 'Niramay Arogya Yojana provides medical assistance and health services to needy families, alongside interest-free medical loans of up to Rs 25,000 for members.',
    summary: 'Medical assistance and health services for needy families.',
    body: [
      'Under the Niramay Arogya Yojana, medical assistance and health services are provided to needy families.',
    ],
    extra: [
      {
        heading: 'Interest-free medical loan',
        text: 'The trust gives interest-free loans of up to Rs 25,000 to needy members to meet the cost of medical treatment. Nothing is repaid for the first two months; after that the loan is repaid over the next ten months at 10% a month.',
      },
      {
        heading: 'Where it began',
        text: 'In September 2016 the group started an Emergency Medical Fund for its members, at Rs 500 per family per year.',
      },
      {
        heading: 'Medical camps',
        text: 'Trust volunteers serve at medical camps for Pandharpur Wari pilgrims and in tribal hamlets and rural schools.',
        href: '/events/pandharpur-wari-medical-camps',
      },
    ],
    cover: { album: 'album-2018', file: 'Medical-Camp-kartiki-wari-Khandala' },
    albums: ['medical-wari-2023'],
  },
  {
    slug: 'blossoming-buds',
    title: 'Blossoming Buds',
    subtitle: 'For girls in rural areas',
    titleMr: 'ब्लॉसमिंग बड्स',
    area: 'social',
    tagline: 'Dignity for girls in rural areas.',
    metaDescription: 'Blossoming Buds: Pune CKP Family Public Trust makes sanitary napkins available to girls in rural areas during their periods.',
    summary: 'Sanitary napkins made available to girls in rural areas during their periods.',
    body: [
      'Through the Blossoming Buds project, the sanitary napkins that girls in rural areas need during their periods are made available to them. Women’s empowerment is one of the trust’s main fields of work.',
    ],
    albums: [],
  },
  {
    slug: 'mahad-ram-mandir',
    title: 'Mahad Prabhu Ram Mandir',
    subtitle: 'Flood relief and a temple to restore',
    titleMr: '१५० वर्षाहून हि जुने चं. का. प्रभू समाजाचे प्रभू राम मंदिर, महाड',
    area: 'social',
    since: 'July to September 2021',
    tagline: 'A temple more than 150 years old, and the families around it.',
    metaDescription: 'The Prabhu Ram Mandir of the CKP community at Mahad, over 150 years old, was badly damaged in the 2021 floods. The story, and how the trust helped.',
    summary: 'The Prabhu Ram Mandir of the CKP community at Mahad, more than 150 years old, was badly damaged in the floods of 2021. The trust took relief to the families and made the first contribution towards restoring the temple.',
    story: [
      {
        heading: 'The flood',
        paragraphs: [
          'The great flood that struck Mahad in 2021 hit the ancient, historic Prabhu Ram Mandir, the pride of the CKP community of Mahad. The temple stands beside the Savitri river. About 12 to 13 feet of water entered it, and the force of the water shifted the original wooden sanctum. For two days the temple was completely filled with mud.',
          'The president of the temple, Shri Raghuveer Deshmukh, and Sau. Deshmukh came forward themselves and, with the help of workers, had the mud cleared. But the condition of the temple was grave: without prompt repair it was in danger of giving way.',
        ],
      },
      {
        heading: 'A temple with a long memory',
        paragraphs: [
          'Some two to two-and-a-half centuries ago there was a large Kayastha community in the Mahad area. Like the Vireshwar Devasthan of Mahad, the Prabhu Ram Mandir has historic importance. Many stalwarts, among them Surbanana Tipnis, have served as trustees of the temple.',
          'For a century and a half and more, the religious and cultural life of the community has been lived here: Ram Navami and the nine-day festival from Gudi Padwa to Ram Navami, Krishna Janmashtami, Hanuman Jayanti, Chaitra Gauri pujan, Haldi-Kumkum, Sankranti, Navaratri and more.',
          'There is a record that in 1880 the CKP community of Karachi, then part of undivided India, gave a donation of Rs 1,201 to the temple. The rear part of the temple was built from that donation.',
        ],
      },
      {
        heading: 'The trust’s visit, 28 August 2021',
        paragraphs: [
          'On 28 August 2021 a delegation of the trust went to Mahad, met the families of the community and saw the effects of the flood at first hand. As a small help, 110 export-quality blankets were given to 55 families.',
          'The delegation visited the temple, reviewed the damage to its structure, sanctum and surroundings, and discussed how it could be restored. To begin the restoration at once, the trust gave the first Rs 51,000 on behalf of the whole community.',
          'From Mahad, the president of the community’s mandal Shri Tipnis, Shri Raghuveer Deshmukh and many members of the working committee were present. From the trust came the Chairman Shri Nandkumar Wadhavkar, Shri Nilesh Gupte, Shri Pankaj Gadkari, Shri Ajit and Sau. Mohana Tipnis, Shri Nilesh N. Gupte and Shri Sachin Raje.',
          'In all, with the help of the community, the trust arranged more than Rs 1 lakh of aid for the flood-affected area of Mahad. After the visit it recorded plainly that, almost two months on, this help was still too little, as the water lines left on the walls of the houses showed.',
        ],
      },
      {
        heading: 'Janmashtami, in spite of everything',
        paragraphs: [
          'That year, as every year, the CKP community of Mahad celebrated Shrikrishna Janmashtami at the temple in the traditional way, even while the wounds of the flood were fresh. The celebration began at eight in the evening and ended at one. There was a chocolate handi for the children and the traditional CKP meal, and more than a hundred people came.',
          'The damage to the temple was discussed, and a firm decision was taken to restore it. After the puja and aarti, the blankets, sheets and other material sent by the trust were distributed. The evening closed with sunthavada prasad.',
        ],
        attribution: 'From the account of Shri Raghuveer Deshmukh, President, CKP Mahad',
      },
    ],
    cover: { story: 'mahad-temple-1' },
    albums: ['mahad-ram-mandir', 'mahad-flood-relief', 'shrikrishna-janmashtami-mahad'],
  },
];

export function getProject(slug) {
  return PROJECTS.find((p) => p.slug === slug) || null;
}

/** Planned CSR work, as announced by the trust in 2026. Plans, not completed work. */
export const UPCOMING_PROJECTS = {
  intro: 'The trust intends to take up social work on a wider scale. Its upcoming CSR projects are planned at a cost of more than ₹40 lakh, with the aim of taking its total social contribution up to ₹1 crore in 2026–27.',
  items: [
    { title: 'Solar-powered water purification', text: 'A water purification project run on solar energy, for rural areas.' },
    { title: 'Transport for rural students', text: 'A transport assistance scheme for students in rural areas.' },
    { title: 'Solar power for special schools', text: 'Solarisation of schools for differently-abled students.' },
  ],
};
