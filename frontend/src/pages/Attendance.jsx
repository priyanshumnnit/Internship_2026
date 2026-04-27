import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import PageTitle from '../components/PageTitle.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusPill from '../components/StatusPill.jsx';
import { InlineSpinner } from '../components/Spinner.jsx';
import api, { cachedGet, getApiErrorMessage } from '../utils/api.js';

function Attendance() {
  const { user } = useAuth();
  const toast = useToast();
  const hasLoadedAttendanceRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [attendances, setAttendances] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');

  const [markForm, setMarkForm] = useState({
    workerId: '',
    orderId: '',
    date: '',
    status: 'present',
  });

  const [confirmForm, setConfirmForm] = useState({
    orderId: '',
    date: '',
    confirmed: 'yes',
    complaintType: 'poor_quality',
    complaintDetails: '',
  });

  const canMarkAttendance = user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN';
  const canConfirmAttendance = user?.role === 'CUSTOMER';

  async function fetchAttendance(options = {}) {
    const { force = false, background = false } = options;
    const showBackgroundLoader = background || hasLoadedAttendanceRef.current;

    if (showBackgroundLoader) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const response = await cachedGet(`/attendance?page=${page}`, { skipErrorToast: true }, { ttl: 10_000, force });
      setAttendances(response.data.attendances || []);
      setTotalPages(response.data.totalPages || 1);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load attendance');
      setAttendances([]);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedAttendanceRef.current = true;
    }
  }

  useEffect(() => {
    fetchAttendance();
  }, [page]);

  async function handleMarkSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await api.post('/attendance/mark', {
        workerId: Number(markForm.workerId),
        orderId: Number(markForm.orderId),
        date: markForm.date,
        status: markForm.status,
      });
      toast.success('Attendance marked successfully.');
      await fetchAttendance({ force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to mark attendance'));
    }
  }

  async function handleConfirmSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await api.post('/attendance/confirm', {
        orderId: Number(confirmForm.orderId),
        date: confirmForm.date,
        confirmed: confirmForm.confirmed === 'yes',
        complaintType: confirmForm.complaintType,
        complaintDetails: confirmForm.complaintDetails,
      });
      toast.success('Attendance confirmation submitted.');
      await fetchAttendance({ force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to confirm attendance'));
    }
  }

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Attendance"
        subtitle="Admin marks attendance per worker/order/date. Customer confirms day-level attendance."
      />

      {refreshing ? <InlineSpinner label="Refreshing attendance..." /> : null}

      {canMarkAttendance ? (
        <form onSubmit={handleMarkSubmit} className="surface-panel rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">Mark Attendance</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="number"
              min={1}
              value={markForm.workerId}
              onChange={(event) => setMarkForm((prev) => ({ ...prev, workerId: event.target.value }))}
              placeholder="Worker ID"
              className="rounded-xl border border-slate-300 px-3 py-2.5"
              required
            />
            <input
              type="number"
              min={1}
              value={markForm.orderId}
              onChange={(event) => setMarkForm((prev) => ({ ...prev, orderId: event.target.value }))}
              placeholder="Order ID"
              className="rounded-xl border border-slate-300 px-3 py-2.5"
              required
            />
            <input
              type="date"
              value={markForm.date}
              onChange={(event) => setMarkForm((prev) => ({ ...prev, date: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2.5"
              required
            />
            <select
              value={markForm.status}
              onChange={(event) => setMarkForm((prev) => ({ ...prev, status: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2.5"
            >
              <option value="present">present</option>
              <option value="absent">absent</option>
            </select>
          </div>
          <button type="submit" className="mt-3 rounded-full bg-[var(--teal)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_20px_34px_rgba(139,123,255,0.22)]">
            Save Attendance
          </button>
        </form>
      ) : null}

      {canConfirmAttendance ? (
        <form onSubmit={handleConfirmSubmit} className="surface-panel rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">Customer Confirmation</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              type="number"
              min={1}
              value={confirmForm.orderId}
              onChange={(event) => setConfirmForm((prev) => ({ ...prev, orderId: event.target.value }))}
              placeholder="Order ID"
              className="rounded-xl border border-slate-300 px-3 py-2.5"
              required
            />
            <input
              type="date"
              value={confirmForm.date}
              onChange={(event) => setConfirmForm((prev) => ({ ...prev, date: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2.5"
              required
            />
            <select
              value={confirmForm.confirmed}
              onChange={(event) => setConfirmForm((prev) => ({ ...prev, confirmed: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2.5"
            >
              <option value="yes">YES - attendance is correct</option>
              <option value="no">NO - create dispute</option>
            </select>
            <select
              value={confirmForm.complaintType}
              onChange={(event) => setConfirmForm((prev) => ({ ...prev, complaintType: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2.5"
              disabled={confirmForm.confirmed === 'yes'}
            >
              <option value="absent">absent</option>
              <option value="poor_quality">poor_quality</option>
              <option value="misconduct">misconduct</option>
            </select>
          </div>
          <textarea
            value={confirmForm.complaintDetails}
            onChange={(event) => setConfirmForm((prev) => ({ ...prev, complaintDetails: event.target.value }))}
            placeholder="Required only when confirmation = NO"
            disabled={confirmForm.confirmed === 'yes'}
            rows={3}
            className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
          <button type="submit" className="mt-3 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_20px_34px_rgba(18,8,15,0.16)]">
            Submit Confirmation
          </button>
        </form>
      ) : null}

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="surface-panel rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-slate-900">Attendance Records</h2>
        <div className="mt-3 space-y-3">
          {attendances.map((item) => (
            <article key={item.id} className="surface-card rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  Worker #{item.worker?.id} ({item.worker?.name}) | Order #{item.order?.id}
                </p>
                <StatusPill
                  label={item.status}
                  tone={item.status === 'present' ? 'success' : 'danger'}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                <span>Date: {new Date(item.date).toLocaleDateString()}</span>
                <span>Customer confirmed: {item.customerConfirmed == null ? 'pending' : String(item.customerConfirmed)}</span>
                <span>Verified: {String(item.confirmed)}</span>
              </div>
            </article>
          ))}
          {attendances.length === 0 ? <p className="text-sm text-slate-500">No attendance records found.</p> : null}
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

export default Attendance;
