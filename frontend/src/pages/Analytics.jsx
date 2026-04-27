import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { cachedGet, getApiErrorMessage } from '../utils/api.js';

function formatCurrency(value) {
  return `INR ${Number(value || 0).toLocaleString('en-IN')}`;
}

function StatCard({ label, value, tone = 'text-slate-900' }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-panel rounded-[1.5rem] p-5"
    >
      <div className="mb-4 h-1.5 w-14 rounded-full bg-indigo-500" />
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`mt-3 text-2xl font-bold tracking-tight ${tone}`}>{value}</p>
    </motion.article>
  );
}

function Analytics() {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  const canView = user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN';

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchAnalytics() {
      setLoading(true);
      setError('');
      try {
        const response = await cachedGet('/analytics', { skipErrorToast: true }, { ttl: 10_000 });
        if (!mounted) return;
        setStats(response.data);
      } catch (requestError) {
        if (!mounted) return;
        const message = getApiErrorMessage(requestError, 'Unable to load analytics');
        setError(message);
        toast.error(message);
        setStats(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchAnalytics();

    return () => {
      mounted = false;
    };
  }, [canView, toast]);

  if (!canView) {
    return (
      <div className="surface-panel rounded-2xl p-5">
        <p className="text-sm text-slate-600">Analytics is available only for SUPER_ADMIN and BLOCK_ADMIN.</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Analytics" subtitle="Customer collections, worker payouts, refunds, and profitability" />

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Workers" value={stats?.totalWorkers ?? 0} />
        <StatCard label="Total Orders" value={stats?.totalOrders ?? 0} />
        <StatCard label="Paid Customer Orders" value={stats?.paidCustomerOrders ?? 0} tone="text-emerald-700" />
        <StatCard label="Worker Payment Records" value={stats?.totalPayments ?? 0} />
        <StatCard label="Customer Received" value={formatCurrency(stats?.grossCustomerReceipts ?? 0)} tone="text-emerald-700" />
        <StatCard label="Refunded" value={formatCurrency(stats?.totalRefundAmount ?? 0)} tone="text-amber-700" />
        <StatCard label="Net Received" value={formatCurrency(stats?.netCustomerReceipts ?? 0)} />
        <StatCard label="Paid To Workers" value={formatCurrency(stats?.totalPaidToWorkers ?? 0)} tone="text-sky-700" />
        <StatCard label="Pending Worker Payouts" value={formatCurrency(stats?.pendingWorkerPayoutAmount ?? 0)} tone="text-amber-700" />
        <StatCard label="Failed Worker Payouts" value={formatCurrency(stats?.failedWorkerPayoutAmount ?? 0)} tone="text-rose-700" />
        <StatCard label="Net Profit" value={formatCurrency(stats?.netProfit ?? 0)} tone={Number(stats?.netProfit ?? 0) >= 0 ? 'text-slate-900' : 'text-rose-700'} />
        <StatCard label="Refund Records" value={stats?.totalRefunds ?? 0} />
      </div>
    </div>
  );
}

export default Analytics;
