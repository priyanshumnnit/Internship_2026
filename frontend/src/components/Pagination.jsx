import { ChevronLeft, ChevronRight } from 'lucide-react';

function Pagination({ page, totalPages, onPrev, onNext }) {
  if (!totalPages || totalPages <= 1) {
    return null;
  }

  return (
    <div className="surface-soft flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] px-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Navigation</p>
        <p className="mt-1 text-sm font-medium text-slate-700">Page {page} of {totalPages}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page <= 1}
          className="surface-card inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
        >
          <ChevronLeft size={16} />
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-[0_20px_34px_rgba(255,122,64,0.22)] disabled:opacity-40"
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
