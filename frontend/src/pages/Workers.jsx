import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import PageTitle from '../components/PageTitle.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusPill from '../components/StatusPill.jsx';
import { InlineSpinner } from '../components/Spinner.jsx';
import api, { cachedGet, getApiErrorMessage } from '../utils/api.js';

function Workers() {
  const { user } = useAuth();
  const toast = useToast();
  const hasLoadedWorkersRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');

  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('');

  const [form, setForm] = useState({
    name: '',
    phone: '',
    category: 'plumbing',
    photo_url: '',
    aadhaar_url: '',
    bank_url: '',
  });

  const canCreateWorkers = user?.role === 'CSC_AGENT' && user?.cscStatus === 'APPROVED';
  const canReviewWorkers = user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN';
  const deferredCategory = useDeferredValue(category);

  const queryString = useMemo(() => {
    const query = new URLSearchParams({ page: String(page) });
    if (deferredCategory) query.set('category', deferredCategory);
    if (status) query.set('status', status);
    if (approvalStatus) query.set('approvalStatus', approvalStatus);
    if (user?.role === 'CSC_AGENT') query.set('mine', 'true');
    return query.toString();
  }, [approvalStatus, deferredCategory, page, status, user?.role]);

  async function fetchWorkers(options = {}) {
    const { force = false, background = false } = options;
    const showBackgroundLoader = background || hasLoadedWorkersRef.current;

    if (showBackgroundLoader) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const response = await cachedGet(`/workers?${queryString}`, { skipErrorToast: true }, { ttl: 10_000, force });
      setWorkers(response.data.workers || []);
      setTotalPages(response.data.totalPages || 1);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load workers');
      setError(message);
      toast.error(message);
      setWorkers([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedWorkersRef.current = true;
    }
  }

  useEffect(() => {
    fetchWorkers();
  }, [queryString]);

  async function handleCreateWorker(event) {
    event.preventDefault();
    setError('');

    try {
      await api.post('/workers', form);
      toast.success('Worker registration submitted for admin approval.');
      setForm({
        name: '',
        phone: '',
        category: 'plumbing',
        photo_url: '',
        aadhaar_url: '',
        bank_url: '',
      });
      setPage(1);
      await fetchWorkers({ force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to create worker'));
    }
  }

  async function updateApproval(workerId, nextStatus) {
    setError('');

    try {
      await api.patch(`/workers/${workerId}/approval`, { approvalStatus: nextStatus });
      toast.success(`Worker ${nextStatus.toLowerCase()} successfully.`);
      await fetchWorkers({ force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to update worker approval'));
    }
  }

  async function updateOperationalStatus(workerId, nextStatus, isAvailable) {
    setError('');

    try {
      await api.patch(`/workers/${workerId}/status`, {
        status: nextStatus,
        isAvailable,
      });
      toast.success('Worker status updated.');
      await fetchWorkers({ force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to update worker status'));
    }
  }

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Workers"
        subtitle="Register workers, review approvals, and monitor availability"
      />

      {user?.role === 'CSC_AGENT' && user?.cscStatus !== 'APPROVED' ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Your CSC status is {user?.cscStatus}. Worker creation is enabled only after APPROVED status.
        </p>
      ) : null}

      {refreshing ? <InlineSpinner label="Refreshing workers..." /> : null}

      {canCreateWorkers ? (
        <form onSubmit={handleCreateWorker} className="surface-panel rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">Register New Worker</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input
              type="text"
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Worker name"
              className="rounded-xl border border-slate-300 px-3 py-2.5"
            />
            <input
              type="tel"
              required
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="Worker phone"
              className="rounded-xl border border-slate-300 px-3 py-2.5"
            />
            <select
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2.5"
            >
              <option value="plumbing">plumbing</option>
              <option value="electrician">electrician</option>
              <option value="painting">painting</option>
              <option value="cleaning">cleaning</option>
            </select>
            <input
              type="url"
              value={form.photo_url}
              onChange={(event) => setForm((prev) => ({ ...prev, photo_url: event.target.value }))}
              placeholder="Photo URL (optional)"
              className="rounded-xl border border-slate-300 px-3 py-2.5"
            />
            <input
              type="url"
              value={form.aadhaar_url}
              onChange={(event) => setForm((prev) => ({ ...prev, aadhaar_url: event.target.value }))}
              placeholder="Aadhaar URL (optional)"
              className="rounded-xl border border-slate-300 px-3 py-2.5"
            />
            <input
              type="url"
              value={form.bank_url}
              onChange={(event) => setForm((prev) => ({ ...prev, bank_url: event.target.value }))}
              placeholder="Bank passbook URL (optional)"
              className="rounded-xl border border-slate-300 px-3 py-2.5"
            />
          </div>
          <button
            type="submit"
            className="mt-3 rounded-full bg-[var(--teal)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_20px_34px_rgba(139,123,255,0.22)]"
          >
            Register Worker
          </button>
        </form>
      ) : null}

      <div className="surface-panel rounded-2xl p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="text"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value.trim().toLowerCase());
              setPage(1);
            }}
            placeholder="Filter category"
            className="rounded-xl border border-slate-300 px-3 py-2.5"
          />
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-300 px-3 py-2.5"
          >
            <option value="">All status</option>
            <option value="active">active</option>
            <option value="busy">busy</option>
            <option value="inactive">inactive</option>
            <option value="suspended">suspended</option>
          </select>
          <select
            value={approvalStatus}
            onChange={(event) => {
              setApprovalStatus(event.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-300 px-3 py-2.5"
          >
            <option value="">All approval status</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setCategory('');
              setStatus('');
              setApprovalStatus('');
              setPage(1);
            }}
            className="surface-card rounded-full px-3 py-2.5 text-sm font-medium text-slate-700"
          >
            Reset Filters
          </button>
        </div>

        {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 space-y-3">
          {workers.map((worker) => (
            <motion.div
              key={worker.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="surface-card rounded-xl px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{worker.name}</p>
                  <p className="text-xs text-slate-500">
                    #{worker.id} | {worker.phone} | {worker.category} | {worker.block}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    label={worker.approvalStatus}
                    tone={worker.approvalStatus === 'APPROVED' ? 'success' : worker.approvalStatus === 'REJECTED' ? 'danger' : 'warning'}
                  />
                  <StatusPill
                    label={worker.status}
                    tone={worker.status === 'active' ? 'success' : worker.status === 'busy' ? 'info' : worker.status === 'suspended' ? 'danger' : 'default'}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Available: {worker.isAvailable ? 'yes' : 'no'}</span>
                <span>Rating: {worker.rating}</span>
                <span>Active Jobs: {worker.activeJobs}</span>
                <span>Total Jobs: {worker.totalJobs}</span>
              </div>

              {canReviewWorkers ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {worker.approvalStatus === 'PENDING' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => updateApproval(worker.id, 'APPROVED')}
                        className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-[0_16px_28px_rgba(15,158,116,0.2)]"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => updateApproval(worker.id, 'REJECTED')}
                        className="rounded-full bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-[0_16px_28px_rgba(218,72,107,0.2)]"
                      >
                        Reject
                      </button>
                    </>
                  ) : null}

                  {worker.approvalStatus === 'APPROVED' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => updateOperationalStatus(worker.id, 'active', true)}
                        className="surface-card rounded-full px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Mark Active
                      </button>
                      <button
                        type="button"
                        onClick={() => updateOperationalStatus(worker.id, 'suspended', false)}
                        className="surface-card rounded-full px-3 py-2 text-xs font-semibold text-slate-700"
                      >
                        Suspend
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </motion.div>
          ))}

          {workers.length === 0 ? <p className="text-sm text-slate-500">No workers found for current filters.</p> : null}
        </div>

        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((prev) => Math.max(prev - 1, 1))}
            onNext={() => setPage((prev) => Math.min(prev + 1, totalPages))}
          />
        </div>
      </div>
    </div>
  );
}

export default Workers;
