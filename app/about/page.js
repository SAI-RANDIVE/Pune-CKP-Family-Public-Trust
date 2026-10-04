import { buildMetadata } from '../../lib/seo';

export const metadata = buildMetadata({
  title: 'About the Trust | Pune CKP Family Public Trust',
  description: 'The story of Pune CKP Family Public Trust — from a 2016 WhatsApp group to a registered trust, its milestones, five objectives and plans for the future.',
  path: '/about',
});

const OBJECTIVES = [
  {
    title: 'Educational',
    points: [
      'Run, maintain or assist any educational or other institution for coaching, guidance, counselling or vocational training.',
      'Grant individual scholarships to poor, deserving and needy students for elementary and higher education.',
      'Give financial or in-kind assistance — books, notebooks, clothes, uniforms — to needy and poor children.',
      'Assist with the financial expenses of poor and needy students.',
    ],
  },
  {
    title: 'Medical',
    points: [
      'Give interest-free loans up to ₹25,000 to needy members for meeting the cost of medical treatment.',
      'Provide assistance within the CKP community in case of medical distress.',
      'Create awareness among the poor and indigent about illness, and provide medical assistance.',
    ],
  },
  {
    title: 'Environmental',
    points: [
      'Create environmental awareness amongst the community.',
      'Undertake and organise tree-plantation drives in various areas.',
      'Undertake activity supplemental to environmental objectives, at the Board of Trustees\u2019 discretion.',
    ],
  },
  {
    title: 'Social',
    points: [
      'Promote welfare, social, cultural, charitable, health, education, humanitarian and relief activities — irrespective of caste, creed, race, colour, sex or religion.',
      'Conduct programs that promote peace and harmony among communities.',
      'Award Gaurav Puraskars to people who have made a mark in social work, religion, arts, academics and sport.',
      'Work for noble humanity, world peace, eternal values and a sustainable life.',
    ],
  },
  {
    title: 'Sports',
    points: [
      'Create awareness about sports and sportsmanship; arrange training camps, championships and tournaments.',
      'Get affiliated with district, regional and national bodies that promote these aims.',
    ],
  },
];

const MILESTONES = [
  { date: '11 Jan 2016', text: 'The "Pune CKP Family" WhatsApp group is formed.' },
  { date: '18 Mar 2018', text: 'First Gaurav Sohala — Shri Sudhir Vaidya honoured with the "Shiromani" award; 65kg of notebooks (his own body weight) donated to Nutan Samarth Vidyalaya, a school for children of Pune\u2019s red-light area.' },
  { date: '14 May 2018', text: 'Pune CKP Family Public Trust formally registered (Reg. No. E-8167).' },
  { date: '21 May 2018', text: '₹11,000 given as emergency aid to a CKP person in Virar suffering a heart attack — one week after registration.' },
  { date: '1 Jul 2018', text: 'Members begin volunteering with Sahyadri Manav Seva Manch\u2019s medical camps for Pandharpur Warkaris; total support to date: ₹3.61 lakh.' },
  { date: '26 Jan 2019', text: 'Second Gaurav Sohala at Tilak Smarak Natyagriha — war heroes and veer-patnis felicitated before ~700 attendees; ₹1.5 lakh each to Sahyadri Manav Seva Manch, Queen Mary\u2019s Technical Institute and Dadar CKP Education Institute.' },
  { date: '19 Aug 2019', text: '50 dozen notebooks distributed to flood-affected students in Sangli/Kolhapur with ABCKPMS.' },
  { date: 'May 2020', text: 'During the pandemic: ₹1.5 lakh each to Sahyadri Manav Seva Manch, Seva Sahayog Foundation and Advitya Kala Sangam Trust; groceries for 100 needy families; sanitiser/mask/glove kits for Pune police.' },
  { date: 'Aug 2021', text: 'Relief work for CKP families affected by the Mahad floods; blankets, sheets and essentials delivered to the Prabhu Ram Mandir community.' },
];

export default function AboutPage() {
  return (
    <div className="container-page py-16 md:py-24">
      <p className="text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 text-center">About Us</p>
      <h1 className="font-display text-4xl md:text-5xl text-center mt-3">Pune CKP Family Public Trust — A Journey</h1>

      <div className="max-w-3xl mx-auto mt-10 text-ink/75 leading-relaxed space-y-4">
        <p>
          A group is formed with the idea of &ldquo;giving it back to society.&rdquo; Later, with this
          commitment, Pune CKP Public Trust was established. From this came the concept of
          finding the gems in the CKP community and glorifying their meritorious work —
          personalities who have gone beyond boundaries of caste and worked for the welfare
          of society and the country.
        </p>
        <p>
          &ldquo;Pune&rdquo;, a city synonymous with its rich cultural, historical and educational
          heritage, is home to a talented and forward-thinking Kayastha community that has
          been at the forefront of education, art, literature, music, culinary arts, science
          and industry — while holding on to its own traditional identity. With a mission of
          bringing together the brethren of this &ldquo;proud &amp; fiery&rdquo; community, a few
          like-minded visionaries formed the Pune CKP Family in June 2016.
        </p>
      </div>

      {/* Milestones */}
      <div className="mt-16">
        <h2 className="font-display text-2xl md:text-3xl text-center text-vermilion-700">Milestones</h2>
        <div className="mt-10 max-w-2xl mx-auto space-y-6">
          {MILESTONES.map((m) => (
            <div key={m.date} className="flex gap-5">
              <div className="w-28 shrink-0 text-right">
                <span className="font-mono text-xs font-semibold text-vermilion-600">{m.date}</span>
              </div>
              <div className="border-l-2 border-saffron-300 pl-5 pb-1">
                <p className="text-sm text-ink/75 leading-relaxed">{m.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Objectives */}
      <div className="mt-20">
        <h2 className="font-display text-2xl md:text-3xl text-center text-vermilion-700">Objectives</h2>
        <div className="grid md:grid-cols-2 gap-8 mt-10">
          {OBJECTIVES.map((o) => (
            <div key={o.title} className="bg-cream-100 border border-saffron-200/70 rounded-2xl p-7">
              <h3 className="font-display text-xl text-saffron-600">{o.title}</h3>
              <ul className="mt-4 space-y-2">
                {o.points.map((p, i) => (
                  <li key={i} className="text-sm text-ink/70 leading-relaxed flex gap-2">
                    <span className="text-vermilion-500 mt-1">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Vision */}
      <div className="mt-20 bg-cream-300/60 border border-saffron-200 rounded-3xl p-8 md:p-12 max-w-3xl mx-auto">
        <h2 className="font-display text-2xl text-vermilion-700">Looking Ahead</h2>
        <p className="text-sm text-ink/75 leading-relaxed mt-4">
          Upcoming CSR projects include a solar-powered water purification plant for rural
          areas, a transport-assistance scheme for rural students, and solarisation of
          schools for differently-abled students. The trust aims to grow its total social
          contribution towards ₹1 crore, reaching every corner of the community it serves.
        </p>
      </div>
    </div>
  );
}
