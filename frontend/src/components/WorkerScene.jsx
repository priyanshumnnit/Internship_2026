function Worker({
  x,
  y,
  accent,
  helmet,
  tool,
  bodyClass,
}) {
  return (
    <g className={`worker-scene__worker ${bodyClass}`} transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="69" rx="28" ry="8" fill="rgba(54, 28, 30, 0.1)" />
      <circle cx="0" cy="-4" r="13" fill="#ffd4b8" />
      <path d="M-15 -8c3-12 25-12 30 0v7h-30z" fill={helmet} />
      <rect x="-14" y="12" width="28" height="34" rx="10" fill={accent} />
      <rect x="-11" y="20" width="22" height="8" rx="4" fill="rgba(255,255,255,0.24)" />
      <path d="M-9 16c-12 6-15 18-18 30" stroke="#ffd4b8" strokeWidth="6" strokeLinecap="round" />
      <path d="M9 16c12 6 15 18 18 30" stroke="#ffd4b8" strokeWidth="6" strokeLinecap="round" />
      <path d="M-7 46v18" stroke="#5b3d4a" strokeWidth="7" strokeLinecap="round" />
      <path d="M7 46v18" stroke="#5b3d4a" strokeWidth="7" strokeLinecap="round" />
      <path d="M-12 66h11" stroke="#1f111a" strokeWidth="7" strokeLinecap="round" />
      <path d="M1 66h11" stroke="#1f111a" strokeWidth="7" strokeLinecap="round" />
      {tool}
    </g>
  );
}

function toolFor(type, accent) {
  const stroke = accent;

  if (type === 'plumber') {
    return (
      <g transform="translate(19 46)">
        <path d="M-4 -4l10-10" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
        <path d="M4 -14l8 8-4 4-8-8" fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }

  if (type === 'mechanic') {
    return (
      <g transform="translate(-22 49)">
        <rect x="-5" y="-10" width="10" height="18" rx="4" fill={stroke} />
        <path d="M0 -10v-12" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
        <path d="M-6 -16h12" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
      </g>
    );
  }

  if (type === 'painter') {
    return (
      <g transform="translate(23 47)">
        <rect x="-13" y="-7" width="16" height="9" rx="4.5" fill={stroke} />
        <path d="M4 -2h12" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
      </g>
    );
  }

  return (
    <g transform="translate(-20 48)">
      <path d="M0 -18v20" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
      <path d="M-8 2l8-7 8 7" fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-14 15h28" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
    </g>
  );
}

const workerSet = [
  { type: 'plumber', label: 'Plumber live', x: 118, y: 208, accent: '#5bd7ff', helmet: '#ffe7b8' },
  { type: 'mechanic', label: 'Mechanic sync', x: 245, y: 198, accent: '#ff7a40', helmet: '#ffd6ad' },
  { type: 'painter', label: 'Painter polish', x: 376, y: 214, accent: '#ff6cad', helmet: '#ffd7c9' },
  { type: 'cleaner', label: 'Sweeper ready', x: 502, y: 206, accent: '#8b7bff', helmet: '#f5e8c4' },
];

function WorkerScene({ className = '', compact = false, variant = 'crew' }) {
  const visibleWorkers = variant === 'crew'
    ? workerSet
    : workerSet.filter((worker) => worker.type === variant);

  return (
    <div className={['worker-scene', compact ? 'worker-scene--compact' : '', className].join(' ').trim()}>
      <div className="worker-scene__bg" aria-hidden="true">
        <svg viewBox="0 0 620 360" className="worker-scene__svg" role="presentation">
          <defs>
            <linearGradient id="floor-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(91, 215, 255, 0.2)" />
              <stop offset="100%" stopColor="rgba(255, 122, 64, 0.16)" />
            </linearGradient>
            <linearGradient id="beam-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(91, 215, 255, 0.58)" />
              <stop offset="100%" stopColor="rgba(91, 215, 255, 0)" />
            </linearGradient>
          </defs>

          <rect x="32" y="34" width="184" height="112" rx="28" fill="rgba(255,255,255,0.06)" />
          <rect x="236" y="56" width="142" height="86" rx="24" fill="rgba(255,255,255,0.05)" />
          <rect x="412" y="32" width="150" height="102" rx="26" fill="rgba(255,255,255,0.06)" />
          <path className="worker-scene__lamp" d="M280 0h60l32 125H248z" fill="url(#beam-gradient)" />
          <rect x="0" y="270" width="620" height="90" fill="url(#floor-gradient)" />
          <path d="M38 248c74-18 156-22 244-16s182 12 300-18" fill="none" stroke="rgba(255, 255, 255, 0.09)" strokeWidth="6" strokeLinecap="round" />
          <circle className="worker-scene__spark" cx="418" cy="126" r="7" fill="rgba(255, 122, 64, 0.62)" />
          <circle className="worker-scene__spark" cx="434" cy="108" r="4" fill="rgba(91, 215, 255, 0.62)" />
          <circle className="worker-scene__spark" cx="102" cy="118" r="5" fill="rgba(139, 123, 255, 0.58)" />

          {visibleWorkers.map((worker) => (
            <Worker
              key={worker.type}
              x={variant === 'crew' ? worker.x : 310}
              y={variant === 'crew' ? worker.y : 206}
              accent={worker.accent}
              helmet={worker.helmet}
              tool={toolFor(worker.type, worker.accent)}
              bodyClass={`worker-scene__worker--${worker.type}`}
            />
          ))}
        </svg>
      </div>

      <div className="worker-scene__badge worker-scene__badge--one">{visibleWorkers[0]?.label || 'Service ready'}</div>
      <div className="worker-scene__badge worker-scene__badge--two">Animated workflow</div>
      <div className="worker-scene__badge worker-scene__badge--three">Fast premium motion</div>
    </div>
  );
}

export default WorkerScene;
