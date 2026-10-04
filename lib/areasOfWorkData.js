export const AREAS_OF_WORK = [
  {
    slug: 'educational',
    title: 'Educational',
    tagline: 'Helping every child in the community reach a good education.',
    metaDescription: 'Scholarships, notebooks, uniforms and coaching for deserving students, plus Dnyankiran aid, Project Diya bicycles and computers for rural schools near Pune.',
    summary: 'Scholarships, notebooks, uniforms and coaching support for deserving and needy students, plus computers donated to rural schools.',
    points: [
      'Run, maintain or assist any educational or other institution for coaching, guidance, counselling or vocational training.',
      'Grant individual scholarships to poor, deserving and needy students for elementary and higher education.',
      'Give financial or in-kind assistance — books, notebooks, clothes, uniforms — to needy and poor children.',
      'Assist with the financial expenses of poor and needy students.',
    ],
    initiatives: [
      { name: 'Dnyankiran — Vidyarthi Sahayya Yojana', note: 'Financial support scheme for needy and deserving students, including the "Adopt a Needy and Poor Child" program (₹3,000 / ₹5,000 / ₹10,000 per year per student, covering books, bag, uniform and meals).' },
      { name: 'Project Diya', note: 'Donated and repaired bicycles so rural students can travel to school (₹5,000 to donate a bicycle, ₹1,500 to repair one).' },
      { name: 'Computer donations', note: '15+ computers and a laptop donated to tribal-area and rural schools around Pune.' },
    ],
  },
  {
    slug: 'medical',
    title: 'Medical',
    tagline: 'Standing with members and the community through medical distress.',
    metaDescription: 'Interest-free loans of up to ₹25,000 for members facing medical costs, the Niramay Arogya Yojana, and free health camps for Pandharpur Warkari pilgrims.',
    summary: 'Interest-free loans up to ₹25,000 for members facing medical costs, and health-awareness camps for the wider community.',
    points: [
      'Give interest-free loans up to ₹25,000 to needy members for meeting the cost of medical treatment.',
      'Provide assistance within the CKP community in case of medical distress.',
      'Create awareness among the poor and indigent about illness, and provide medical assistance.',
    ],
    initiatives: [
      { name: 'Niramay Arogya Yojana', note: 'Provides medical assistance and healthcare support to needy families.' },
      { name: 'Sahyadri Manav Seva Manch partnership', note: 'Volunteers and funding (₹3.61 lakh+ to date) supporting free medical camps for Pandharpur Warkari pilgrims for 37+ years running.' },
    ],
  },
  {
    slug: 'environmental',
    title: 'Environmental',
    tagline: 'Save the environment, save lives, save the country.',
    metaDescription: 'Tree-plantation drives, the Anandvan Bhujal Yojana water-conservation project and awareness programmes that help the CKP community protect its environment.',
    summary: 'Tree plantation and conservation drives, and awareness programs for a sustainable future.',
    points: [
      'Create environmental awareness amongst the community.',
      'Undertake and organise tree-plantation drives in various areas.',
      'Undertake activity supplemental to environmental objectives, at the Board of Trustees’ discretion.',
    ],
    initiatives: [
      { name: 'Anandvan Bhujal Yojana', note: 'Supported water-conservation projects with ₹50,000 in funding.' },
    ],
  },
  {
    slug: 'social',
    title: 'Social',
    tagline: 'Samaj Hitaya Sarvajan Sukhaya — for the welfare of all.',
    metaDescription: 'Mahad and Sangli flood relief, support for Aai and Nivara old-age homes, COVID-19 aid for 100 families, and Blossoming Buds sanitary access for rural girls.',
    summary: 'Aid to old-age homes, flood relief, and support for economically weaker families and armed-forces welfare units.',
    points: [
      'Promote welfare, social, cultural, charitable, health, education, humanitarian and relief activities — irrespective of caste, creed, race, colour, sex or religion.',
      'Conduct programs that promote peace and harmony among communities.',
      'Award Gaurav Puraskars to people who have made a mark in social work, religion, arts, academics and sport.',
      'Work for noble humanity, world peace, eternal values and a sustainable life.',
    ],
    initiatives: [
      { name: 'Disaster relief', note: 'Mahad flood relief (2021), Sangli/Kolhapur flood relief for students (2019), COVID-19 grocery support for 100 families and PPE for Pune police (2020).' },
      { name: 'Old-age home support', note: 'Regular support and Diwali celebrations with Aai and Nivara old-age homes, Pune, and SAMPARC, Lonavla.' },
      { name: 'Blossoming Buds', note: 'Sanitary napkin access for girls in rural areas during their periods.' },
    ],
  },
  {
    slug: 'sports',
    title: 'Sports',
    tagline: 'A healthy body and a healthy mind, through sport.',
    metaDescription: 'Annual cricket, badminton, box football, carrom and table-tennis tournaments that build sportsmanship and bring young people across the CKP community together.',
    summary: 'Cricket, badminton, carrom and table-tennis competitions that build sportsmanship across the community.',
    points: [
      'Create awareness about sports and sportsmanship; arrange training camps, championships and tournaments.',
      'Get affiliated with district, regional and national bodies that promote these aims.',
    ],
    initiatives: [
      { name: 'Annual tournaments', note: 'Cricket, badminton, box football, carrom and table-tennis competitions held each year to encourage youth participation.' },
    ],
  },
];

export function getAreaBySlug(slug) {
  return AREAS_OF_WORK.find((a) => a.slug === slug);
}
