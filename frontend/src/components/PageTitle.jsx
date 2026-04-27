import { motion } from 'framer-motion';
import { Sparkles, TimerReset, Zap } from 'lucide-react';

const themes = {
  default: {
    eyebrow: 'Premium operations',
    variant: 'crew',
    pills: ['Smooth navigation', 'Fast interactions', 'Live workflows'],
  },
  Home: {
    eyebrow: 'Blue-collar service platform',
    variant: 'crew',
    pills: ['Curated discovery', 'Animated service scenes', 'Quick booking flow'],
  },
  'Admin Dashboard': {
    eyebrow: 'Control tower',
    variant: 'mechanic',
    pills: ['Collections and refunds', 'Role-safe approvals', 'High-signal summaries'],
  },
  'CSC Dashboard': {
    eyebrow: 'Field onboarding hub',
    variant: 'plumber',
    pills: ['Worker intake', 'Approval visibility', 'Block-level service feed'],
  },
  'Customer Dashboard': {
    eyebrow: 'Your live service board',
    variant: 'cleaner',
    pills: ['Order tracking', 'Attendance confirmations', 'Fast status updates'],
  },
  Orders: {
    eyebrow: 'Order orchestration',
    variant: 'plumber',
    pills: ['Service booking', 'Assignment timeline', 'Payment-aware status'],
  },
  Workers: {
    eyebrow: 'Crew management',
    variant: 'mechanic',
    pills: ['Registration', 'Approvals', 'Availability signals'],
  },
  Payments: {
    eyebrow: 'Financial motion',
    variant: 'mechanic',
    pills: ['Audit trail', 'Refund control', 'Dispute workflow'],
  },
  Attendance: {
    eyebrow: 'Daily proof of work',
    variant: 'cleaner',
    pills: ['Day-level marking', 'Customer confirmations', 'Fast reconciliations'],
  },
  Complaints: {
    eyebrow: 'Service recovery',
    variant: 'painter',
    pills: ['Escalations', 'Admin review', 'Resolution notes'],
  },
  Analytics: {
    eyebrow: 'Performance pulse',
    variant: 'crew',
    pills: ['Revenue', 'Payouts', 'Profit visibility'],
  },
  Customers: {
    eyebrow: 'Customer atlas',
    variant: 'cleaner',
    pills: ['Role-scoped directory', 'Location context', 'Clean search flow'],
  },
  Profile: {
    eyebrow: 'Identity and trust',
    variant: 'painter',
    pills: ['Saved address', 'Verification setup', 'Account readiness'],
  },
  'Profile & CSC Setup': {
    eyebrow: 'Identity and trust',
    variant: 'painter',
    pills: ['Saved address', 'Verification setup', 'Account readiness'],
  },
};

function PageTitle({ title, subtitle, action }) {
  const theme = themes[title] || themes.default;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-hero rounded-[1.7rem] px-5 py-5 sm:px-6 sm:py-5"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <div className="glass-chip">
            <Sparkles size={14} />
            {theme.eyebrow}
          </div>

          <div>
            <h1 className="display-font max-w-3xl text-2xl font-extrabold tracking-tight text-slate-950 sm:text-[2.1rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2.5 max-w-2xl text-sm leading-6 text-slate-600">
                {subtitle}
              </p>
            ) : null}
          </div>

          <div className="page-hero__meta">
            {theme.pills.map((pill, index) => {
              const Icon = index === 0 ? Zap : index === 1 ? TimerReset : Sparkles;
              return (
                <span key={pill} className="page-hero__pill">
                  <Icon size={14} />
                  {pill}
                </span>
              );
            })}
          </div>
        </div>
        {action ? <div className="lg:pb-1">{action}</div> : null}
      </div>
    </motion.section>
  );
}

export default PageTitle;
