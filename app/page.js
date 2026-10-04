import Hero from '../components/Hero';
import ObjectivesSection from '../components/ObjectivesSection';
import StatsSection from '../components/StatsSection';
import GauravTimeline from '../components/GauravTimeline';
import Testimonials from '../components/Testimonials';
import CtaBanner from '../components/CtaBanner';
import { buildMetadata } from '../lib/seo';

export const metadata = buildMetadata({
  title: 'Pune CKP Family Public Trust',
  description: 'Pune CKP Family Public Trust supports education, medical aid, environment, social welfare and sport across the CKP community in Pune. Join or donate.',
  path: '/',
});

export default function HomePage() {
  return (
    <>
      <Hero />
      <ObjectivesSection />
      <StatsSection />
      <GauravTimeline />
      <Testimonials />
      <CtaBanner />
    </>
  );
}
