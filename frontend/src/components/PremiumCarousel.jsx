import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import WorkerScene from './WorkerScene.jsx';

function PremiumCarousel({
  slides,
  className = '',
  autoPlay = true,
  interval = 5200,
  compact = false,
}) {
  const [index, setIndex] = useState(0);
  const totalSlides = slides.length;

  useEffect(() => {
    if (!autoPlay || totalSlides <= 1) return undefined;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % totalSlides);
    }, interval);

    return () => window.clearInterval(timer);
  }, [autoPlay, interval, totalSlides]);

  if (!slides.length) return null;

  const active = slides[index];

  return (
    <section className={[
      'premium-carousel surface-hero rounded-[2rem]',
      compact ? 'p-4 sm:p-5' : 'p-5 sm:p-6',
      className,
    ].join(' ').trim()}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="glass-chip">
          <span className="glass-chip__dot" />
          Curated service journeys
        </div>
        {totalSlides > 1 ? (
          <div className="premium-carousel__nav">
            <button
              type="button"
              onClick={() => setIndex((current) => (current - 1 + totalSlides) % totalSlides)}
              className="surface-soft inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-700"
              aria-label="Previous slide"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setIndex((current) => (current + 1) % totalSlides)}
              className="surface-soft inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-700"
              aria-label="Next slide"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        ) : null}
      </div>

      <div className={['premium-carousel__stage', compact ? 'mt-4' : 'mt-5'].join(' ')}>
        <AnimatePresence mode="wait">
          <motion.article
            key={active.id || active.title}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.36, ease: 'easeOut' }}
            className={[
              'premium-carousel__slide lg:grid-cols-[1.08fr,0.92fr] lg:items-center',
              compact ? 'gap-5' : '',
            ].join(' ').trim()}
          >
            <div className="space-y-4">
              <p className="section-label">{active.eyebrow}</p>
              <h2 className={[
                'display-font max-w-2xl font-bold leading-tight text-slate-950',
                compact ? 'text-[1.7rem] sm:text-[1.9rem]' : 'text-2xl sm:text-[2.25rem]',
              ].join(' ').trim()}>
                {active.title}
              </h2>
              <p className={[
                'max-w-2xl text-slate-600',
                compact ? 'text-sm leading-6' : 'text-sm leading-7 sm:text-base',
              ].join(' ').trim()}>
                {active.description}
              </p>

              {active.badges?.length ? (
                <div className="page-hero__meta">
                  {active.badges.map((badge) => (
                    <span key={badge} className="page-hero__pill">
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}

              {active.metrics?.length ? (
                <div className="premium-carousel__metrics">
                  {active.metrics.map((metric) => (
                    <div key={metric.label} className="premium-carousel__metric">
                      <span className="premium-carousel__metric-label">{metric.label}</span>
                      <span className="premium-carousel__metric-value">{metric.value}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {active.href && active.actionLabel ? (
                <div className="pt-2">
                  <Link
                    to={active.href}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white shadow-[0_22px_38px_rgba(255,122,64,0.26)]"
                  >
                    {active.actionLabel}
                    <ArrowRight size={16} />
                  </Link>
                </div>
              ) : null}
            </div>

            <WorkerScene variant={active.variant || 'crew'} compact={compact} />
          </motion.article>
        </AnimatePresence>
      </div>

      {totalSlides > 1 ? (
        <div className={['premium-carousel__thumbs', compact ? 'mt-4' : 'mt-5'].join(' ')}>
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.id || slide.title}
              type="button"
              onClick={() => setIndex(slideIndex)}
              className={[
                'premium-carousel__thumb surface-card rounded-[1.4rem]',
                compact ? 'px-3.5 py-2.5' : 'px-4 py-3',
                slideIndex === index ? 'is-active' : '',
              ].join(' ').trim()}
            >
              <p className="text-sm font-bold text-slate-900">{slide.title}</p>
              <p className="mt-1 text-sm text-slate-500">{slide.shortDescription || slide.description}</p>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default PremiumCarousel;
