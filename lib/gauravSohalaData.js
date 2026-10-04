/**
 * CKP Gaurav Sohala — the trust's annual felicitation ceremony.
 *
 * SOURCE OF TRUTH: this data was taken directly from the trust's own pages at
 * puneckptrust.org/pune-ckp-gaurav-sohala-<year>, scraped September 2026. It
 * supersedes the earlier hand-written dataset, which had fewer honourees and
 * in several years mis-assigned the president and chief guest as awardees.
 *
 * Shape notes:
 *  - `chiefGuests` is an array: 2025 had three.
 *  - `honorees[].award` is the specific puraskar, where the source names one.
 *  - `awards` lists award categories for years where the trust published the
 *    categories but not the individual recipients (2025). Don't invent names
 *    to fill those in.
 */
export const GAURAV_SOHALA_EVENTS = [
  {
    year: 2018,
    metaDescription: 'The first CKP Gaurav Sohala, held on Gudhi Padva 2018 at Niwaara Old-Age Home with Padmashri Chandu Borde as chief guest and eleven honourees.',
    date: '18 March 2018',
    location: 'Niwaara Old-Age Home Auditorium, Pune',
    occasion: 'Gudhi Padva',
    theme: 'Cricket and Others',
    attendance: 'Approx. 400',
    president: { name: 'Shri Satish Pradhan', note: 'Former Rajya Sabha member, two terms.' },
    chiefGuests: [
      { name: 'Padmashri Chandu Borde', note: 'Former captain of the Indian cricket team and former national selector.' },
    ],
    honorees: [
      { name: 'Shri Sudhir Vaidya', award: 'Shiromani Gaurav Puraskar', note: 'Renowned cricket statistician and author of 26 books.' },
      { name: 'Shri Ajinkya Phanse', award: 'Yuva Gaurav Puraskar', note: 'Took part in the College of Engineering Pune satellite development programme.' },
      { name: 'Shri Umesh Chawak', award: 'Kala Gaurav Puraskar', note: 'Still photography expert and world record holder.' },
      { name: 'Smt. Vaijayanti Chitnis', award: 'Kala Gaurav Puraskar', note: 'Television announcer and actress.' },
      { name: 'Smt. Pallavi Karnik', award: 'Udyojika Gaurav Puraskar', note: 'Television announcer and actress.' },
      { name: 'Smt. Radnika Pradhan', award: 'Udyojika Gaurav Puraskar', note: 'The first plastic business entrepreneur in the Pune region.' },
      { name: 'Shri Ashok Durve', award: 'Udyojak Gaurav Puraskar', note: 'Precision tools industrialist.' },
      { name: 'Shri Ashok Deshpande', award: 'Samajik Karya Gaurav Puraskar', note: 'Social worker and trust administrator.' },
      { name: 'Smt. Jyotsna Ambegaonkar', award: 'Samajik Karya Gaurav Puraskar', note: 'Founder-president of Sadbhav CKP Mahila Mandal, a role she held for over 20 years.' },
      { name: 'Shri Sanjeev Sule', award: 'Samajik Karya Gaurav Puraskar', note: 'Secretary of CKP Samaj Mawal Taluka and professor-in-charge at TMV Pune.' },
      { name: 'Smt. Shaila Mathure Phanse', award: 'Samajik Karya Gaurav Puraskar', note: 'Social worker for women’s welfare in the Lonavla region; started "Mummy’s Kitchen" to create employment for women.' },
    ],
  },
  {
    year: 2019,
    metaDescription: 'A Republic Day ceremony at Tilak Smarak Mandir honouring three Veer Chakra recipients, two veer patnis and two social reformers before an audience of 700.',
    date: '26 January 2019',
    location: 'Tilak Smarak Mandir, Pune',
    occasion: 'Republic Day',
    theme: 'Shaurya (Valor)',
    attendance: 'Approx. 700',
    president: { name: 'Shri Ajit Parasnis', note: 'Former Police Commissioner, Maharashtra State.' },
    chiefGuests: [
      { name: 'Air Marshal (Retd.) Bhushan Gokhale', note: 'Vayu Sena Medal, Ati Vishisht Seva Medal and Param Vishisht Seva Medal.' },
    ],
    honorees: [
      { name: 'Wing Commander Suresh Karnik', award: 'Gaurav Puraskar', note: 'Indian Air Force. Veer Chakra (1972) for valour in the 1971 Indo-Pak war; Maharashtra Gaurav Puraskar (1990).' },
      { name: 'Group Captain Nitin Junnarkar', award: 'Gaurav Puraskar', note: 'Indian Air Force. Veer Chakra (1972) for valour in the 1971 Indo-Pak war.' },
      { name: 'Group Captain Dilip Dighe', award: 'Gaurav Puraskar', note: 'Indian Air Force. Veer Chakra (1972) for valour in the 1971 Indo-Pak war; Maharashtra Gaurav Puraskar (1989).' },
      { name: 'Smt. Vasudha Deshmukh', award: 'Gaurav Puraskar', note: 'Founded the Rashmipath centre in Bihar for children trapped in addiction, and the Anurag Foundation (2002) for children with Thalassemia.' },
      { name: 'Smt. Vaijayanti Gupte', award: 'Gaurav Puraskar', note: 'Rehabilitation work for marginalised women through the NGO ASHI; active in addressing the difficulties faced by deaf and blind girls.' },
      { name: 'Smt. Shobhana Raje', award: 'Gaurav Puraskar', note: 'Veer Patni of Group Captain Bipin Raje.' },
      { name: 'Smt. Asha Patankar', award: 'Gaurav Puraskar', note: 'Veer Patni of Flight Lieutenant Milind Patankar.' },
    ],
  },
  {
    year: 2020,
    metaDescription: 'The 2020 Intelligence-themed ceremony was cancelled for COVID-19. See the honourees chosen, including Padmabhushan Dr. Shashikumar Chitre’s Shiromani award.',
    date: '28 March 2020 (planned)',
    location: 'Kalmadi High School Auditorium, Pune',
    occasion: null,
    theme: 'Buddhimatta (Intelligence)',
    attendance: 'Ceremony cancelled due to the COVID-19 pandemic',
    cancelled: true,
    president: { name: 'Padmashri Kiran Karnik', note: 'Recognised for his contribution to the broadcasting and outsourcing industries.' },
    chiefGuests: [],
    shiromaniAward: {
      name: 'Padmabhushan Dr. Shashikumar Chitre',
      note: 'Mathematician and astronomer. Prof. A.C. Banerjee Memorial Lecture Award (1992), INSA Vainu Bappu Memorial Medal (1995), MP Birla Award (1999) and the Padmabhushan (2012) for services to science.',
    },
    honorees: [
      { name: 'Smt. Aparna Mohile', award: 'Gaurav Puraskar', note: 'Chairperson of the Indian Censor Board (1982-83) and Chief Postmaster General, Maharashtra-Goa (1997-98); played a key role in launching Speed Post.' },
      { name: 'Dr. Rajani Gupte', award: 'Gaurav Puraskar', note: 'Vice Chancellor of Symbiosis International University and a board member of NSDL.' },
      { name: 'Dr. Manoj Pradhan', award: 'Gaurav Puraskar', note: 'Renowned cardiothoracic surgeon, credited with performing several surgeries in Pune for the first time.' },
    ],
  },
  {
    year: 2021,
    metaDescription: 'A Sahastra Chandra Darshan Puja at Sakharam Hari Gupte CKP Hall in December 2021, felicitating senior members and couples of the CKP community.',
    date: '26 December 2021',
    location: 'Sakharam Hari Gupte CKP Hall, Pune',
    occasion: null,
    theme: 'Sahastra Chandra Darshan Puja',
    attendance: 'Approx. 300',
    president: { name: 'Shri Suresh Karnik & Sau. Shaila Karnik' },
    chiefGuests: [],
    honorees: [
      { name: 'Shri Vijay Kotwal & Sau. Maanik Kotwal' },
      { name: 'Shri Sudhir Vaidya & Sau. Hemalata Vaidya' },
      { name: 'Shri Divakar Chitnis & Sau. Pramodini Chitnis' },
      { name: 'Shri Bhalchandra Pradhan & Sau. Urmila Pradhan' },
      { name: 'Dr. Sudhir Dongre' },
      { name: 'Shri Shrikant Gupte' },
      { name: 'Shrimati Aasawari Mokashi' },
      { name: 'Shrimati Pramila Anant Chitre' },
      { name: 'Shrimati Sangita Gupte' },
      { name: 'Shrimati Laxmi Gupte' },
      { name: 'Shri Madhav Dighe' },
      { name: 'Shri Chandrakant Kulkarni' },
      { name: 'Shri Raghunath Damodar Sule' },
      { name: 'Shri Suresh Vaidya' },
    ],
  },
  {
    // The 2022 source page groups president, chief guest and awardees under a
    // single Marathi caption, so roles are not split out here. Don't guess.
    year: 2022,
    metaDescription: 'The 2022 Gaurav Sohala, held on Pune CKP Family Foundation Day at Yashwantrao Chavan Natya Mandir, honouring five achievers before an audience of 500.',
    date: '13 May 2022',
    location: 'Yashwantrao Chavan Natya Mandir, Pune',
    occasion: 'Pune CKP Family Foundation Day',
    theme: 'Foundation Day Gaurav Puraskar',
    attendance: 'Approx. 500',
    president: null,
    chiefGuests: [],
    honorees: [
      { name: 'Shri Sandip Karnik', note: 'Assistant Commissioner of Police, Pune.' },
      { name: 'Shri Prithviraj S. Sutar', note: 'Corporator.' },
      { name: 'Shri Anant Deshmukh' },
      { name: 'Shri Rohan Pradhan' },
      { name: 'Adv. Shri Aniruddh Garge' },
    ],
  },
  {
    year: 2023,
    metaDescription: 'The Yuva Gaurav Puraskar at Yashwantrao Chavan Natya Mandir in May 2023, celebrating three young achievers of the CKP community before 350 guests.',
    date: '14 May 2023',
    location: 'Yashwantrao Chavan Natya Mandir, Pune',
    occasion: null,
    theme: 'Yuva Gaurav Puraskar',
    attendance: 'Approx. 350',
    president: { name: 'Barrister Rohan Deshpande' },
    chiefGuests: [{ name: 'Dr. Pranjali Dighe' }],
    honorees: [
      { name: 'Arnav Fadanvis', award: 'Yuva Gaurav Puraskar' },
      { name: 'Prachi Vaidya', award: 'Yuva Gaurav Puraskar' },
      { name: 'Nishad Gadkari', award: 'Yuva Gaurav Puraskar' },
    ],
  },
  {
    year: 2024,
    metaDescription: 'Senior CKP doctors honoured at the Zapurza Museum of Art and Culture in May 2024, with neurosurgeon Dr. Shyamkant Dighe presiding over the ceremony.',
    date: '5 May 2024',
    location: 'Zapurza Museum of Art and Culture, Pune',
    occasion: null,
    theme: 'Medical Profession',
    attendance: 'Approx. 250',
    president: { name: 'Dr. Shyamkant Dighe', note: 'Senior Neurosurgeon, KEM Hospital, Pune.' },
    chiefGuests: [
      { name: 'Dr. Mohan Gupte', note: 'Director (Retd.), Indian Council of Medical Research.' },
    ],
    honorees: [
      { name: 'Dr. Nitin Gupte', note: 'Senior Gynecologist.' },
      { name: 'Dr. Lata Raje', note: 'Senior Anesthesiologist.' },
      { name: 'Dr. Chetan Pradhan', note: 'Senior Orthopaedic Surgeon.' },
      { name: 'Dr. Aparna Nifadkar-Joshi', note: 'Senior Histopathologist.' },
      { name: 'Dr. Suvarna Gupte', note: 'Senior Pediatrician.' },
      { name: 'Dr. Nitin Patki', note: 'Senior Cardiologist Surgeon.' },
      { name: 'Dr. Raunak Pradhan', note: 'Cosmetic Dentist.' },
    ],
  },
  {
    year: 2025,
    metaDescription: 'The 2025 Gaurav Sohala at Shakuntala Shetty Sabhagruha, presided over by Dr Milind Gadakari, presenting three awards to the CKP medical community.',
    date: '17 May 2025',
    location: 'Shakuntala Shetty Sabhagruha, Karnataka School, Pune',
    occasion: null,
    theme: 'Medical Profession',
    attendance: 'Approx. 250',
    president: { name: 'Dr. Milind Gadakari' },
    chiefGuests: [
      { name: 'Dr. Mugdha Karnik Parasnis' },
      { name: 'Dr. Mugdha Pradhan' },
      { name: 'Dr. Prashant Karnik' },
    ],
    // The trust published the award categories for 2025 but not the individual
    // recipients. Leave honorees empty rather than inventing names.
    awards: [
      'Pune CKP Gaurav Puraskar',
      'Jeevan Gaurav Puraskar',
      'Late Satishchandra Pradhan Yuva Gaurav Puraskar',
    ],
    honorees: [],
  },
];

export function getGauravSohalaByYear(year) {
  return GAURAV_SOHALA_EVENTS.find((e) => String(e.year) === String(year));
}

export const GAURAV_SOHALA_YEARS = GAURAV_SOHALA_EVENTS.map((e) => e.year).sort((a, b) => b - a);
