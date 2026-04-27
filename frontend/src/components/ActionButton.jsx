function ActionButton({
  children,
  loading = false,
  disabled = false,
  tone = 'neutral',
  size = 'sm',
  className = '',
  ...props
}) {
  const toneClasses = {
    brand: 'bg-[var(--brand)] text-white shadow-[0_20px_34px_rgba(255,122,64,0.24)]',
    success: 'bg-emerald-600 text-white shadow-[0_20px_34px_rgba(15,158,116,0.24)]',
    danger: 'bg-rose-600 text-white shadow-[0_20px_34px_rgba(218,72,107,0.24)]',
    warning: 'bg-[var(--accent-strong)] text-white shadow-[0_20px_34px_rgba(91,215,255,0.24)]',
    neutral: 'surface-card text-slate-700',
    ghost: 'surface-soft border border-white/10 text-slate-700 shadow-[0_16px_26px_rgba(0,0,0,0.16)]',
  };

  const sizeClasses = size === 'md'
    ? 'min-h-[2.9rem] px-4 py-2.5 text-sm'
    : 'min-h-[2.4rem] px-3.5 py-2 text-xs';

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
        sizeClasses,
        toneClasses[tone] || toneClasses.neutral,
        className,
      ].join(' ').trim()}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  );
}

export default ActionButton;
