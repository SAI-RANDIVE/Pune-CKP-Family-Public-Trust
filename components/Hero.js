import Link from 'next/link';
import Image from 'next/image';
import Reveal from './Reveal';
import CountUp from './CountUp';

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-saffron-200 hero-wash">
      <div className="container-page py-20 md:py-28 grid md:grid-cols-[1.2fr,0.8fr] gap-12 items-center">
        <div>
          <Reveal>
            <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.25em] uppercase text-vermilion-600 bg-vermilion-50 px-4 py-1.5 rounded-full">
              <span className="devanagari text-sm">समाज हिताय सर्वजनसुखाय</span>
            </p>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="font-display text-4xl md:text-6xl leading-[1.1] mt-6 text-ink">
              A family of the <span className="text-vermilion-600">CKP community</span>,
              built on giving back.
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 text-lg text-ink/70 max-w-xl leading-relaxed">
              It started as a WhatsApp group of ten friends in January 2016. Eight years on,
              Pune CKP Family Public Trust has put more than ₹60 lakh to work — school fees,
              hospital bills, flood relief, bicycles, borewells — for the Chandraseniya
              Kayastha Prabhu community and well beyond it.
            </p>
          </Reveal>

          <Reveal delay={220}>
            <p className="mt-4 text-sm text-ink/60 max-w-xl leading-relaxed">
              <span className="devanagari">समाजाचे देणं समाजालाच द्यावं</span> — what society
              gives, return to society. That line is why the trust exists.
            </p>
          </Reveal>

          <Reveal delay={280}>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link href="/membership" className="btn-press rounded-full bg-vermilion-500 text-cream-100 px-7 py-3.5 font-semibold shadow-md hover:bg-vermilion-600">
                Join as a Member
              </Link>
              <Link href="/donate" className="btn-press rounded-full border-2 border-saffron-500 text-vermilion-700 px-7 py-3.5 font-semibold hover:bg-saffron-100">
                Make a Donation
              </Link>
            </div>
          </Reveal>

          <Reveal delay={340}>
            <p className="mt-6 text-xs text-ink/55">
              Registered public trust E-8167 · PAN AADTP7440A · instant PDF receipt on every payment
            </p>
          </Reveal>
        </div>

        <Reveal delay={160} className="relative mx-auto">
          <div className="medallion medallion--gold medallion-hover" style={{ width: '15rem', height: '15rem' }}>
            <div className="medallion-ribbon" />
            <div className="text-center px-6">
              <Image src="/logo/logo.png" alt="Pune CKP Family Public Trust emblem" width={72} height={72} className="mx-auto h-16 w-16 rounded-full object-cover" priority />
              <p className="font-display text-4xl text-vermilion-700">
                ₹<CountUp value={60} suffix="L+" />
              </p>
              <p className="text-[11px] uppercase tracking-widest text-ink/70 mt-1">contributed since 2016</p>
            </div>
          </div>
          <div className="medallion medallion--silver medallion-hover absolute -left-10 -bottom-6" style={{ width: '6rem', height: '6rem' }}>
            <p className="font-display text-xs text-center text-ink/80">Est.<br />2016</p>
          </div>
          <div className="medallion medallion--platinum medallion-hover absolute -right-6 top-2" style={{ width: '5rem', height: '5rem' }}>
            <p className="font-display text-[10px] text-center text-cream-200">Reg.<br />E-8167</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
