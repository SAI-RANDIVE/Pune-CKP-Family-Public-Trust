/**
 * FAQ content.
 *
 * Written as direct-answer blocks: each question is answered in the first
 * sentence, with detail after. That is what FAQPage structured data and AI
 * answer engines both reward, and it is also simply how a donor wants to read.
 *
 * Keep every factual claim here consistent with lib/bankDetails.js, the receipt
 * template in lib/receipt.js, and the trust details in .env — an inconsistency
 * between those actively damages how confidently a search or answer engine
 * will quote the trust.
 *
 * ⚠️ REVIEW WITH THE TRUSTEES before going live: the 80G answer and the refund
 * window are stated conservatively on purpose. See the notes on each.
 */
export const FAQS = [
  {
    category: 'Donating',
    question: 'How much can I donate online?',
    answer:
      'Between ₹100 and ₹10,000 in a single online payment. The trust deliberately caps online donations at ₹10,000 — for anything larger, use the bank transfer or UPI details on the Bank Transfer page, and the trust will issue an official receipt against your transaction reference.',
  },
  {
    category: 'Donating',
    question: 'What payment methods can I use?',
    answer:
      'Credit card, debit card, net banking, UPI and popular wallets, all through Razorpay. Payments are processed on Razorpay’s secure checkout — the trust never sees or stores your card or UPI credentials.',
  },
  {
    category: 'Donating',
    question: 'Will I get a receipt for my donation?',
    answer:
      'Yes, immediately. As soon as your payment is confirmed, a PDF receipt is generated with a unique receipt number in the trust’s own receipt-book format (for example M/26-27/032) and made available to download from the confirmation screen. It carries the trust’s registration number and PAN.',
  },
  {
    category: 'Donating',
    // ⚠️ The trust has NOT confirmed current 80G registration status. This answer
    // deliberately does not assert that donations are tax-deductible. Replace it
    // with a definite answer (and the 80G registration number and validity dates)
    // once the trustees confirm.
    question: 'Is my donation tax-deductible under section 80G?',
    answer:
      'Please contact the trust before donating if you need a tax exemption certificate. Pune CKP Family Public Trust is a registered public trust (Reg. No. E-8167, PAN AADTP7440A) and issues an official receipt for every donation. For the current status of its 80G registration and whether a certificate can be issued for your donation, email puneckpfamily@gmail.com or call 7447794477.',
  },
  {
    category: 'Donating',
    // ⚠️ Source conflict: the old site's terms offered a 30-day refund window,
    // but the printed receipt says "Non refundable". Confirm which governs.
    question: 'Can I get a refund if I donate by mistake?',
    answer:
      'Contact the trust as soon as possible and it will be reviewed on a best-effort basis. Write to puneckpfamily@gmail.com with your receipt number and payment reference. Refunds are at the trust’s discretion; where one is approved, the amount is returned to the original payment method and the corresponding receipt is cancelled.',
  },
  {
    category: 'Donating',
    question: 'Where does my money actually go?',
    answer:
      'Into five areas set out in the trust deed: education, medical aid, environment, social welfare and sport. Published disbursements to date are roughly ₹18.7 lakh on education, ₹21.5 lakh on healthcare, ₹19.2 lakh on social welfare and ₹71,000 on environmental work — money already spent, not pledged. Each area page lists the specific schemes it funds.',
  },
  {
    category: 'Membership',
    question: 'What does membership include?',
    answer:
      'Membership makes you part of the trust’s family and gives you access to its member schemes — most significantly interest-free medical loans of up to ₹25,000 for members facing treatment costs. Members are also invited to the annual CKP Gaurav Sohala and to the trust’s cultural and sporting events through the year.',
  },
  {
    category: 'Membership',
    question: 'How much does membership cost?',
    answer:
      'Silver is ₹1,000 a year, Gold is ₹5,000 for five years, and Platinum is ₹10,000 for lifetime membership. A one-time ₹100 form fee is added to every new membership across all three tiers. Renewals do not attract the form fee.',
  },
  {
    category: 'Membership',
    question: 'Why is my first Silver payment more than ₹1,000?',
    answer:
      'Because the first term runs to a fixed cycle date, so it is usually longer than twelve months. A new Silver membership runs to the next 30 June or 31 December that is at least twelve months away, charged at ₹1,000 a year pro rata. Joining in October, for example, covers you to 31 December of the following year — fifteen months, ₹1,250, plus the ₹100 form fee.',
  },
  {
    category: 'Membership',
    question: 'How do I renew my membership?',
    answer:
      'Go to the Membership page, choose "Renew Existing Membership", and enter your membership number. If you do not have your number to hand, the trust can look you up using the phone number and email you originally registered. Renewal extends your existing validity date rather than restarting it, so you never lose time by renewing early.',
  },
  {
    category: 'Membership',
    question: 'How do I update my membership details?',
    answer:
      'Email puneckpfamily@gmail.com or call the trust’s Secretary, Shri Nilesh Gupte, who handles membership, on 8669151533. Include your membership number and the details you need changed — address, phone, email, blood group or anniversary date.',
  },
  {
    category: 'About the Trust',
    question: 'Who can become a member?',
    answer:
      'Membership is open to members of the Chandraseniya Kayastha Prabhu community. The trust’s charitable work, however, is explicitly not limited by community — its deed commits it to welfare activity irrespective of caste, creed, race, colour, sex or religion, and much of its relief and education work has gone to people outside the CKP community.',
  },
  {
    category: 'About the Trust',
    question: 'Is Pune CKP Family Public Trust a registered charity?',
    answer:
      'Yes. It is registered as a public trust under registration number E-8167, dated 14 May 2018, with PAN AADTP7440A. Its office is at 602 Niranka Co-op Housing Society, Ideal Colony, Paud Road, Kothrud, Pune 411038.',
  },
  {
    category: 'About the Trust',
    question: 'What is the CKP Gaurav Sohala?',
    answer:
      // Roles and themes exactly as the old site prints them: see lib/gauravSohalaData.js.
      'It is the trust’s annual felicitation ceremony, begun in 2018. Each edition honours members of the CKP community for distinguished work: cricket and the arts in 2018, war heroes and Vir Chakra recipients in 2019, the Yuva Gaurav Puraskar in 2023, and the medical profession in 2024. The 2020 ceremony was cancelled because of the pandemic, and its awardees were felicitated at their homes in November and December 2020.',
  },
  {
    category: 'About the Trust',
    question: 'What are Dnyan Kiran and Project Diya?',
    answer:
      'They are the trust’s two education projects, introduced on 15 March 2021. Dnyan Kiran is a Student Assistance Fund for needy and deserving students: school support, scholarships and help with higher education, including a plan to adopt a child for ₹3,000, ₹5,000 or ₹10,000 a year. Project Diya gives bicycles to students who need them to reach school: you can donate a bicycle for ₹5,000, pay ₹1,500 to repair one, or give your old bicycle.',
  },
  {
    category: 'About the Trust',
    question: 'Who runs the trust?',
    answer:
      'The Chairman is Shri Nandkumar Wadhavkar and the Secretary is Shri Nilesh R. Gupte. The trust grew out of the "Pune CKP Family" WhatsApp group started on 11 January 2016 and was formed as a public trust on 14 May 2018.',
  },
];

export const FAQ_CATEGORIES = [...new Set(FAQS.map((f) => f.category))];
