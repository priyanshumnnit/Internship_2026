import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import WorkerScene from '../components/WorkerScene.jsx';
import PremiumCarousel from '../components/PremiumCarousel.jsx';

const showcaseSlides = [
  {
    id: 'book-fast',
    eyebrow: 'Instant booking flow',
    title: 'Search, book, pay, and track blue-collar services in one polished journey.',
    shortDescription: 'Fast discovery with premium motion and higher clarity.',
    description: 'Every step feels fast and intentional, from first tap to payment confirmation. Workers, customers, and admins all move through the same smooth orchestration layer.',
    badges: ['Plumbing', 'Electrical', 'Painting', 'Cleaning'],
    metrics: [
      { label: 'Live categories', value: '4 service lanes' },
      { label: 'Flow', value: 'Booking to payout' },
      { label: 'Experience', value: 'Fast + tactile' },
    ],
    variant: 'crew',
  },
  {
    id: 'ops-premium',
    eyebrow: 'Operational elegance',
    title: 'Admins get audit-ready controls without sacrificing speed or delight.',
    shortDescription: 'Collections, assignment, complaints, and refunds in one surface.',
    description: 'The dashboard is shaped like a top-tier consumer product but built for operational depth, with premium states, high-clarity actions, and less friction under pressure.',
    badges: ['Analytics', 'Refund control', 'Worker approvals'],
    metrics: [
      { label: 'Role guardrails', value: 'Strict access' },
      { label: 'Motion', value: 'Context-aware' },
      { label: 'Visibility', value: 'High signal' },
    ],
    variant: 'mechanic',
  },
];

function Home() {
  const heroRef = useRef(null);

  useEffect(() => {
    if (!heroRef.current) return;
    gsap.fromTo(
      heroRef.current.querySelectorAll('[data-hero-item]'),
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: 0.58, stagger: 0.08, ease: 'power2.out' },
    );
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute left-[-8%] top-[6%] h-72 w-72 rounded-full bg-[rgba(255,122,64,0.12)] blur-3xl" />
        <div className="absolute right-[-6%] top-[12%] h-80 w-80 rounded-full bg-[rgba(91,215,255,0.1)] blur-3xl" />
        <div className="absolute bottom-[-12%] left-[28%] h-[26rem] w-[26rem] rounded-full bg-[rgba(139,123,255,0.12)] blur-3xl" />
      </div>

      <header className="relative z-20 mx-auto max-w-7xl">
        <div className="surface-soft flex items-center justify-between gap-4 rounded-[1.9rem] px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-[1.25rem] bg-[var(--brand)] text-base font-extrabold text-white shadow-[0_22px_36px_rgba(255,122,64,0.28)]">S</span>
            <div>
              <p className="display-font text-lg font-bold text-slate-950">ShramSangam</p>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Premium workforce marketplace</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {['Plumbers', 'Mechanics', 'Painters', 'Cleaners'].map((item) => (
              <span key={item} className="page-hero__pill">
                {item}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link to="/login" className="rounded-full px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white/60">
              Login
            </Link>
            <Link to="/signup" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_20px_34px_rgba(18,8,15,0.18)]">
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main ref={heroRef} className="relative z-10 mx-auto mt-5 max-w-7xl space-y-5">
        <section className="surface-hero overflow-hidden rounded-[2rem] px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid gap-6 lg:grid-cols-[1.02fr,0.98fr] lg:items-center">
            <div className="space-y-4">
              <div data-hero-item className="glass-chip">
                <Sparkles size={14} />
                Inspired by top-tier consumer flows
              </div>

              <div data-hero-item>
                <h1 className="display-font max-w-2xl text-[1.85rem] font-extrabold leading-tight text-slate-950 sm:text-[2.25rem] lg:text-[2.55rem]">
                  Service discovery and workforce operations with a premium, effortless feel.
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                  Book services, track work, and manage operations through a cleaner, lighter homepage with premium motion and separate full-page login and signup screens.
                </p>
              </div>

              <div data-hero-item className="flex flex-wrap gap-3">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/6 px-5 py-3 text-sm font-semibold text-slate-800 shadow-[0_16px_28px_rgba(0,0,0,0.16)]"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white shadow-[0_22px_38px_rgba(255,122,64,0.26)]"
                >
                  Sign up
                  <ArrowRight size={16} />
                </Link>
              </div>

              <div data-hero-item className="page-hero__meta">
                {[
                  'Separate auth pages',
                  'Smoother booking flow',
                  'Premium 2D worker motion',
                ].map((item) => (
                  <span key={item} className="page-hero__pill">{item}</span>
                ))}
              </div>
            </div>

            <div data-hero-item className="space-y-3">
              <WorkerScene variant="crew" compact />
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { icon: Users, label: 'Verified workers', value: 'Approval-led' },
                  { icon: Wallet, label: 'Collections', value: 'Payment synced' },
                  { icon: ShieldCheck, label: 'Trust layer', value: 'Attendance checks' },
                ].map((item) => (
                  <article key={item.label} className="surface-card rounded-[1.3rem] p-3.5">
                    <item.icon size={18} className="text-[var(--brand)]" />
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{item.value}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <PremiumCarousel slides={showcaseSlides} compact />
      </main>
    </div>
  );
}

export default Home;
