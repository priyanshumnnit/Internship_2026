import { Link } from 'react-router-dom';
import { ArrowRight, Compass } from 'lucide-react';
import WorkerScene from '../components/WorkerScene.jsx';

function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-10 sm:px-6">
      <div className="surface-hero grid w-full gap-6 rounded-[2.2rem] p-6 sm:p-8 lg:grid-cols-[1.02fr,0.98fr] lg:items-center">
        <div className="space-y-5">
          <div className="glass-chip">
            <Compass size={14} />
            Route not found
          </div>
          <div>
            <p className="display-font text-6xl font-extrabold text-slate-950">404</p>
            <h1 className="mt-3 display-font text-3xl font-bold text-slate-950">This page wandered off the service map.</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
              The route you opened does not exist anymore or may need a different account role. The rest of the experience is still here and ready.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white shadow-[0_22px_38px_rgba(255,122,64,0.26)]"
          >
            Back to dashboard
            <ArrowRight size={16} />
          </Link>
        </div>

        <WorkerScene compact variant="crew" />
      </div>
    </div>
  );
}

export default NotFound;
