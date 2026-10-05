/**
 * Milestones of the trust.
 *
 * ROADMAP: all 31 entries of the old site's "Roadmap" timeline
 * (docs/old-site-scrape/pages/roadmap*.md and cool_timeline__*.md), January
 * 2016 to September 2021. Wording is tightened; facts are as published.
 *
 * LATER: the old timeline stops in September 2021. Entries after that come
 * from the old site's Gaurav Sohala pages and photo/video galleries only.
 *
 * Where the old site gives two versions of a fact, the entry uses the more
 * conservative one or leaves the figure out:
 *  - Rs 25,000 to a needy family: timeline says 18 April 2018, the narrative
 *    says it was given at the Sohala of 18 March 2018 -> "March-April 2018".
 *  - Sahyadri Manav Seva Manch: 1 July vs 9 July 2018 -> "July 2018".
 *  - Kolhapur notebooks: 16 vs 19 August 2019 -> "August 2019".
 *  - Safety kits for Pune police: 1,500 personnel vs 15,000 kits -> no count.
 *  - Computers: 15 vs 16 (+1 laptop) -> no count.
 *  - Mahad flood aid: timeline dates Rs 1.0 lakh to 5 July 2021, before the
 *    flood, and other pages give Rs 1.25 lakh and about Rs 1.5 lakh
 *    -> "July 2021", "more than Rs 1 lakh".
 *
 * `category`: community | trust | education | health | relief | culture | sports | honour
 */
export const ROADMAP = [
  { id: '2016-01-11', year: 2016, date: '11 January 2016', category: 'community', highlight: true, title: 'The first step', text: '"A journey of a thousand miles starts with a single step": the first baby step in the journey of the Pune CKP Family, a WhatsApp group started on 11 January 2016.' },
  { id: '2016-08', year: 2016, date: 'August 2016', category: 'community', title: 'Monthly meetings begin', text: 'Monthly meetings start, held on the second Sunday of every month.' },
  { id: '2016-09', year: 2016, date: 'September 2016', category: 'health', title: 'Emergency medical fund', text: 'Membership fees for an Emergency Medical Fund for group members begin, at Rs 500 per family per year.' },
  { id: '2016-09-14', year: 2016, date: '14 September 2016', category: 'culture', title: 'CKP Pratibimba', text: 'Publication of the e-magazine "CKP Pratibimba" begins.' },
  { id: '2017-08', year: 2017, date: 'August 2017', category: 'community', title: 'CKP Akhad party', text: 'The get-together "CKP Akhad Party" starts in August 2017.' },
  { id: '2017-09', year: 2017, date: 'September 2017', category: 'culture', title: 'Ganesh Maha Aarti', text: 'Ganesh Maha Aarti is introduced, held at members’ residences.' },
  { id: '2017-10-02', year: 2017, date: '2 October 2017', category: 'culture', title: 'Bhondala, Kojagiri and Garba', text: 'Marathi cultural programmes begin: Bhondala, with Kojagiri Pournima and a Garba night.' },
  { id: '2018-01', year: 2018, date: 'January 2018', category: 'trust', title: 'Formal and legal set-up', text: 'The formal and legal set-up of the trust is taken in hand.' },
  { id: '2018-03-18', year: 2018, date: '18 March 2018', category: 'honour', highlight: true, title: 'First Pune CKP Gaurav Sohala', text: 'The first Pune CKP Gaurav Sohala is held on the occasion of Gudi Padwa.', href: '/gaurav-sohala/2018' },
  { id: '2018-04', year: 2018, date: 'March-April 2018', category: 'health', title: 'Medical assistance of Rs 25,000', text: 'Medical assistance of Rs 25,000 is given to a needy CKP family for their medical expenses.' },
  { id: '2018-05-14', year: 2018, date: '14 May 2018', category: 'trust', highlight: true, title: 'The trust is formed', text: 'Pune CKP Family Public Trust is formed, and the Pune CKP Family group merges into the trust.' },
  { id: '2018-07', year: 2018, date: 'July 2018', category: 'health', highlight: true, title: 'Service to the Warkaris', text: 'The trust begins its association with Sahyadri Manav Seva Manch, an organisation that conducts charitable medical camps to serve the pilgrims of the Pandharpur Wari in the months of Ashadh and Kartik.', href: '/events/pandharpur-wari-medical-camps' },
  { id: '2019-01-26', year: 2019, date: '26 January 2019', category: 'honour', highlight: true, title: 'Second Gaurav Sohala', text: 'The second Pune CKP Gaurav Sohala is held on Republic Day.', href: '/gaurav-sohala/2019' },
  { id: '2019-03-26', year: 2019, date: '26 March 2019', category: 'health', title: 'Medical camps in tribal areas', text: 'The trust sponsors medical camps in tribal areas near Lonavla under the umbrella of Sahyadri Manav Seva Manch. Since then it has contributed to the Manch’s service not only with volunteers but by raising funds to the tune of Rs 3.61 lakh.', href: '/events/tribal-medical-camps-lonavla' },
  { id: '2019-08', year: 2019, date: 'August 2019', category: 'relief', title: 'Notebooks for flood-hit schools', text: 'The trust assists ABCKPMS with 50 dozen notebooks during its drive to help flood-affected schools around Kolhapur.', href: '/events/kolhapur-flood-notebooks' },
  { id: '2019-11', year: 2019, date: 'November 2019', category: 'community', title: 'Diwali evening at Aai', text: 'A Diwali evening is spent with the residents of "Aai", an old-age home.' },
  { id: '2019-12', year: 2019, date: 'December 2019', category: 'sports', title: 'CKP Badminton Tournament', text: 'To promote "good health through sports", the trust is the main sponsor of the CKP Badminton Tournament Pune 2019.', href: '/events/ckp-badminton-tournament-2019' },
  { id: '2020-01', year: 2020, date: 'January 2020', category: 'culture', title: 'Kavya Spardha', text: 'A Kavya Spardha (poetry competition) is organised for the CKP community.' },
  { id: '2020-04-01', year: 2020, date: '1 April 2020', category: 'trust', title: 'Membership opened wider', text: 'To invite more participation from CKP brethren in Pune and beyond its limits, the trust takes the name Pune CKP Public Trust and opens its membership to everyone, starting from 1 April 2020.' },
  { id: '2020-05', year: 2020, date: 'May 2020', category: 'honour', title: 'A Sohala without a stage', text: 'CKP Mohotsav and the Gaurav Sohala 2020 are cancelled because of the pandemic. The trust makes it a point to felicitate the winners by visiting their homes in November and December 2020, when the pandemic is less threatening.', href: '/gaurav-sohala/2020' },
  { id: '2020-06', year: 2020, date: 'June 2020', category: 'relief', highlight: true, title: 'Safety kits for Pune police', text: 'At the height of the Covid pandemic the trust helps Pune police with safety kits of face masks, rubber hand-gloves and sanitisers.', href: '/events/covid-19-relief' },
  { id: '2020-07', year: 2020, date: 'July 2020', category: 'relief', title: 'Rations for 100 families', text: 'Monthly rations are donated to 100 needy families, and food rations to old-age homes, in the difficult first wave of the pandemic in Maharashtra. The trust also donates to a goshala. In all, Rs 1.85 lakh is spent during the first wave in Pune.', href: '/events/covid-19-relief' },
  { id: '2020-09', year: 2020, date: 'September 2020', category: 'culture', title: 'Rangoli competition', text: 'A Rangoli competition is organised for community families, to relax in the pandemic period.' },
  { id: '2021-01-14', year: 2021, date: '14 January 2021', category: 'education', title: 'Computers for rural schools', text: 'Computers and a laptop are donated to needy schools in rural areas, to help them conduct online classes during the pandemic.', href: '/events/computers-for-rural-schools' },
  { id: '2021-02-14', year: 2021, date: '14 February 2021', category: 'sports', title: 'Carrom and Corona warriors', text: 'On Valentine’s Day the trust arranges a Carrom competition for the community’s sports enthusiasts and a felicitation programme for Corona warriors.', href: '/events/carrom-competition-2021' },
  { id: '2021-03-15', year: 2021, date: '15 March 2021', category: 'education', highlight: true, title: 'Dnyan Kiran and Project Diya', text: 'Project Dnyan Kiran, the Students Assistance Fund, and Project Diya, the donation of old bicycles to needy and poor students, are introduced under the trust’s Vision 2021-22.', href: '/projects' },
  { id: '2021-04-14', year: 2021, date: '14 April 2021', category: 'trust', title: 'New working committee', text: 'A new working committee is formed to conduct the trust’s activities under Vision 2021-22.' },
  { id: '2021-07', year: 2021, date: 'July 2021', category: 'relief', title: 'Help for flood-hit Mahad', text: 'With the help of the community, the trust arranges a donation of more than Rs 1 lakh for the flood-affected people of Mahad.', href: '/projects/mahad-ram-mandir' },
  { id: '2021-08-04', year: 2021, date: 'August 2021', category: 'relief', highlight: true, title: 'Rs 51,000 for the Prabhu Ram Mandir', text: 'The trust donates Rs 51,000 for the historic Prabhu Ram Mandir at Mahad, which belongs to the CKP community and was badly damaged in the floods.', href: '/projects/mahad-ram-mandir' },
  { id: '2021-09-05a', year: 2021, date: '5 September 2021', category: 'trust', title: 'Trust website launched', text: 'The trust’s website is launched on the occasion of Shikshak Din (Teachers’ Day).' },
  { id: '2021-09-05b', year: 2021, date: '5 September 2021', category: 'honour', title: 'Adarsh Shikshak Puraskar 2021', text: 'Six group members who have given their life’s work to the field of education are felicitated with the "Adarsh Shikshak Puraskar 2021".', href: '/events/shikshak-din-2021' },
];

/** After the old timeline ends: Gaurav Sohala pages and galleries of the old site. */
export const LATER_MILESTONES = [
  { id: '2021-12-26', year: 2021, date: '26 December 2021', category: 'honour', title: 'Gaurav Sohala 2021', text: 'A Sahastra Chandra Darshan Puja at Sakharam Hari Gupte CKP Hall, attended by about 300 people.', href: '/gaurav-sohala/2021' },
  { id: '2022-05-13', year: 2022, date: '13 May 2022', category: 'honour', highlight: true, title: 'Fourth Foundation Day and Gaurav Sohala 2022', text: 'The Gaurav Sohala is held on Pune CKP Family Foundation Day at Yashwantrao Chavan Natya Mandir, before about 500 people.', href: '/gaurav-sohala/2022' },
  { id: '2022-sahitya', year: 2022, date: '2022', category: 'culture', title: 'Second CKP Sahitya Sammelan', text: 'The Second CKP Sahitya Sammelan is held in Pune, with a Kavyakatta poetry session and a Sahitya Dindi and book publication.', href: '/events/second-ckp-sahitya-sammelan-2022' },
  { id: '2022-diwali', year: 2022, date: 'October 2022', category: 'culture', title: 'Diwali D’Light', text: 'A cultural entertainment programme and a CKP food competition.', href: '/events/diwali-delight-2022' },
  { id: '2023-05-14', year: 2023, date: '14 May 2023', category: 'honour', title: 'Gaurav Sohala 2023', text: 'The Yuva Gaurav Puraskar ceremony at Yashwantrao Chavan Natya Mandir, before about 350 people.', href: '/gaurav-sohala/2023' },
  { id: '2023-wari', year: 2023, date: '2023', category: 'health', title: 'Medical Wari at Zendewadi', text: 'A medical camp for Warkari pilgrims at Zendewadi on the Saswad Road, Pune.', href: '/events/medical-wari-zendewadi-2023' },
  { id: '2023-09-08', year: 2023, date: '8 September 2023', category: 'education', highlight: true, title: 'Teachers’ Day at the Ruia school', text: 'Teachers’ Day is celebrated at V. R. Ruia Mook Badhir Vidyalaya, the school for deaf-mute children in Sadashiv Peth, Pune.', href: '/events/teachers-day-ruia-school-2023' },
  { id: '2023-11-11', year: 2023, date: '11 November 2023', category: 'culture', title: 'Diwali Delight, year 2', text: 'An evening of music and fun at Nivara Vrudhashram, Navi Peth, with Sinhagad Jyeshtha Nagrik Sangh.', href: '/events/diwali-delight-2023' },
  { id: '2024-05-05', year: 2024, date: '5 May 2024', category: 'honour', title: 'Gaurav Sohala 2024', text: 'Themed "Medical Profession", at the Zapurza Museum of Art and Culture, before about 250 people.', href: '/gaurav-sohala/2024' },
  { id: '2025-05-17', year: 2025, date: '17 May 2025', category: 'honour', highlight: true, title: 'Gaurav Sohala 2025', text: 'At Shakuntala Shetty Sabhagruha, Karnataka School, before about 250 people.', href: '/gaurav-sohala/2025' },
];

export const ALL_MILESTONES = [...ROADMAP, ...LATER_MILESTONES];

export const MILESTONE_YEARS = [...new Set(ALL_MILESTONES.map((m) => m.year))];

export const MILESTONE_HIGHLIGHTS = ALL_MILESTONES.filter((m) => m.highlight);

export const CATEGORY_LABELS = {
  community: 'Community',
  trust: 'The trust',
  education: 'Education',
  health: 'Health',
  relief: 'Relief',
  culture: 'Culture',
  sports: 'Sports',
  honour: 'Gaurav Sohala',
};

/**
 * "A Journey": the trust's own account (old site, /historical-events/, English
 * version), lightly tightened. Paragraph order is the original's.
 */
export const JOURNEY = [
  'A group is formed with the idea of "giving it back to the society". Later, with this commitment, the trust was established. From this came the concept of finding the gems in the CKP community and glorifying their meritorious work: personalities who have gone beyond the boundaries of caste and worked for the welfare of society and the country.',
  'The trust evolved from a small WhatsApp group called "Pune CKP Family", started on 11 January 2016. The group decided to honour one of its respected members, Shri Sudhir Vaidya, with the "Shiromani" award. This Gaurav Sohala was held on 18 March 2018, on the auspicious occasion of Gudi Padwa. Along with Shri Sudhir Vaidya, ten other people with significant achievements in the arts, social work and industry were honoured that day.',
  'At the same function, Rs 25,000 was given to a needy CKP family as a social commitment. And 65 kg of school notebooks, equal to the weight of Shri Sudhir Vaidya, were donated to Nutan Samarth Vidyalaya, a school run for children in the red-light area of Pune. Over 400 CKP people showed their solidarity at this festival.',
  'Overcoming many obstacles along the way, the trust was established on 14 May 2018, in the spirit of "take the next step forward". On 21 May 2018, just one week later, a CKP person in Virar suffering from a heart attack was assisted with Rs 11,000.',
  'In July 2018, members of the trust volunteered with Sahyadri Manav Seva Manch, which organises medical camps for the Warkaris of Pandharpur. Having seen this selfless service, the trust has, apart from volunteering, donated a total of Rs 3.61 lakh to the Manch.',
  'The second Gaurav Sohala was held on 26 January 2019 at Tilak Smarak in a spirit of patriotism. Before an audience of about 700, war heroes who fought for the country, and the wives of such heroes, were felicitated, and the work of a few renowned social workers was praised. Donations to charitable institutions were presented at the same programme.',
  'In association with ABCKPMS, the trust distributed 50 dozen notebooks to flood-affected students in Sangli and Kolhapur in August 2019. One Diwali evening of 2019 was spent at the "Aai" old-age home at Dhayari, exchanging joys with its residents.',
  'In May 2019 a member of the group was given Rs 25,000 as an interest-free loan for emergency medical assistance, which was returned on time in the agreed instalments. Nothing is repaid for the first two months; after that the loan is repaid over the next ten months at 10% a month.',
  'The Gaurav Sohala of 2020 was to be held on 28 March 2020, and had to be cancelled because of the Corona pandemic. But on 14 May 2020, without any ceremony and with every precaution in place, the trust donated Rs 1.5 lakh each to Thane-based Sahyadri Manav Seva Manch, Pune-based Seva Sahayog Foundation, which helps needy and deserving students, and Mumbai-based Advitya Kala Sangam Trust, which helps specially challenged adults. It also gave 200-page notebooks to Swami Vivekananda Jeevanjyot Sanstha, Pune.',
  'During the lockdown, sets of sanitiser, face masks and gloves were distributed to police at outposts across Pune city and to police patrolling the streets, and 100 needy families were helped with groceries for the month. "Aai" and "Nivara" old-age homes in Pune and SAMPARC, Lonavla, were given food and edible oil, and Rs 10,000 in cash went to the cowshed run by Vaze Guruji.',
  'Such is the trust: a special organisation of the CKP community, working for the community and celebrating every festival with joy.',
];
