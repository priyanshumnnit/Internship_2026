import WorkerScene from './WorkerScene.jsx';

function LoadingSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-4">
      <div className="surface-hero rounded-[2rem] p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1.05fr,0.95fr] lg:items-center">
          <div className="space-y-3">
            <div className="h-4 w-36 animate-pulse rounded-full bg-[rgba(255,122,64,0.16)]" />
            <div className="h-10 w-full max-w-xl animate-pulse rounded-2xl bg-[rgba(255,255,255,0.08)]" />
            <div className="h-4 w-full max-w-2xl animate-pulse rounded-full bg-[rgba(255,255,255,0.08)]" />
            <div className="h-4 w-2/3 animate-pulse rounded-full bg-[rgba(255,255,255,0.06)]" />
          </div>
          <WorkerScene compact />
        </div>
      </div>

      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="surface-panel animate-pulse rounded-[1.6rem] p-5">
          <div className="h-4 w-32 rounded-full bg-[rgba(255,255,255,0.08)]" />
          <div className="mt-4 h-3 w-full rounded-full bg-[rgba(255,255,255,0.06)]" />
          <div className="mt-3 h-3 w-2/3 rounded-full bg-[rgba(255,255,255,0.05)]" />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="h-20 rounded-[1.2rem] bg-[rgba(255,122,64,0.08)]" />
            <div className="h-20 rounded-[1.2rem] bg-[rgba(91,215,255,0.07)]" />
            <div className="h-20 rounded-[1.2rem] bg-[rgba(139,123,255,0.07)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default LoadingSkeleton;
