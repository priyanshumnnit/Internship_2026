import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import WorkerScene from './WorkerScene.jsx';

function inferVariant(label = '') {
  const text = label.toLowerCase();

  if (text.includes('payment') || text.includes('refund')) return 'mechanic';
  if (text.includes('paint')) return 'painter';
  if (text.includes('attendance') || text.includes('clean')) return 'cleaner';
  if (text.includes('worker') || text.includes('assign') || text.includes('order')) return 'plumber';
  return 'crew';
}

function SpinnerContent({
  label = 'Processing your request...',
  size = 'md',
  inline = false,
  scene = true,
}) {
  const variant = inferVariant(label);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={[
        inline ? '' : 'surface-panel',
        'spinner-shell',
        inline ? 'spinner-inline' : '',
      ].join(' ').trim()}
    >
      <div className={['spinner-card', inline ? 'spinner-card--inline' : ''].join(' ').trim()}>
        <div className={`spinner-orbit spinner-orbit--${size}`}>
          <div className="spinner-ring" aria-hidden="true" />
          <div className="spinner-core">
            <Sparkles size={size === 'sm' ? 14 : size === 'lg' ? 22 : 18} />
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          {!inline && scene ? <WorkerScene compact variant={variant} /> : null}
          <p className="spinner-label">
            <strong>{inline ? 'Live refresh' : 'Service crew in motion'}</strong>
            {label}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

export function SpinnerPanel({ label, className = '' }) {
  return (
    <div className={['spinner-panel', className].join(' ').trim()}>
      <SpinnerContent label={label} size="lg" />
    </div>
  );
}

export function InlineSpinner({ label }) {
  return <SpinnerContent label={label} size="sm" inline />;
}

export function BusyOverlay({ label = 'Processing...', className = '' }) {
  return (
    <div className={['busy-overlay', className].join(' ').trim()}>
      <SpinnerContent label={label} size="md" />
    </div>
  );
}
