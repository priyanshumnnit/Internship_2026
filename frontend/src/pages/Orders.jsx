import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import PageTitle from '../components/PageTitle.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusPill from '../components/StatusPill.jsx';
import { InlineSpinner } from '../components/Spinner.jsx';
import api, { cachedGet, getApiErrorMessage } from '../utils/api.js';

const orderStatuses = ['pending', 'assigned', 'ongoing', 'completed', 'cancelled'];

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function iso(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString();
}

function Orders() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const hasLoadedOrdersRef = useRef(false);
  const hasLoadedDetailRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    category: 'plumbing',
    workers_count: 1,
    start_date: '',
    duration_days: 1,
    serviceAddress: '',
  });

  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailRefreshing, setDetailRefreshing] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityRows, setAvailabilityRows] = useState([]);
  const [assigningWorkerId, setAssigningWorkerId] = useState(null);
  const [assignmentRange, setAssignmentRange] = useState({ fromDate: '', toDate: '', workerIdFilter: '' });
  const [attendanceRequestDate, setAttendanceRequestDate] = useState('');
  const [attendanceResponseForms, setAttendanceResponseForms] = useState({});

  const canCreateOrder = user?.role === 'CUSTOMER';
  const canAssign = user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN';
  const canForceStatus = user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN';
  const deferredCategoryFilter = useDeferredValue(categoryFilter);
  const savedAddress = user?.address || '';

  const queryString = useMemo(() => {
    const query = new URLSearchParams({ page: String(page) });
    if (statusFilter) query.set('status', statusFilter);
    if (deferredCategoryFilter) query.set('category', deferredCategoryFilter);
    return query.toString();
  }, [deferredCategoryFilter, page, statusFilter]);

  const groupedSchedule = useMemo(() => {
    if (!selectedOrderDetail?.orderWorkerDays) return [];
    const map = new Map();
    for (const row of selectedOrderDetail.orderWorkerDays) {
      const dateKey = iso(row.workDate);
      const group = map.get(dateKey) || [];
      group.push(row);
      map.set(dateKey, group);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [selectedOrderDetail]);

  async function fetchOrders(options = {}) {
    const { force = false, background = false } = options;
    const showBackgroundLoader = background || hasLoadedOrdersRef.current;

    if (showBackgroundLoader) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      const response = await cachedGet(`/orders?${queryString}`, { skipErrorToast: true }, { ttl: 10_000, force });
      setOrders(response.data.orders || []);
      setTotalPages(response.data.totalPages || 1);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load orders');
      setOrders([]);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedOrdersRef.current = true;
    }
  }

  async function fetchOrderDetail(orderId, options = {}) {
    const { force = false, background = false } = options;
    const showBackgroundLoader = background || (hasLoadedDetailRef.current && Boolean(selectedOrderDetail));

    if (showBackgroundLoader) {
      setDetailRefreshing(true);
    } else {
      setDetailLoading(true);
    }
    setError('');
    try {
      const response = await cachedGet(`/orders/${orderId}`, { skipErrorToast: true }, { ttl: 10_000, force });
      const detail = response.data.order;
      setSelectedOrderDetail(detail);
      setAssignmentRange({
        fromDate: iso(detail.startDate),
        toDate: detail.endDate ? iso(detail.endDate) : iso(detail.startDate),
        workerIdFilter: '',
      });
      setAttendanceRequestDate(iso(detail.startDate));
      setAvailabilityRows([]);
      hasLoadedDetailRef.current = true;
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load order details');
      setSelectedOrderDetail(null);
      setError(message);
      toast.error(message);
    } finally {
      setDetailLoading(false);
      setDetailRefreshing(false);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, [queryString]);

  useEffect(() => {
    const focusOrderId = Number(searchParams.get('focusOrderId'));
    if (!focusOrderId || Number.isNaN(focusOrderId)) return;
    if (selectedOrderId === focusOrderId) return;

    setSelectedOrderId(focusOrderId);
    fetchOrderDetail(focusOrderId, { force: true });
    setSearchParams({}, { replace: true });
  }, [searchParams, selectedOrderId]);

  async function handleCreateOrder(event) {
    event.preventDefault();
    setError('');
    try {
      await api.post('/orders', form);
      toast.success('Order created. Please complete payment to activate assignment.');
      setPage(1);
      await fetchOrders({ force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to create order'));
    }
  }

  async function handlePayNow(order) {
    setError('');

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error('Unable to load Razorpay checkout script');
        return;
      }

      const intentResponse = await api.post(`/orders/${order.id}/payment-intent`);
      const { keyId, razorpayOrderId, amount, currency } = intentResponse.data;

      const options = {
        key: keyId,
        amount,
        currency,
        name: 'ShramSangam',
        description: `Order #${order.id} service payment`,
        order_id: razorpayOrderId,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        handler: async (response) => {
          try {
            await api.post(`/orders/${order.id}/payment-verify`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success(`Payment successful for Order #${order.id}.`);
            await fetchOrders({ force: true, background: true });
            if (selectedOrderId === order.id) {
              await fetchOrderDetail(order.id, { force: true, background: true });
            }
          } catch (verifyError) {
            toast.error(getApiErrorMessage(verifyError, 'Payment verification failed'));
          }
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', (response) => {
        toast.error(response?.error?.description || 'Payment failed');
      });
      razorpay.open();
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to initiate payment'));
    }
  }

  async function loadAvailability(options = {}) {
    const { force = true } = options;
    if (!selectedOrderDetail) return;
    if (!assignmentRange.fromDate || !assignmentRange.toDate) {
      toast.error('Select from and to dates before checking worker availability.');
      return;
    }
    setAvailabilityLoading(true);
    setError('');
    try {
      const response = await cachedGet(`/orders/${selectedOrderDetail.id}/assignment-availability`, {
        params: {
          fromDate: assignmentRange.fromDate,
          toDate: assignmentRange.toDate,
          workerId: assignmentRange.workerIdFilter || undefined,
        },
        skipErrorToast: true,
      }, { ttl: 5_000, force });
      setAvailabilityRows(response.data.workers || []);
      if (!response.data.workers?.length) {
        toast.info('No matching workers found for this filter and date range.');
      }
    } catch (requestError) {
      setAvailabilityRows([]);
      toast.error(getApiErrorMessage(requestError, 'Unable to fetch worker availability'));
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function assignWorker(workerId) {
    if (!selectedOrderDetail) return;
    if (!assignmentRange.fromDate || !assignmentRange.toDate) {
      toast.error('Select from and to dates before assigning workers.');
      return;
    }
    setError('');
    setAssigningWorkerId(workerId);
    try {
      const response = await api.post(`/orders/${selectedOrderDetail.id}/assignments`, {
        workerId,
        fromDate: assignmentRange.fromDate,
        toDate: assignmentRange.toDate,
      });
      const skippedDates = response.data?.skippedDates || [];
      toast.success(
        skippedDates.length
          ? `Worker #${workerId} assigned partially. Skipped ${skippedDates.length} conflicting date(s).`
          : `Worker #${workerId} assigned for selected date range.`,
      );
      await fetchOrderDetail(selectedOrderDetail.id, { force: true, background: true });
      await loadAvailability({ force: true });
      await fetchOrders({ force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to assign worker'));
    } finally {
      setAssigningWorkerId(null);
    }
  }

  async function removeWorkerForDate(workerId, date) {
    const reason = window.prompt('Reason for removing this worker from selected date:');
    if (!reason) return;
    setError('');
    try {
      await api.delete(`/orders/${selectedOrderDetail.id}/assignments`, {
        data: {
          workerId,
          fromDate: date,
          toDate: date,
          reason,
        },
      });
      toast.success(`Worker #${workerId} removed from ${date}.`);
      await fetchOrderDetail(selectedOrderDetail.id, { force: true, background: true });
      await loadAvailability({ force: true });
      await fetchOrders({ force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to remove assignment'));
    }
  }

  async function requestAttendance() {
    if (!selectedOrderDetail || !attendanceRequestDate) return;
    setError('');
    try {
      await api.post(`/orders/${selectedOrderDetail.id}/attendance-request`, { date: attendanceRequestDate });
      toast.success(`Attendance request sent for ${attendanceRequestDate}.`);
      await fetchOrderDetail(selectedOrderDetail.id, { force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to request attendance'));
    }
  }

  async function respondAttendance(requestRow, confirmed) {
    const formState = attendanceResponseForms[requestRow.id] || {
      feedback: '',
      complaintType: 'poor_quality',
      complaintDetails: '',
    };

    setError('');
    try {
      await api.post(`/orders/${selectedOrderDetail.id}/customer-attendance-response`, {
        date: iso(requestRow.date),
        confirmed,
        feedback: formState.feedback,
        complaintType: formState.complaintType,
        complaintDetails: formState.complaintDetails,
      });
      toast.success(confirmed ? 'Attendance confirmed.' : 'Attendance disputed and complaint raised.');
      await fetchOrderDetail(selectedOrderDetail.id, { force: true, background: true });
      await fetchOrders({ force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to submit attendance response'));
    }
  }

  async function updateOrderStatus(orderId, status) {
    const reason = ['completed', 'cancelled'].includes(status)
      ? window.prompt(`Reason for marking order as ${status}:`)
      : '';
    if (['completed', 'cancelled'].includes(status) && !reason) return;

    setError('');
    try {
      await api.patch(`/orders/${orderId}/status`, { status, reason });
      toast.success(`Order #${orderId} updated to ${status}.`);
      await fetchOrders({ force: true, background: true });
      if (selectedOrderId === orderId) await fetchOrderDetail(orderId, { force: true, background: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to update order status'));
    }
  }

  if (loading) return <LoadingSkeleton rows={4} />;

  return (
    <div className="space-y-5">
      <PageTitle title="Orders" subtitle="Paid booking, date-wise assignment, and attendance-confirmation workflow" />

      {refreshing ? <InlineSpinner label="Refreshing orders..." /> : null}

      {canCreateOrder ? (
        <form onSubmit={handleCreateOrder} className="surface-panel rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">Create Service Booking</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Category</span>
              <select value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5">
                <option value="plumbing">plumbing</option>
                <option value="electrician">electrician</option>
                <option value="painting">painting</option>
                <option value="cleaning">cleaning</option>
              </select>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Total Workers Required</span>
              <input type="number" min={1} value={form.workers_count} onChange={(event) => setForm((prev) => ({ ...prev, workers_count: Number(event.target.value) || 1 }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Enter number of workers (e.g. 2)" />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Start Date</span>
              <input type="date" value={form.start_date} onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" required />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Duration (in days)</span>
              <input type="number" min={1} value={form.duration_days} onChange={(event) => setForm((prev) => ({ ...prev, duration_days: Number(event.target.value) || 1 }))} className="w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="Enter number of days (e.g. 3)" />
            </label>
            <label className="text-sm text-slate-700 sm:col-span-2 lg:col-span-4">
              <span className="mb-1 block font-medium">Service Address</span>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, serviceAddress: savedAddress }))}
                  disabled={!savedAddress}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Use Saved Address
                </button>
                <span className="text-xs text-slate-500">
                  {savedAddress ? 'Pull the full address from your profile into this order form.' : 'Add a saved address in Profile to enable one-tap autofill.'}
                </span>
              </div>
              <textarea
                rows={3}
                value={form.serviceAddress}
                onChange={(event) => setForm((prev) => ({ ...prev, serviceAddress: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                placeholder="Enter the full address where the worker should report"
                required
              />
            </label>
          </div>
          <button type="submit" className="mt-3 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">Create Order</button>
        </form>
      ) : null}

      <div className="surface-panel rounded-2xl p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-300 px-3 py-2.5">
            <option value="">All statuses</option>
            {orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <input type="text" value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value.trim().toLowerCase()); setPage(1); }} placeholder="Filter category" className="rounded-xl border border-slate-300 px-3 py-2.5" />
          <button type="button" onClick={() => { setStatusFilter(''); setCategoryFilter(''); setPage(1); }} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700">Reset Filters</button>
        </div>

        {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 space-y-3">
          {orders.map((order) => (
            <motion.article key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="surface-card rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Order #{order.id} - {order.category}</p>
                  <p className="text-xs text-slate-500">Block: {order.block} | Start: {formatDate(order.startDate)} | End: {order.endDate ? formatDate(order.endDate) : '-'}</p>
                  <p className="mt-1 text-xs text-slate-500">Service address: {order.serviceAddress}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label={order.status} tone={order.status === 'completed' ? 'success' : order.status === 'cancelled' ? 'danger' : 'info'} />
                  <StatusPill label={`payment: ${order.customerPaymentStatus}`} tone={order.customerPaymentStatus === 'paid' ? 'success' : order.customerPaymentStatus === 'failed' ? 'danger' : 'warning'} />
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                <span>Workers required: {order.workersCount}</span>
                <span>Duration: {order.durationDays} day(s)</span>
                <span>Total: INR {order.total}</span>
                <span>Assignment coverage: {order.assignmentCoverage}%</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {user?.role === 'CUSTOMER' && order.customerPaymentStatus !== 'paid' ? (
                  <button type="button" onClick={() => handlePayNow(order)} className="rounded-full bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-white shadow-[0_16px_28px_rgba(255,122,64,0.2)]">Pay With Razorpay</button>
                ) : null}
                <button type="button" onClick={() => { setSelectedOrderId(order.id); fetchOrderDetail(order.id, { force: true }); }} className="surface-card rounded-full px-3 py-2 text-xs font-semibold text-slate-700">Open Details</button>
                {canForceStatus ? (
                  <>
                    <button type="button" onClick={() => updateOrderStatus(order.id, 'assigned')} className="surface-card rounded-full px-3 py-2 text-xs font-semibold text-slate-700">Force Assigned</button>
                    <button type="button" onClick={() => updateOrderStatus(order.id, 'ongoing')} className="surface-card rounded-full px-3 py-2 text-xs font-semibold text-slate-700">Force Ongoing</button>
                    <button type="button" onClick={() => updateOrderStatus(order.id, 'completed')} className="surface-card rounded-full px-3 py-2 text-xs font-semibold text-slate-700">Mark Completed</button>
                    <button type="button" onClick={() => updateOrderStatus(order.id, 'cancelled')} className="rounded-full border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Cancel</button>
                  </>
                ) : null}
              </div>
            </motion.article>
          ))}
          {orders.length === 0 ? <p className="text-sm text-slate-500">No orders found.</p> : null}
        </div>

        <div className="mt-4">
          <Pagination page={page} totalPages={totalPages} onPrev={() => setPage((prev) => Math.max(prev - 1, 1))} onNext={() => setPage((prev) => Math.min(prev + 1, totalPages))} />
        </div>
      </div>

      {selectedOrderId && detailLoading ? <LoadingSkeleton rows={3} /> : null}

      {selectedOrderDetail ? (
        <section className="surface-panel space-y-4 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Order #{selectedOrderDetail.id} Detail</h2>
              <p className="text-sm text-slate-500">Service address: {selectedOrderDetail.serviceAddress}</p>
            </div>
            <button type="button" onClick={() => { setSelectedOrderId(null); setSelectedOrderDetail(null); }} className="surface-card rounded-full px-3 py-2 text-xs font-semibold text-slate-700">Close</button>
          </div>

          {detailRefreshing ? <InlineSpinner label="Refreshing order details..." /> : null}

          {canAssign ? (
            <div className="surface-card rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900">Assign Workers by Date Range</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <input type="date" value={assignmentRange.fromDate} onChange={(event) => setAssignmentRange((prev) => ({ ...prev, fromDate: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                <input type="date" value={assignmentRange.toDate} onChange={(event) => setAssignmentRange((prev) => ({ ...prev, toDate: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                <input type="number" value={assignmentRange.workerIdFilter} onChange={(event) => setAssignmentRange((prev) => ({ ...prev, workerIdFilter: event.target.value }))} placeholder="Search worker ID" className="rounded-xl border border-slate-300 px-3 py-2.5" />
                <button type="button" onClick={loadAvailability} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Find Availability</button>
              </div>
              <div className="mt-3 grid gap-2">
                {availabilityLoading ? <InlineSpinner label="Loading available workers..." /> : null}
                {availabilityRows.map((worker) => (
                  <div key={worker.id} className="surface-soft flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2">
                    <p className="text-sm text-slate-800">#{worker.id} {worker.name} ({worker.phone}) | Available {worker.availableDateCount}/{worker.requestedDateCount}</p>
                    <button
                      type="button"
                      onClick={() => assignWorker(worker.id)}
                      disabled={worker.availableDateCount === 0 || assigningWorkerId === worker.id}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold text-white ${worker.availableDateCount === 0 || assigningWorkerId === worker.id ? 'cursor-not-allowed bg-slate-400' : 'bg-[var(--teal)] shadow-[0_16px_28px_rgba(139,123,255,0.22)]'}`}
                    >
                      {assigningWorkerId === worker.id ? 'Assigning...' : worker.availableDateCount === 0 ? 'Unavailable' : 'Assign'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {canAssign ? (
            <div className="surface-card rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900">Request Daily Attendance Confirmation</h3>
              <div className="mt-3 flex flex-wrap gap-3">
                <input type="date" value={attendanceRequestDate} onChange={(event) => setAttendanceRequestDate(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2.5" />
                <button type="button" onClick={requestAttendance} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Request Attendance</button>
              </div>
            </div>
          ) : null}

          <div className="surface-card rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-900">Assigned Worker Schedule</h3>
            <div className="mt-3 space-y-3">
              {groupedSchedule.map(([date, rows]) => (
                <div key={date} className="surface-soft rounded-xl p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{date}</p>
                  <div className="mt-2 space-y-2">
                    {rows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm">
                        <p>#{row.worker.id} {row.worker.name} ({row.worker.phone})</p>
                        {canAssign ? <button type="button" onClick={() => removeWorkerForDate(row.worker.id, date)} className="rounded-full border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">Remove</button> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {groupedSchedule.length === 0 ? <p className="text-sm text-slate-500">No active assignments yet.</p> : null}
            </div>
          </div>

          {user?.role === 'CUSTOMER' ? (
            <div className="surface-card rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900">Pending Attendance Confirmations</h3>
              <div className="mt-3 space-y-3">
                {(selectedOrderDetail.attendanceRequests || []).filter((request) => request.status === 'REQUESTED').map((request) => {
                  const formState = attendanceResponseForms[request.id] || { feedback: '', complaintType: 'poor_quality', complaintDetails: '' };
                  return (
                    <div key={request.id} className="surface-soft rounded-xl p-3">
                      <p className="text-sm font-medium text-slate-900">Date: {formatDate(request.date)}</p>
                      <p className="mt-1 text-xs text-slate-500">Workers asked for confirmation: {(request.attendances || []).map((a) => `${a.worker?.name} (#${a.worker?.id})`).join(', ')}</p>
                      <textarea rows={2} value={formState.feedback} onChange={(event) => setAttendanceResponseForms((prev) => ({ ...prev, [request.id]: { ...formState, feedback: event.target.value } }))} placeholder="Optional feedback" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <select value={formState.complaintType} onChange={(event) => setAttendanceResponseForms((prev) => ({ ...prev, [request.id]: { ...formState, complaintType: event.target.value } }))} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
                          <option value="absent">absent</option>
                          <option value="poor_quality">poor_quality</option>
                          <option value="misconduct">misconduct</option>
                        </select>
                        <input value={formState.complaintDetails} onChange={(event) => setAttendanceResponseForms((prev) => ({ ...prev, [request.id]: { ...formState, complaintDetails: event.target.value } }))} placeholder="Complaint details (for NO)" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => respondAttendance(request, true)} className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-[0_16px_28px_rgba(15,158,116,0.2)]">Confirm YES</button>
                        <button type="button" onClick={() => respondAttendance(request, false)} className="rounded-full bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-[0_16px_28px_rgba(218,72,107,0.2)]">Confirm NO</button>
                      </div>
                    </div>
                  );
                })}
                {(selectedOrderDetail.attendanceRequests || []).filter((request) => request.status === 'REQUESTED').length === 0 ? <p className="text-sm text-slate-500">No pending attendance confirmations.</p> : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export default Orders;
