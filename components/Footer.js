import Link from 'next/link';
import { AREAS_OF_WORK } from '../lib/areasOfWorkData';
import { BANK_DETAILS } from '../lib/bankDetails';

export default function Footer() {
  return (
    <footer className="bg-ink text-cream-200 mt-24">
      <div className="citation-divider" />
      <div className="container-page py-14 grid gap-10 md:grid-cols-4">
        <div>
          <p className="font-display text-xl text-saffron-400">Pune CKP Family Public Trust</p>
          <p className="text-sm text-cream-200/70 mt-3 leading-relaxed">
            Survey No 129/26, 602 Niranka Co-op Housing Society, Ideal Colony, Paud Road,
            Kothrud, Pune – 411038
          </p>
          <p className="text-sm text-cream-200/70 mt-2">Mobile: 7447794477</p>
          <p className="text-sm text-cream-200/70">Email: puneckpfamily@gmail.com</p>
        </div>

        <div>
          <p className="font-semibold text-saffron-400 mb-3 text-sm uppercase tracking-wide">Explore</p>
          <ul className="space-y-2 text-sm text-cream-200/70">
            <li><Link href="/about" className="hover:text-saffron-300">About the Trust</Link></li>
            <li><Link href="/membership" className="hover:text-saffron-300">Membership</Link></li>
            <li><Link href="/donate" className="hover:text-saffron-300">Donate</Link></li>
            <li><Link href="/contact" className="hover:text-saffron-300">Contact Us</Link></li>
            <li><Link href="/gallery" className="hover:text-saffron-300">Gallery</Link></li>
            <li><Link href="/faq" className="hover:text-saffron-300">FAQ</Link></li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-saffron-400 mb-3 text-sm uppercase tracking-wide">Areas of Work</p>
          <ul className="space-y-2 text-sm text-cream-200/70">
            {AREAS_OF_WORK.map((area) => <li key={area.slug}><Link href={`/areas-of-work/${area.slug}`} className="hover:text-saffron-300">{area.title}</Link></li>)}
          </ul>
        </div>

        <div>
          <Link href="/donate/bank-transfer" className="font-semibold text-saffron-400 mb-3 text-sm uppercase tracking-wide block hover:text-saffron-300">Bank Transfer (large donations)</Link>
          <ul className="space-y-1 text-sm text-cream-200/70 font-mono">
            <li>{BANK_DETAILS.bankName}, {BANK_DETAILS.branch}</li>
            <li>A/C No: {BANK_DETAILS.accountNumber}</li>
            <li>IFSC: {BANK_DETAILS.ifsc}</li>
            <li>G-Pay: {BANK_DETAILS.gpay}</li>
          </ul>
          <Link href="/donate/bank-transfer" className="inline-block mt-3 text-sm text-saffron-300 hover:text-saffron-200">Full details →</Link>
        </div>
      </div>

      <div className="border-t border-cream-200/10 py-5">
        <nav aria-label="Legal" className="container-page flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-cream-200/60">
          <Link href="/terms" className="hover:text-saffron-300">Terms &amp; Conditions</Link>
          <Link href="/privacy" className="hover:text-saffron-300">Privacy Policy</Link>
          <Link href="/refund-policy" className="hover:text-saffron-300">Refund Policy</Link>
          <Link href="/faq" className="hover:text-saffron-300">FAQ</Link>
        </nav>
        <p className="container-page text-xs text-cream-200/50 text-center mt-4">
          <span className="devanagari text-base md:text-lg font-medium">समाज हिताय सर्वजनसुखाय</span> — © {new Date().getFullYear()} Pune CKP Family Public Trust. Reg. No. E-8167, dated 14 May 2018. PAN AADTP7440A.
        </p>
      </div>
    </footer>
  );
}
