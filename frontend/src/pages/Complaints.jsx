import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import PageTitle from '../components/PageTitle.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusPill from '../components/StatusPill.jsx';
import { InlineSpinner } from '../components/Spinner.jsx';
import api, { cachedGet, getApiErrorMessage } from '../utils/api.js';

function Complaints() {
  const { user } = useAuth();
  const toast = useToast();
  const hasLoadedComplaintsRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [complaints, setComplaints] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    orderId: '',
    workerId: '',
    type: 'absent',
    details: '',
  });

  const canCreate = user?.role === 'CUSTOMER';
  const canResolve = user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN';

  async function fetchComplaints(options = {}) {
    const { force = false, background = false } = options;
    const showBackgroundLoader = background || hasLoadedComplaintsRef.current;

    if (showBackgroundLoader) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const response = await cachedGet(`/complaints?page=${page}`, { skipErrorToast: true }, { ttl: 10_000, force });
      setComplaints(response.data.complaints || []);
      setTotalPages(response.data.totalPages || 1);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load complaints');
      setComplaints([]);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedComplaintsRef.current = true;
    }
  }

  useEffect(() => {
    fetchComplaints();
  }, [page]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await api.post('/complaints', {
        orderId: Number(form.orderId),
        workerId: form.workerId ? Number(form.workerId) : undefined,
        type: form.type,
        details: form.details,
      });
      toast.success('Complaint submitted.');
      setForm({ orderId: '', workerId: '', type: 'absent', details: '' });
      await fetchComplaints({ force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to submit complaint'));
    }
  }

  async function resolveComplaint(complaintId, status) {
    const resolution = window.prompt('Resolution note', 'Reviewed and resolved by admin');
    if (!resolution) return;

    setError('');
    try {
      await api.patch(`/complaints/${complaintId}/resolve`, { status, resolution });
      toast.success(`Complaint #${complaintId} updated.`);
      await fetchComplaints({ force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to update complaint'));
    }
  }

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Complaints" subtitle="Absent, poor quality, or misconduct issues with admin review workflow" />

      {refreshing ? <InlineSpinner label="Refreshing complaints..." /> : null}

      {canCreate ? (
        <form onSubmit={handleSubmit} className="surface-panel rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">Raise Complaint</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="number"
              min={1}
              value={form.orderId}
              onChange={(event) => setForm((prev) => ({ ...prev, orderId: event.target.value }))}
              placeholder="Order ID"
              className="rounded-xl border border-slate-300 px-3 py-2.5"
              required
            />
            <input
              type="number"
              min={1}
              value={form.workerId}
              onChange={(event) => setForm((prev) => ({ ...prev, workerId: event.target.value }))}
              placeholder="Worker ID (optional)"
              className="rounded-xl border border-slate-300 px-3 py-2.5"
            />
            <select
              value={form.type}
              onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2.5"
            >
              <option value="absent">absent</option>
              <option value="poor_quality">poor_quality</option>
              <option value="misconduct">misconduct</option>
            </select>
          </div>
          <textarea
            value={form.details}
            onChange={(event) => setForm((prev) => ({ ...prev, details: event.target.value }))}
            rows={3}
            className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5"
            placeholder="Complaint details"
            required
          />
          <button type="submit" className="mt-3 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_20px_34px_rgba(18,8,15,0.16)]">
            Submit Complaint
          </button>
        </form>
      ) : null}

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="surface-panel rounded-2xl p-5">
        <div className="space-y-3">
          {complaints.map((complaint) => (
            <article key={complaint.id} className="surface-card rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  Complaint #{complaint.id} | Order #{complaint.order?.id} | Type: {complaint.type}
                </p>
                <StatusPill
                  label={complaint.status}
                  tone={complaint.status === 'RESOLVED' ? 'success' : complaint.status === 'REVIEWED' ? 'info' : 'warning'}
                />
              </div>
              <p className="mt-2 text-sm text-slate-700">{complaint.details}</p>
              <p className="mt-1 text-xs text-slate-500">Resolution: {complaint.resolution || 'Pending review'}</p>

              {canResolve ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => resolveComplaint(complaint.id, 'REVIEWED')}
                    className="surface-card rounded-full px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    Mark Reviewed
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveComplaint(complaint.id, 'RESOLVED')}
                    className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-[0_16px_28px_rgba(15,158,116,0.2)]"
                  >
                    Resolve
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {complaints.length === 0 ? <p className="text-sm text-slate-500">No complaints found.</p> : null}
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

export default Complaints;
