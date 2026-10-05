/**
 * Pune CKP Gaurav Sohala: the trust's annual felicitation ceremony.
 *
 * SOURCE: the old site's pages /pune-ckp-gaurav-sohala-<year>/ and the 27
 * individual profile pages, as scraped into docs/old-site-scrape/pages/
 * (October 2026). Wording is tightened, facts are not added.
 *
 * Roles. For 2018, 2019 and 2020 the old site labels the president (अध्यक्ष),
 * the chief guest (प्रमुख पाहुणे) and each award, so those are recorded here.
 * From 2021 onward it prints everyone under one heading, "अध्यक्ष, प्रमुख
 * पाहुणे आणि पुरस्काराचे मानकरी" (president, chief guest and awardees),
 * without saying who is which. Those years therefore have `rolesUnstated:
 * true`, no president and no chief guest: every name is listed in `honorees`
 * in the order the old site shows them. Do not assign roles by guesswork.
 *
 * `photo` is a key into lib/data/siteImages.json ("people" group);
 * `image` on an event is a key in the "sohala" group.
 */
export const GAURAV_SOHALA_EVENTS = [
  {
    year: 2018,
    headline: 'Cricket and Others',
    metaDescription: 'The first Pune CKP Gaurav Sohala, held on Gudhi Padva 2018 at Niwaara Old-Age Home with Padmashri Chandu Borde as chief guest and eleven awardees.',
    date: '18 March 2018',
    isoDate: '2018-03-18',
    location: 'Niwaara Old-Age Home Auditorium, Pune',
    occasion: 'Gudhi Padva',
    theme: 'Cricket and Others',
    themeMr: 'क्रिकेट आणि इतर',
    attendance: 'Approx. 400',
    image: 'poster-2018',
    albumSlug: 'ckp-sanmaan-sohala',
    videoId: 'LWCD-eVfe64',
    summary: [
      'The first Gaurav Sohala was held on the auspicious day of Gudhi Padva. The group had decided to honour one of its respected members, Shri Sudhir Vaidya, with the "Shiromani" award; along with him, ten other people with significant achievements in the arts, social work and industry were honoured that day.',
      'At the same function Rs 25,000 was given to a needy CKP family, and 65 kg of school notebooks, equal to the weight of Shri Sudhir Vaidya, were donated to Nutan Samarth Vidyalaya, a school run for children in the red-light area of Pune. Over 400 CKP people attended.',
    ],
    president: { name: 'Shri Satish Pradhan', nameMr: 'मा. श्री सतीश प्रधान', photo: 'satish-pradhan', note: 'Former Member of Parliament (Rajya Sabha) for two tenures.' },
    chiefGuests: [
      { name: 'Padmashri Chandu Borde', nameMr: 'पद्मश्री मा. श्री चंदू बोर्डे', photo: 'chandu-borde', note: 'Former captain of the Indian cricket team, and member and chairman of the selection committee of the Indian cricket team.' },
    ],
    honorees: [
      { name: 'Shri Sudhir Vaidya', nameMr: 'मा. श्री सुधीर वैद्य', photo: 'sudhir-vaidya', award: 'Pune CKP Shiromani Gaurav Puraskar 2018', note: 'Honoured cricket statistician. Has published 26 books on cricket.' },
      { name: 'Chi. Ajinkya Phanse', nameMr: 'चि. अजिंक्य फणसे', photo: 'ajinkya-phanse', award: 'Pune CKP Yuva Gaurav Puraskar 2018', note: 'Took part in creating "Swayam", the satellite of the College of Engineering, Pune, which was launched by ISRO in 2016.' },
      { name: 'Shri Umesh Chawak', nameMr: 'श्री उमेश चावक', photo: 'umesh-chawak', award: 'Pune CKP Kala Gaurav Puraskar 2018', note: 'Known for still photography for TV serials and films. On 16 January 2016 he took 26,655 photographs of 150 models in 10 hours, which has been recorded as a world record.' },
      { name: 'Smt. Vaijayanti Chitnis', nameMr: 'श्रीमती वैजयंती चिटणीस', photo: 'vaijayanti-chitnis', award: 'Pune CKP Kala Gaurav Puraskar 2018', note: 'Started as a TV announcer and later gained fame through many plays and serials.' },
      { name: 'Sau. Pallavi Karnik', nameMr: 'सौ पल्लवी कर्णिक', photo: 'pallavi-karnik', award: 'Pune CKP Udyojika Gaurav Puraskar 2018', note: 'Introduces new concepts in the field of education, and trains teachers and prepares them for the change.' },
      { name: 'Sau. Radnika Pradhan', nameMr: 'सौ रदनिका प्रधान', photo: 'radnika-pradhan', award: 'Pune CKP Udyojika Gaurav Puraskar 2018', note: 'The first woman entrepreneur to enter the plastics business in the Pune area, producing the plastic wrap that industry needs.' },
      { name: 'Shri Ashok Durve', nameMr: 'श्री अशोक दुर्वे', photo: 'ashok-durve', award: 'Pune CKP Udyojak Gaurav Puraskar 2018', note: 'A leading industrialist, in India and abroad, in the field of precision tools.' },
      { name: 'Shri Ashok Deshpande', nameMr: 'श्री अशोक देशपांडे', photo: 'ashok-deshpande', award: 'Pune CKP Samajik Karya Gaurav Puraskar 2018', note: 'Always takes the initiative in social work. Office-bearer of the Shrimant S. H. Gupte CKP Trust and member of ABCKPMS.' },
      { name: 'Smt. Jyotsna Ambegaonkar', nameMr: 'श्रीमती ज्योत्स्ना आंबेगावकर', photo: 'jyotsna-ambegaonkar', award: 'Pune CKP Samajik Karya Gaurav Puraskar 2018', note: 'Founder-president of Sadbhav CKP Mahila Mandal, a post she held for over 20 years.' },
      { name: 'Shri Sanjeev Sule', nameMr: 'श्री संजीव सुळे', photo: 'sanjeev-sule', award: 'Pune CKP Samajik Karya Gaurav Puraskar 2018', note: 'Secretary of CKP Samaj Maval Taluka and professor in charge at TMV, Pune. Helps people in distress through personality development and counselling.' },
      // Surname as in the old site's own English (URL and caption: "Phase"); its Marathi is फासे and one image file says "Phanse".
      { name: 'Smt. Shaila Mathure Phase', nameMr: 'श्रीमती शैला मथुरे फासे', photo: 'shaila-mathure', award: 'Pune CKP Samajik Karya Gaurav Puraskar 2018', note: 'Recognised the problems of victimised women in the Lonavla area and worked out systematic solutions, and encouraged their children into education. Started the "Mummy’s Kitchen" eatery in Lonavla, giving many women a chance of employment.' },
    ],
  },
  {
    year: 2019,
    headline: 'Shaurya (Valour)',
    metaDescription: 'The second Pune CKP Gaurav Sohala: a Republic Day ceremony at Tilak Smarak Mandir honouring three Vir Chakra recipients, two veer patnis and two social workers.',
    date: '26 January 2019',
    isoDate: '2019-01-26',
    location: 'Tilak Smarak Mandir, Pune',
    occasion: 'Republic Day',
    theme: 'Shaurya (Valour)',
    themeMr: 'शौर्य',
    attendance: 'Approx. 700',
    image: 'poster-2019',
    albumSlug: 'ckp-sanmaan-sohala',
    videoId: 'DRTbw5mCX78',
    summary: [
      'The second Gaurav Sohala was held in a spirit of patriotism. Before an audience of about 700, war heroes who fought for the country, and the wives of such heroes, were felicitated, and the work of a few renowned social workers was honoured.',
      'Donations to charitable institutions were presented at the same programme, among them Queen Mary’s Technical Institute for disabled soldiers and the Anandwan water-conservation work.',
    ],
    president: { name: 'Shri Ajit Parasnis', nameMr: 'मा. श्री अजित पारसनीस', photo: 'ajit-parasnis', note: 'Former Director General of Police, State of Maharashtra. Indian Police Medal (1992), Director General of Police’s insignia (1994) and President’s Medal (2006).' },
    chiefGuests: [
      { name: 'Air Marshal (Retd.) Bhushan Gokhale', nameMr: 'एअर मार्शल (निवृत्त) भूषण गोखले', photo: 'bhushan-gokhale', note: 'Vayu Sena Medal, Ati Vishisht Seva Medal and Param Vishisht Seva Medal.' },
    ],
    honorees: [
      { name: 'Wing Commander Suresh Karnik', nameMr: 'विंग कमांडर सुरेश कर्णिक', photo: 'suresh-karnik', award: 'Pune CKP Gaurav Puraskar 2019', note: 'Indian Air Force. Vir Chakra 1972, for bravery in the 1971 Indo-Pak war; Maharashtra Gaurav Award 1990.' },
      { name: 'Group Captain Nitin Junnarkar', nameMr: 'ग्रुप कॅप्टन नितीन जुन्नरकर', photo: 'nitin-junnarkar', award: 'Pune CKP Gaurav Puraskar 2019', note: 'Indian Air Force. Vir Chakra 1972, for bravery in the 1971 Indo-Pak war.' },
      { name: 'Group Captain Dilip Dighe', nameMr: 'ग्रुप कॅप्टन दिलीप दिघे', photo: 'dilip-dighe', award: 'Pune CKP Gaurav Puraskar 2019', note: 'Indian Air Force. Vir Chakra 1972, for bravery in the 1971 Indo-Pak war; Maharashtra Gaurav Award 1989.' },
      { name: 'Sau. Vasudha Deshmukh', nameMr: 'सौ. वसुधा देशमुख', photo: 'vasudha-deshmukh', award: 'Pune CKP Gaurav Puraskar 2019', note: 'Started the "Rashmipath" (रष्मीपथ) centre to free children from drug addiction in Bihar. Founded the Anurag Foundation in 2002 to help children with thalassemia.' },
      { name: 'Sau. Vaijayanti Gupte', nameMr: 'सौ. वैजयंती गुप्ते', photo: 'vaijayanti-gupte', award: 'Pune CKP Gaurav Puraskar 2019', note: 'Works on the rehabilitation of victimised and exploited women with the help of the NGO ASHI, and is active in solving the problems of deaf-mute girls. Through "Yauvana" (यौवना), an organisation she founded, she teaches menstrual hygiene to school-going girls aged 11 to 15 in rural areas and distributes free sanitary napkins.' },
      { name: 'Smt. Shobhana Raje', nameMr: 'श्रीमती शोभना राजे', photo: 'shobhana-raje', award: 'Pune CKP Gaurav Puraskar 2019', note: 'Veer Patni of Group Captain Bipin Raje.' },
      { name: 'Smt. Asha Patankar', nameMr: 'श्रीमती आशा पाटणकर', photo: 'asha-patankar', award: 'Pune CKP Gaurav Puraskar 2019', note: 'Veer Patni of Flight Lieutenant Milind Patankar.' },
    ],
  },
  {
    year: 2020,
    headline: 'Buddhimatta (Intelligence)',
    metaDescription: 'The 2020 Gaurav Sohala, themed Intelligence, was cancelled in the pandemic. Its awardees, including Padmabhushan Dr Shashikumar Chitre, were felicitated at home.',
    date: '28 March 2020 (planned)',
    isoDate: '2020-03-28',
    location: 'Kalmadi High School Auditorium, Pune',
    occasion: null,
    theme: 'Buddhimatta (Intelligence)',
    themeMr: 'बुद्धिमत्ता',
    attendance: 'Cancelled due to the Corona pandemic',
    cancelled: true,
    image: 'poster-2020',
    albumSlug: 'gaurav-sohala-2020',
    summary: [
      'The 2020 ceremony was planned for 28 March 2020 and had to be cancelled because of the Corona pandemic. The trust made it a point to felicitate the awardees by visiting their homes in November and December 2020, when the pandemic was less threatening.',
    ],
    president: { name: 'Padmashri Kiran Karnik', nameMr: 'मा. "पद्मश्री" किरण कर्णिक', photo: 'kiran-karnik', note: 'Known mainly for his work in the broadcasting and outsourcing industries. Frank J. Malina Astronautics Medal for space education from the International Astronautical Federation (1998), Forbes magazine’s Face of the Year 2003, and the Government of India’s Padma Shri in 2007.' },
    chiefGuests: [],
    shiromaniAward: {
      name: 'Padmabhushan Dr. Shashikumar Chitre',
      nameMr: '"पद्मभूषण" डॉ शशिकुमार चित्रे',
      photo: 'shashikumar-chitre',
      award: 'Pune CKP Shiromani Puraskar 2020',
      note: 'Mathematician and astrophysicist. Professor A. C. Banerjee Memorial Lecture Award (1992), INSA Vainu Bappu Memorial Medal (1995) and M. P. Birla Award (1999). Honoured by the Government of India with the Padma Bhushan in 2012 for his services to science.',
    },
    honorees: [
      { name: 'Smt. Aparna Mohile', nameMr: 'श्रीमती अपर्णा मोहिले', photo: 'aparna-mohile', award: 'Pune CKP Gaurav Puraskar 2020', note: 'Chairperson of the Censor Board of India in 1982-83. Chief Post Master General of Maharashtra-Goa during 1997-98. Played an important part in launching the popular Speed Post service.' },
      { name: 'Dr. Rajani Gupte', nameMr: 'श्रीमती डॉ रजनी गुप्ते', photo: 'rajani-gupte', award: 'Pune CKP Gaurav Puraskar 2020', note: 'Vice Chancellor of Symbiosis International University, and an honorary member of the board of directors of NSDL. Swayamsiddha Puraskar 2015, Lokmat National Leadership Award 2015, Think Pure Award 2016 and The Iconic Leader Award 2017.' },
      { name: 'Dr. Manoj Pradhan', nameMr: 'डॉ. मनोज प्रधान', photo: 'manoj-pradhan', award: 'Pune CKP Gaurav Puraskar 2020', note: 'Renowned doctor of cardiothoracic surgery, with many operations to his credit that were performed for the first time in Pune: the first multiple total arterial bypass grafting, the first minimally invasive coronary bypass, the first beating-heart surgery using the Octopus, the first beating-heart surgery using the A-Med device, and the first endoscopic radial artery harvesting.' },
    ],
  },
  {
    year: 2021,
    headline: 'Sahastra Chandra Darshan Puja',
    metaDescription: 'Pune CKP Gaurav Sohala 2021: a Sahastra Chandra Darshan Puja at Sakharam Hari Gupte CKP Hall on 26 December 2021, attended by about 300 people.',
    date: '26 December 2021',
    isoDate: '2021-12-26',
    location: 'Sakharam Hari Gupte CKP Hall, Pune',
    occasion: null,
    theme: 'Sahastra Chandra Darshan Puja',
    attendance: 'Approx. 300',
    image: 'trophy-2021',
    rolesUnstated: true,
    president: null,
    chiefGuests: [],
    honorees: [
      { name: 'Shri Suresh Karnik', photo: '2021-suresh-karnik' },
      { name: 'Sau. Shaila Karnik', photo: '2021-shaila-karnik' },
      { name: 'Shri Vijay Kotwal', photo: '2021-vijay-kotwal' },
      { name: 'Sau. Maanik Kotwal', photo: '2021-maanik-kotwal' },
      { name: 'Shri Sudhir Vaidya', photo: '2021-sudhir-vaidya' },
      { name: 'Sau. Hemalata Vaidya', photo: '2021-hemalata-vaidya' },
      { name: 'Shri Divakar Chitnis', photo: '2021-divakar-chitnis' },
      { name: 'Sau. Pramodini Chitnis', photo: '2021-pramodini-chitnis' },
      { name: 'Shri Bhalchandra Pradhan', photo: '2021-bhalchandra-pradhan' },
      { name: 'Sau. Urmila Pradhan', photo: '2021-urmila-pradhan' },
      { name: 'Dr. Sudhir Dongre', photo: '2021-sudhir-dongre' },
      { name: 'Shri Shrikant Gupte', photo: '2021-shrikant-gupte' },
      { name: 'Shrimati Aasawari Mokashi', photo: '2021-aasawari-mokashi' },
      { name: 'Shrimati Pramila Anant Chitre', photo: '2021-pramila-chitre' },
      { name: 'Shrimati Sangita Gupte', photo: '2021-sangita-gupte' },
      { name: 'Shrimati Laxmi Gupte', photo: '2021-laxmi-gupte' },
      { name: 'Shri Madhav Dighe', photo: '2021-madhav-dighe' },
      { name: 'Shri Chandrakant Kulkarni', photo: '2021-chandrakant-kulkarni' },
      { name: 'Shri Raghunath Damodar Sule', photo: '2021-raghunath-sule' },
      { name: 'Shri Suresh Vaidya', photo: '2021-suresh-vaidya' },
    ],
  },
  {
    // The old page prints no theme for 2022, only the occasion.
    year: 2022,
    headline: 'Pune CKP Family Foundation Day',
    metaDescription: 'Pune CKP Gaurav Sohala 2022, held on Pune CKP Family Foundation Day, 13 May 2022, at Yashwantrao Chavan Natya Mandir before an audience of about 500.',
    date: '13 May 2022',
    isoDate: '2022-05-13',
    location: 'Yashwantrao Chavan Natya Mandir, Pune',
    occasion: 'Pune CKP Family Foundation Day',
    theme: null,
    attendance: 'Approx. 500',
    image: 'trophy-2022',
    albumSlug: 'foundation-day-2022',
    videoId: 'lzkv36Uk0Mc',
    rolesUnstated: true,
    president: null,
    chiefGuests: [],
    honorees: [
      { name: 'Shri Sandip Karnik', photo: '2022-sandip-karnik', note: 'Pune ACP.' },
      { name: 'Shri Prithviraj S. Sutar', photo: '2022-prithviraj-sutar', note: 'Corporator.' },
      { name: 'Shri Anant Deshmukh', photo: '2022-anant-deshmukh' },
      { name: 'Shri Rohan Pradhan', photo: '2022-rohan-pradhan' },
      { name: 'Adv. Shri Aniruddh Garge', photo: '2022-aniruddh-garge' },
    ],
  },
  {
    year: 2023,
    headline: 'Yuva Gaurav Puraskar',
    metaDescription: 'Pune CKP Gaurav Sohala 2023: the Yuva Gaurav Puraskar ceremony at Yashwantrao Chavan Natya Mandir on 14 May 2023, before an audience of about 350.',
    date: '14 May 2023',
    isoDate: '2023-05-14',
    location: 'Yashwantrao Chavan Natya Mandir, Pune',
    occasion: null,
    theme: 'Yuva Gaurav Puraskar',
    attendance: 'Approx. 350',
    image: null,
    rolesUnstated: true,
    president: null,
    chiefGuests: [],
    honorees: [
      { name: 'Barrister Rohan Deshpande', photo: '2023-rohan-deshpande' },
      { name: 'Dr. Pranjali Dighe', photo: '2023-pranjali-dighe' },
      { name: 'Arnav Fadanvis', photo: '2023-arnav-fadanvis' },
      { name: 'Prachi Vaidya', photo: '2023-prachi-vaidya' },
      { name: 'Nishad Gadkari', photo: '2023-nishad-gadkari' },
    ],
  },
  {
    year: 2024,
    headline: 'Medical Profession',
    metaDescription: 'Pune CKP Gaurav Sohala 2024, themed Medical Profession, at the Zapurza Museum of Art and Culture on 5 May 2024, with nine doctors of the CKP community.',
    date: '5 May 2024',
    isoDate: '2024-05-05',
    location: 'Zapurza Museum of Art and Culture, Pune',
    occasion: null,
    theme: 'Medical Profession',
    attendance: 'Approx. 250',
    image: 'trophy-2024',
    rolesUnstated: true,
    president: null,
    chiefGuests: [],
    honorees: [
      { name: 'Dr. Shyamkant Dighe', photo: '2024-shyamkant-dighe', note: 'Senior Neurosurgeon (KEM, Pune).' },
      { name: 'Dr. Mohan Gupte', photo: '2024-mohan-gupte', note: 'Director (Retd.), Indian Council of Medical Research.' },
      { name: 'Dr. Nitin Gupte', photo: '2024-nitin-gupte', note: 'Senior Gynecologist.' },
      { name: 'Dr. Lata Raje', photo: '2024-lata-raje', note: 'Senior Anesthesiologist.' },
      { name: 'Dr. Chetan Pradhan', photo: '2024-chetan-pradhan', note: 'Senior Orthopaedic Surgeon.' },
      { name: 'Dr. Aparna Nifadkar-Joshi', photo: '2024-aparna-nifadkar-joshi', note: 'Senior Histopathologist.' },
      { name: 'Dr. Suvarna Gupte', photo: '2024-suvarna-gupte', note: 'Senior Pediatrician.' },
      { name: 'Dr. Nitin Patki', photo: '2024-nitin-patki', note: 'Senior Cardiologist Surgeon.' },
      { name: 'Dr. Raunak Pradhan', photo: '2024-raunak-pradhan', note: 'Cosmetic Dentist.' },
    ],
  },
  {
    // The old page prints "Theme : Medical Profession" for 2025, identical to
    // 2024, while its three posters name three different awards. The theme is
    // kept as printed; the posters are listed under `awards`.
    year: 2025,
    headline: 'Gaurav, Jeevan Gaurav and Yuva Gaurav Puraskar',
    metaDescription: 'Pune CKP Gaurav Sohala 2025 at Shakuntala Shetty Sabhagruha, Karnataka School, on 17 May 2025: the Gaurav, Jeevan Gaurav and Yuva Gaurav Puraskars.',
    date: '17 May 2025',
    isoDate: '2025-05-17',
    location: 'Shakuntala Shetty Sabhagruha, Karnataka School, Pune',
    occasion: null,
    theme: 'Medical Profession',
    attendance: 'Approx. 250',
    image: 'award-2025-gaurav',
    rolesUnstated: true,
    president: null,
    chiefGuests: [],
    awards: [
      { name: 'Pune CKP Gaurav Puraskar', image: 'award-2025-gaurav' },
      { name: 'Jeevan Gaurav Puraskar', image: 'award-2025-jeevan' },
      { name: 'Late Satishchandra Pradhan Yuva Gaurav Puraskar', image: 'award-2025-yuva' },
    ],
    honorees: [
      { name: 'Dr. Milind Gadakari', photo: '2025-milind-gadakari' },
      { name: 'Dr. Mugdha Karnik Parasnis', photo: '2025-mugdha-karnik-parasnis' },
      { name: 'Dr. Mugdha Pradhan', photo: '2025-mugdha-pradhan' },
      { name: 'Dr. Prashant Karnik', photo: '2025-prashant-karnik' },
    ],
  },
];

export function getGauravSohalaByYear(year) {
  return GAURAV_SOHALA_EVENTS.find((e) => String(e.year) === String(year));
}

export const GAURAV_SOHALA_YEARS = GAURAV_SOHALA_EVENTS.map((e) => e.year).sort((a, b) => b - a);

/** Everyone named on a year's page: president, chief guests, Shiromani awardee and honourees. */
export function peopleOf(event) {
  return [event.president, ...(event.chiefGuests || []), event.shiromaniAward, ...(event.honorees || [])].filter(Boolean);
}

export const GAURAV_SOHALA_PEOPLE_COUNT = GAURAV_SOHALA_EVENTS.reduce((sum, e) => sum + peopleOf(e).length, 0);
