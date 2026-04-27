const classMap = {
  default: 'border-white/10 bg-white/5 text-slate-700',
  success: 'border-[rgba(45,214,143,0.24)] bg-[rgba(45,214,143,0.12)] text-emerald-800',
  warning: 'border-[rgba(255,122,64,0.24)] bg-[rgba(255,122,64,0.14)] text-amber-900',
  danger: 'border-[rgba(255,106,135,0.24)] bg-[rgba(255,106,135,0.14)] text-rose-800',
  info: 'border-[rgba(91,215,255,0.24)] bg-[rgba(91,215,255,0.14)] text-sky-900',
};

const dotMap = {
  default: 'bg-slate-400',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
};

function StatusPill({ label, tone = 'default' }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-[0_10px_20px_rgba(58,23,23,0.05)] backdrop-blur',
        classMap[tone] || classMap.default,
      ].join(' ').trim()}
    >
      <span className={['h-2 w-2 rounded-full', dotMap[tone] || dotMap.default].join(' ')} />
      {label}
    </span>
  );
}

export default StatusPill;
