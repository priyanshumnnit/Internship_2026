import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ActionButton from '../components/ActionButton.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import PageTitle from '../components/PageTitle.jsx';
import Pagination from '../components/Pagination.jsx';
import StatusPill from '../components/StatusPill.jsx';
import { BusyOverlay, InlineSpinner } from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { cachedGet, getApiErrorMessage } from '../utils/api.js';

const statuses = ['pending', 'paid', 'failed'];
const ticketStatuses = ['OPEN', 'APPROVED', 'REJECTED', 'RESOLVED'];
const refundStatuses = ['PENDING', 'PROCESSED', 'CANCELLED'];

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatCurrency(value) {
  return `INR ${Number(value || 0).toLocaleString('en-IN')}`;
}

function buildRowForm(payment) {
  return {
    transactionRef: payment.transactionRef || '',
    transactionDate: payment.transactionDate ? new Date(payment.transactionDate).toISOString().slice(0, 10) : '',
    paymentNote: payment.paymentNote || '',
  };
}

function describeAuditChange(log) {
  const beforeState = log.beforeState || {};
  const afterState = log.afterState || {};
  const details = [];

  if (!log.afterState && log.beforeState) {
    return 'Payment record deleted after preserving the previous snapshot.';
  }

  if (beforeState.status !== afterState.status && (beforeState.status || afterState.status)) {
    details.push(`status ${beforeState.status || '-'} -> ${afterState.status || '-'}`);
  }
  if (beforeState.lockedByAdmin !== afterState.lockedByAdmin && (typeof beforeState.lockedByAdmin === 'boolean' || typeof afterState.lockedByAdmin === 'boolean')) {
    details.push(`locked ${String(beforeState.lockedByAdmin)} -> ${String(afterState.lockedByAdmin)}`);
  }
  if (beforeState.amount !== afterState.amount && beforeState.amount != null && afterState.amount != null) {
    details.push(`amount ${formatCurrency(beforeState.amount)} -> ${formatCurrency(afterState.amount)}`);
  }
  if (beforeState.transactionRef !== afterState.transactionRef) {
    details.push('transaction reference updated');
  }
  if (beforeState.transactionDate !== afterState.transactionDate) {
    details.push('transaction date updated');
  }

  return details.join(' | ') || 'State recorded for audit traceability.';
}

function ActionDialog({ dialog, loading, onClose, onChange, onSubmit }) {
  if (!dialog) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={loading ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="surface-panel relative w-full max-w-lg overflow-hidden rounded-3xl p-6"
        onClick={(event) => event.stopPropagation()}
      >
        {loading ? <BusyOverlay label={dialog.loadingLabel || 'Saving changes...'} className="rounded-3xl" /> : null}

        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{dialog.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{dialog.description}</p>
          </div>

          {dialog.helperText ? (
            <div className="surface-soft rounded-2xl px-4 py-3 text-sm text-slate-600">
              {dialog.helperText}
            </div>
          ) : null}

          {dialog.showAmount ? (
            <label className="grid gap-1">
              <span className="text-sm font-semibold text-slate-700">{dialog.amountLabel || 'Amount'}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={dialog.amount || ''}
                onChange={(event) => onChange({ amount: event.target.value, error: '' })}
                className="rounded-2xl border border-slate-300 px-3 py-2.5 text-sm"
                placeholder="Enter updated amount"
              />
            </label>
          ) : null}

          <label className="grid gap-1">
            <span className="text-sm font-semibold text-slate-700">{dialog.commentLabel || 'Comment'}</span>
            <textarea
              rows={5}
              value={dialog.comment || ''}
              onChange={(event) => onChange({ comment: event.target.value, error: '' })}
              className="min-h-[8rem] rounded-2xl border border-slate-300 px-3 py-2.5 text-sm"
              placeholder={dialog.commentPlaceholder || 'Write the reason for this action'}
            />
          </label>

          {dialog.error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{dialog.error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton type="button" tone="neutral" onClick={onClose} disabled={loading}>
              Cancel
            </ActionButton>
            <ActionButton type="button" tone={dialog.confirmTone || 'brand'} onClick={onSubmit} loading={loading}>
              {dialog.confirmLabel || 'Submit'}
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function Payments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const hasLoadedPaymentsRef = useRef(false);
  const hasLoadedRefundsRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [lockedFilter, setLockedFilter] = useState('');
  const [workerIdFilter, setWorkerIdFilter] = useState('');
  const [orderIdFilter, setOrderIdFilter] = useState('');
  const [todayPendingOnly, setTodayPendingOnly] = useState(false);
  const [error, setError] = useState('');
  const [rowForms, setRowForms] = useState({});
  const [actionLoading, setActionLoading] = useState({});
  const [historyByPayment, setHistoryByPayment] = useState({});
  const [historyLoading, setHistoryLoading] = useState({});
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketStatusFilter, setTicketStatusFilter] = useState('');
  const [refunds, setRefunds] = useState([]);
  const [refundSummary, setRefundSummary] = useState({
    processedAmount: 0,
    processedCount: 0,
    pendingAmount: 0,
    pendingCount: 0,
    cancelledCount: 0,
  });
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundRefreshing, setRefundRefreshing] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [refundPage, setRefundPage] = useState(1);
  const [refundTotalPages, setRefundTotalPages] = useState(1);
  const [refundStatusFilter, setRefundStatusFilter] = useState('');
  const [refundOrderIdFilter, setRefundOrderIdFilter] = useState('');
  const [refundForm, setRefundForm] = useState({
    orderId: '',
    amount: '',
    reason: '',
    note: '',
    status: 'PROCESSED',
    transactionRef: '',
    refundedAt: new Date().toISOString().slice(0, 10),
  });

  const deferredWorkerIdFilter = useDeferredValue(workerIdFilter);
  const deferredOrderIdFilter = useDeferredValue(orderIdFilter);
  const deferredRefundOrderIdFilter = useDeferredValue(refundOrderIdFilter);
  const canUpdate = user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN';
  const canRaiseTicket = user?.role === 'BLOCK_ADMIN';
  const canReviewTicket = user?.role === 'SUPER_ADMIN';
  const canViewRefunds = user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN';
  const canCreateRefunds = user?.role === 'SUPER_ADMIN';
  const dialogLoadingKey = dialog ? `dialog:${dialog.mode}:${dialog.ticketId || dialog.paymentId}` : '';
  const dialogLoading = dialogLoadingKey ? Boolean(actionLoading[dialogLoadingKey]) : false;

  function getRowForm(payment) {
    return rowForms[payment.id] || buildRowForm(payment);
  }

  function syncRowForm(payment) {
    if (!payment?.id) return;
    setRowForms((prev) => ({
      ...prev,
      [payment.id]: buildRowForm(payment),
    }));
  }

  function updateRowForm(paymentId, patch) {
    setRowForms((prev) => ({
      ...prev,
      [paymentId]: {
        ...(prev[paymentId] || {}),
        ...patch,
      },
    }));
  }

  function openDialog(config) {
    setDialog({ error: '', comment: '', ...config });
  }

  function closeDialog() {
    if (dialogLoading) return;
    setDialog(null);
  }

  async function runAction(actionKey, task) {
    setActionLoading((prev) => ({ ...prev, [actionKey]: true }));
    try {
      return await task();
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[actionKey];
        return next;
      });
    }
  }

  async function fetchPayments(options = {}) {
    const { force = false, background = false } = options;
    const showBackgroundLoader = background || hasLoadedPaymentsRef.current;

    if (showBackgroundLoader) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const query = new URLSearchParams({ page: String(page) });
      if (statusFilter) query.set('status', statusFilter);
      if (lockedFilter) query.set('locked', lockedFilter === 'locked' ? 'true' : 'false');
      if (deferredWorkerIdFilter) query.set('workerId', deferredWorkerIdFilter);
      if (deferredOrderIdFilter) query.set('orderId', deferredOrderIdFilter);
      if (todayPendingOnly) query.set('todayPendingOnly', 'true');

      const response = await cachedGet(`/payments?${query.toString()}`, { skipErrorToast: true }, { ttl: 10_000, force });
      const nextPayments = response.data.payments || [];

      setPayments(nextPayments);
      setTotalPages(response.data.totalPages || 1);
      setRowForms((prev) => {
        const next = {};
        nextPayments.forEach((payment) => {
          next[payment.id] = prev[payment.id] || buildRowForm(payment);
        });
        return next;
      });
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load payments');
      setPayments([]);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedPaymentsRef.current = true;
    }
  }

  async function fetchTickets(options = {}) {
    const { force = false } = options;
    if (!(canRaiseTicket || canReviewTicket)) return;

    setTicketLoading(true);
    try {
      const query = new URLSearchParams({ page: '1' });
      if (ticketStatusFilter) query.set('status', ticketStatusFilter);
      const response = await cachedGet(`/payments/tickets/list?${query.toString()}`, { skipErrorToast: true }, { ttl: 10_000, force });
      setTickets(response.data.tickets || []);
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to load payment disputes'));
      setTickets([]);
    } finally {
      setTicketLoading(false);
    }
  }

  async function fetchRefunds(options = {}) {
    if (!canViewRefunds) return;

    const {
      force = false,
      background = false,
      pageOverride = refundPage,
    } = options;
    const showBackgroundLoader = background || hasLoadedRefundsRef.current;

    if (showBackgroundLoader) {
      setRefundRefreshing(true);
    } else {
      setRefundLoading(true);
    }
    setRefundError('');

    try {
      const query = new URLSearchParams({ page: String(pageOverride) });
      if (refundStatusFilter) query.set('status', refundStatusFilter);
      if (deferredRefundOrderIdFilter) query.set('orderId', deferredRefundOrderIdFilter);

      const response = await cachedGet(`/refunds?${query.toString()}`, { skipErrorToast: true }, { ttl: 10_000, force });
      setRefunds(response.data.refunds || []);
      setRefundSummary(response.data.summary || {
        processedAmount: 0,
        processedCount: 0,
        pendingAmount: 0,
        pendingCount: 0,
        cancelledCount: 0,
      });
      setRefundTotalPages(response.data.totalPages || 1);
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load refunds');
      setRefunds([]);
      setRefundError(message);
      toast.error(message);
    } finally {
      setRefundLoading(false);
      setRefundRefreshing(false);
      hasLoadedRefundsRef.current = true;
    }
  }

  async function fetchHistory(paymentId, options = {}) {
    if (!paymentId) return;
    const { force = false } = options;

    setHistoryLoading((prev) => ({ ...prev, [paymentId]: true }));
    try {
      const response = await cachedGet(`/payments/${paymentId}/history`, { skipErrorToast: true }, { ttl: 10_000, force });
      setHistoryByPayment((prev) => ({
        ...prev,
        [paymentId]: response.data.logs || [],
      }));
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to load payment history'));
    } finally {
      setHistoryLoading((prev) => {
        const next = { ...prev };
        delete next[paymentId];
        return next;
      });
    }
  }

  async function refreshSurfaces(paymentId) {
    const tasks = [fetchPayments({ force: true, background: true })];

    if (canRaiseTicket || canReviewTicket) {
      tasks.push(fetchTickets({ force: true }));
    }
    if (paymentId && (expandedHistoryId === paymentId || historyByPayment[paymentId])) {
      tasks.push(fetchHistory(paymentId, { force: true }));
    }

    await Promise.all(tasks);
  }

  useEffect(() => {
    fetchPayments();
  }, [deferredOrderIdFilter, deferredWorkerIdFilter, page, statusFilter, lockedFilter, todayPendingOnly]);

  useEffect(() => {
    fetchTickets();
  }, [ticketStatusFilter, canRaiseTicket, canReviewTicket]);

  useEffect(() => {
    fetchRefunds();
  }, [canViewRefunds, deferredRefundOrderIdFilter, refundPage, refundStatusFilter]);

  const totals = useMemo(() => payments.reduce((acc, payment) => {
    acc.total += payment.amount;
    if (payment.status === 'paid') acc.paid += payment.amount;
    if (payment.status === 'pending') acc.pending += payment.amount;
    if (payment.status === 'failed') acc.failed += payment.amount;
    if (payment.lockedByAdmin) acc.lockedCount += 1;
    return acc;
  }, {
    total: 0,
    paid: 0,
    pending: 0,
    failed: 0,
    lockedCount: 0,
  }), [payments]);

  async function createRefund(event) {
    event.preventDefault();

    if (!refundForm.orderId.trim()) {
      toast.error('Order ID is required for refunds.');
      return;
    }
    const amount = Number(refundForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid refund amount.');
      return;
    }
    if (!refundForm.reason.trim()) {
      toast.error('Refund reason is required.');
      return;
    }

    await runAction('refund:create', async () => {
      await api.post('/refunds', {
        orderId: Number(refundForm.orderId),
        amount,
        reason: refundForm.reason,
        note: refundForm.note || null,
        status: refundForm.status,
        transactionRef: refundForm.transactionRef || null,
        refundedAt: refundForm.refundedAt || null,
      });

      toast.success('Refund recorded successfully.');
      setRefundForm({
        orderId: '',
        amount: '',
        reason: '',
        note: '',
        status: 'PROCESSED',
        transactionRef: '',
        refundedAt: new Date().toISOString().slice(0, 10),
      });
      setRefundPage(1);
      await fetchRefunds({ force: true, pageOverride: 1 });
    });
  }

  async function markPaid(payment) {
    const form = getRowForm(payment);
    const actionKey = `payment:${payment.id}:mark-paid`;

    return runAction(actionKey, async () => {
      const response = await api.patch(`/payments/${payment.id}`, {
        status: 'paid',
        transactionRef: form.transactionRef,
        transactionDate: form.transactionDate,
        paymentNote: form.paymentNote,
      });

      syncRowForm(response.data.payment);
      toast.success(`Payment #${payment.id} marked as paid and locked.`);
      await refreshSurfaces(payment.id);
    });
  }

  async function markFailed(payment) {
    const form = getRowForm(payment);
    const actionKey = `payment:${payment.id}:mark-failed`;

    return runAction(actionKey, async () => {
      const response = await api.patch(`/payments/${payment.id}`, {
        status: 'failed',
        paymentNote: form.paymentNote,
      });

      syncRowForm(response.data.payment);
      toast.success(`Payment #${payment.id} marked as failed.`);
      await refreshSurfaces(payment.id);
    });
  }

  async function handleDialogSubmit() {
    if (!dialog) return;

    if (!dialog.comment?.trim()) {
      setDialog((prev) => (prev ? { ...prev, error: 'Comment is required for this action.' } : prev));
      return;
    }

    if (dialog.mode === 'adjust-amount') {
      const amount = Number(dialog.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setDialog((prev) => (prev ? { ...prev, error: 'Enter a valid positive amount.' } : prev));
        return;
      }
    }

    try {
      await runAction(dialogLoadingKey, async () => {
        if (dialog.mode === 'unlock-payment') {
          const response = await api.post(`/payments/${dialog.paymentId}/unlock`, { comment: dialog.comment });
          syncRowForm(response.data.payment);
          toast.success(`Payment #${dialog.paymentId} unlocked for correction.`);
          setDialog(null);
          await refreshSurfaces(dialog.paymentId);
          return;
        }

        if (dialog.mode === 'relock-payment') {
          const payment = payments.find((item) => item.id === dialog.paymentId);
          if (!payment) {
            throw new Error('Payment is no longer available on this page.');
          }

          const form = getRowForm(payment);
          const response = await api.post(`/payments/${dialog.paymentId}/lock`, {
            comment: dialog.comment,
            transactionRef: form.transactionRef,
            transactionDate: form.transactionDate,
            paymentNote: form.paymentNote,
          });

          syncRowForm(response.data.payment);
          toast.success(`Payment #${dialog.paymentId} finalized and locked.`);
          setDialog(null);
          await refreshSurfaces(dialog.paymentId);
          return;
        }

        if (dialog.mode === 'raise-dispute') {
          await api.post(`/payments/${dialog.paymentId}/tickets`, { reason: dialog.comment });
          toast.success(`Dispute raised for payment #${dialog.paymentId}.`);
          setDialog(null);
          await refreshSurfaces(dialog.paymentId);
          return;
        }

        if (dialog.mode === 'adjust-amount') {
          const response = await api.patch(`/payments/${dialog.paymentId}`, {
            amount: Number(dialog.amount),
            editReason: dialog.comment,
          });

          syncRowForm(response.data.payment);
          toast.success(`Payment #${dialog.paymentId} amount updated.`);
          setDialog(null);
          await refreshSurfaces(dialog.paymentId);
          return;
        }

        if (dialog.mode === 'delete-payment') {
          await api.delete(`/payments/${dialog.paymentId}`, { data: { reason: dialog.comment } });
          toast.success(`Payment #${dialog.paymentId} deleted.`);
          if (expandedHistoryId === dialog.paymentId) {
            setExpandedHistoryId(null);
          }
          setDialog(null);
          await refreshSurfaces();
          return;
        }

        if (dialog.mode === 'review-ticket') {
          await api.patch(`/payments/tickets/${dialog.ticketId}/review`, {
            status: dialog.reviewStatus,
            adminNote: dialog.comment,
            resolutionAction: dialog.resolutionAction || undefined,
          });

          toast.success(`Dispute #${dialog.ticketId} updated to ${dialog.reviewStatus}.`);
          setDialog(null);
          await refreshSurfaces(dialog.paymentId);
        }
      });
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to complete action');
      setDialog((prev) => (prev ? { ...prev, error: message } : prev));
      toast.error(message);
    }
  }

  function toggleHistory(paymentId) {
    setExpandedHistoryId((current) => (current === paymentId ? null : paymentId));
    if (!historyByPayment[paymentId]) {
      fetchHistory(paymentId);
    }
  }

  if (loading) return <LoadingSkeleton rows={4} />;

  return (
    <>
      <div className="space-y-5">
        <PageTitle title="Payments" subtitle="Worker payouts, customer refunds, dispute tickets, and a full audit trail for every override" />

        {refreshing ? <InlineSpinner label="Refreshing payments and disputes..." /> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <article className="surface-panel rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Total</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(totals.total)}</p>
          </article>
          <article className="surface-panel rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Paid</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrency(totals.paid)}</p>
          </article>
          <article className="surface-panel rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pending</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{formatCurrency(totals.pending)}</p>
          </article>
          <article className="surface-panel rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Failed</p>
            <p className="mt-2 text-2xl font-bold text-rose-700">{formatCurrency(totals.failed)}</p>
          </article>
          <article className="surface-panel rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Locked Records</p>
            <p className="mt-2 text-2xl font-bold text-teal-700">{totals.lockedCount}</p>
          </article>
        </div>

        <div className="surface-panel rounded-2xl p-5">
          <div className="grid gap-3 md:grid-cols-6">
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-300 px-3 py-2.5">
              <option value="">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={lockedFilter} onChange={(event) => { setLockedFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-300 px-3 py-2.5">
              <option value="">All lock states</option>
              <option value="locked">Locked only</option>
              <option value="unlocked">Unlocked only</option>
            </select>
            <input value={workerIdFilter} onChange={(event) => { setWorkerIdFilter(event.target.value); setPage(1); }} placeholder="Search worker ID" className="rounded-xl border border-slate-300 px-3 py-2.5" />
            <input value={orderIdFilter} onChange={(event) => { setOrderIdFilter(event.target.value); setPage(1); }} placeholder="Search order ID" className="rounded-xl border border-slate-300 px-3 py-2.5" />
            <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700">
              <input type="checkbox" checked={todayPendingOnly} onChange={(event) => { setTodayPendingOnly(event.target.checked); setPage(1); }} />
              Pending Today
            </label>
            <ActionButton
              type="button"
              tone="neutral"
              size="md"
              onClick={() => {
                setStatusFilter('');
                setLockedFilter('');
                setWorkerIdFilter('');
                setOrderIdFilter('');
                setTodayPendingOnly(false);
                setPage(1);
              }}
            >
              Reset Filters
            </ActionButton>
          </div>

          {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          <div className="mt-4 space-y-3">
            {payments.map((payment) => {
              const form = getRowForm(payment);
              const latestDispute = payment.tickets?.[0];
              const historyOpen = expandedHistoryId === payment.id;
              const rowBusy = Object.keys(actionLoading).some((key) => key.includes(`:${payment.id}:`) || key.endsWith(`:${payment.id}`));
              const canEditRow = canUpdate && !payment.lockedByAdmin;

              return (
                <article key={payment.id} className="surface-card rounded-2xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">Payment #{payment.id} | Worker #{payment.worker?.id} {payment.worker?.name}</p>
                      <p className="text-xs text-slate-500">
                        Order #{payment.order?.id} | Date: {formatDate(payment.date)} | Amount: {formatCurrency(payment.amount)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Txn Ref: {payment.transactionRef || '-'} | Txn Date: {formatDate(payment.transactionDate)} | Locked: {String(payment.lockedByAdmin)}
                      </p>
                      {payment.lastEditReason ? <p className="text-xs text-slate-600">Last admin comment: {payment.lastEditReason}</p> : null}
                      {latestDispute ? <p className="text-xs text-amber-700">Open dispute #{latestDispute.id}: {latestDispute.reason}</p> : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill label={payment.status} tone={payment.status === 'paid' ? 'success' : payment.status === 'failed' ? 'danger' : 'warning'} />
                      <StatusPill label={payment.lockedByAdmin ? 'locked' : 'editable'} tone={payment.lockedByAdmin ? 'info' : 'warning'} />
                      <ActionButton type="button" tone="neutral" onClick={() => navigate(`/orders?focusOrderId=${payment.order?.id}`)}>
                        Open Order
                      </ActionButton>
                    </div>
                  </div>

                  {rowBusy ? <div className="mt-3"><InlineSpinner label="Applying payment update..." /></div> : null}

                  {canUpdate ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <input
                        value={form.transactionRef}
                        onChange={(event) => updateRowForm(payment.id, { transactionRef: event.target.value })}
                        placeholder="Reference No."
                        disabled={!canEditRow}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                      <input
                        type="date"
                        value={form.transactionDate}
                        onChange={(event) => updateRowForm(payment.id, { transactionDate: event.target.value })}
                        disabled={!canEditRow}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                      <input
                        value={form.paymentNote}
                        onChange={(event) => updateRowForm(payment.id, { paymentNote: event.target.value })}
                        placeholder="Payment note"
                        disabled={!canEditRow}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                    </div>
                  ) : null}

                  {canUpdate ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {payment.lockedByAdmin ? (
                        canReviewTicket ? (
                          <ActionButton
                            type="button"
                            tone="warning"
                            loading={Boolean(actionLoading[`dialog:unlock-payment:${payment.id}`])}
                            onClick={() => openDialog({
                              mode: 'unlock-payment',
                              paymentId: payment.id,
                              title: `Unlock payment #${payment.id}`,
                              description: 'Unlock this record so the payout details can be corrected. The unlock comment will be stored in payment history.',
                              helperText: 'After correcting transaction details, use "Finalize & Lock" to close the record again.',
                              commentLabel: 'Unlock comment',
                              commentPlaceholder: 'Explain why this locked payment is being reopened.',
                              confirmLabel: 'Unlock Payment',
                              confirmTone: 'warning',
                              loadingLabel: 'Unlocking payment...',
                            })}
                          >
                            Unlock
                          </ActionButton>
                        ) : null
                      ) : (
                        <ActionButton
                          type="button"
                          tone="success"
                          loading={Boolean(actionLoading[`payment:${payment.id}:mark-paid`]) || Boolean(actionLoading[`dialog:relock-payment:${payment.id}`])}
                          onClick={() => {
                            if (user?.role === 'SUPER_ADMIN') {
                              openDialog({
                                mode: 'relock-payment',
                                paymentId: payment.id,
                                title: `Finalize payment #${payment.id}`,
                                description: 'This will mark the payment as paid, store your final comment, and lock the record again for everyone.',
                                helperText: 'The current transaction reference, transaction date, and payment note from this row will be used.',
                                commentLabel: 'Finalization comment',
                                commentPlaceholder: 'Summarize what was corrected before locking the payment again.',
                                confirmLabel: 'Finalize & Lock',
                                confirmTone: 'brand',
                                loadingLabel: 'Finalizing payment...',
                              });
                              return;
                            }

                            markPaid(payment).catch((requestError) => {
                              toast.error(getApiErrorMessage(requestError, 'Unable to mark payment as paid'));
                            });
                          }}
                        >
                          {user?.role === 'SUPER_ADMIN' ? 'Finalize & Lock' : 'Mark Paid'}
                        </ActionButton>
                      )}

                      {!payment.lockedByAdmin ? (
                        <>
                          <ActionButton
                            type="button"
                            tone="danger"
                            loading={Boolean(actionLoading[`payment:${payment.id}:mark-failed`])}
                            onClick={() => {
                              markFailed(payment).catch((requestError) => {
                                toast.error(getApiErrorMessage(requestError, 'Unable to mark payment as failed'));
                              });
                            }}
                          >
                            Mark Failed
                          </ActionButton>
                          <ActionButton
                            type="button"
                            tone="neutral"
                            onClick={() => openDialog({
                              mode: 'adjust-amount',
                              paymentId: payment.id,
                              title: `Adjust amount for payment #${payment.id}`,
                              description: 'Amount edits are recorded in the audit trail so super admin and block admin can trace every override later.',
                              amount: String(payment.amount),
                              showAmount: true,
                              amountLabel: 'Updated amount',
                              commentLabel: 'Adjustment comment',
                              commentPlaceholder: 'Explain why this amount needs to change.',
                              confirmLabel: 'Save Amount',
                              confirmTone: 'brand',
                              loadingLabel: 'Saving amount...',
                            })}
                          >
                            Adjust Amount
                          </ActionButton>
                        </>
                      ) : null}

                      {canRaiseTicket && payment.lockedByAdmin ? (
                        <ActionButton
                          type="button"
                          tone="warning"
                          onClick={() => openDialog({
                            mode: 'raise-dispute',
                            paymentId: payment.id,
                            title: `Raise dispute for payment #${payment.id}`,
                            description: 'Block admin cannot unlock a finalized payment directly. Create a dispute so super admin can review and unlock it.',
                            commentLabel: 'Dispute reason',
                            commentPlaceholder: 'Describe what needs to be corrected before this payment can be reopened.',
                            confirmLabel: 'Create Dispute',
                            confirmTone: 'warning',
                            loadingLabel: 'Creating dispute...',
                          })}
                        >
                          Raise Dispute
                        </ActionButton>
                      ) : null}

                      <ActionButton type="button" tone="ghost" onClick={() => toggleHistory(payment.id)}>
                        {historyOpen ? 'Hide History' : 'View History'}
                      </ActionButton>

                      {canReviewTicket ? (
                        <ActionButton
                          type="button"
                          tone="danger"
                          onClick={() => openDialog({
                            mode: 'delete-payment',
                            paymentId: payment.id,
                            title: `Delete payment #${payment.id}`,
                            description: 'This is a destructive action. The delete reason will be preserved in the audit log before the payment record is removed.',
                            commentLabel: 'Delete reason',
                            commentPlaceholder: 'Explain why this payment record should be deleted.',
                            confirmLabel: 'Delete Payment',
                            confirmTone: 'danger',
                            loadingLabel: 'Deleting payment...',
                          })}
                        >
                          Delete
                        </ActionButton>
                      ) : null}
                    </div>
                  ) : null}

                  {historyOpen ? (
                    <div className="surface-soft mt-4 rounded-2xl p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">Payment History</h3>
                        <ActionButton type="button" tone="neutral" onClick={() => fetchHistory(payment.id, { force: true })}>
                          Refresh History
                        </ActionButton>
                      </div>

                      <div className="mt-3 space-y-3">
                        {historyLoading[payment.id] ? <InlineSpinner label="Loading payment history..." /> : null}
                        {(historyByPayment[payment.id] || []).map((log) => (
                          <div key={log.id} className="surface-card rounded-2xl p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">{log.action.replaceAll('_', ' ')}</p>
                              <p className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</p>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">By {log.actor?.name || log.actor?.email || `User #${log.actor?.id || '-'}`} ({log.actor?.role || 'UNKNOWN'})</p>
                            <p className="mt-2 text-sm text-slate-700">{log.comment || 'No explicit comment was submitted for this action.'}</p>
                            <p className="mt-2 text-xs text-slate-500">{describeAuditChange(log)}</p>
                            {log.ticket ? <p className="mt-1 text-xs text-slate-500">Linked dispute #{log.ticket.id} | {log.ticket.status}</p> : null}
                          </div>
                        ))}
                        {!historyLoading[payment.id] && (historyByPayment[payment.id] || []).length === 0 ? (
                          <p className="text-sm text-slate-500">No history entries recorded yet.</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}

            {payments.length === 0 ? <p className="text-sm text-slate-500">No payments found.</p> : null}
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

        {canViewRefunds ? (
          <div className="surface-panel rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Refund Ledger</h2>
                <p className="text-sm text-slate-500">Customer refund records that reduce net received revenue.</p>
              </div>
              {refundRefreshing ? <InlineSpinner label="Refreshing refunds..." /> : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <article className="surface-soft rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Processed</p>
                <p className="mt-2 text-2xl font-bold text-amber-700">{formatCurrency(refundSummary.processedAmount)}</p>
                <p className="mt-1 text-xs text-slate-500">{refundSummary.processedCount} records</p>
              </article>
              <article className="surface-soft rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pending</p>
                <p className="mt-2 text-2xl font-bold text-sky-700">{formatCurrency(refundSummary.pendingAmount)}</p>
                <p className="mt-1 text-xs text-slate-500">{refundSummary.pendingCount} records</p>
              </article>
              <article className="surface-soft rounded-2xl p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cancelled</p>
                <p className="mt-2 text-2xl font-bold text-rose-700">{refundSummary.cancelledCount}</p>
                <p className="mt-1 text-xs text-slate-500">records excluded from totals</p>
              </article>
            </div>

            {canCreateRefunds ? (
              <form onSubmit={createRefund} className="surface-card mt-4 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Record Refund</h3>
                    <p className="text-xs text-slate-500">Use this when money is returned to the customer for an order.</p>
                  </div>
                  {actionLoading['refund:create'] ? <InlineSpinner label="Saving refund..." /> : null}
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <input
                    value={refundForm.orderId}
                    onChange={(event) => setRefundForm((prev) => ({ ...prev, orderId: event.target.value }))}
                    placeholder="Order ID"
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    required
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={refundForm.amount}
                    onChange={(event) => setRefundForm((prev) => ({ ...prev, amount: event.target.value }))}
                    placeholder="Amount"
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    required
                  />
                  <select
                    value={refundForm.status}
                    onChange={(event) => setRefundForm((prev) => ({ ...prev, status: event.target.value }))}
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  >
                    {refundStatuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                  <input
                    value={refundForm.transactionRef}
                    onChange={(event) => setRefundForm((prev) => ({ ...prev, transactionRef: event.target.value }))}
                    placeholder="Refund reference"
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  />
                  <input
                    type="date"
                    value={refundForm.refundedAt}
                    onChange={(event) => setRefundForm((prev) => ({ ...prev, refundedAt: event.target.value }))}
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  />
                  <ActionButton type="submit" tone="brand" loading={Boolean(actionLoading['refund:create'])}>
                    Save Refund
                  </ActionButton>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <input
                    value={refundForm.reason}
                    onChange={(event) => setRefundForm((prev) => ({ ...prev, reason: event.target.value }))}
                    placeholder="Refund reason"
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                    required
                  />
                  <input
                    value={refundForm.note}
                    onChange={(event) => setRefundForm((prev) => ({ ...prev, note: event.target.value }))}
                    placeholder="Internal note"
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                  />
                </div>
              </form>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <select
                value={refundStatusFilter}
                onChange={(event) => { setRefundStatusFilter(event.target.value); setRefundPage(1); }}
                className="rounded-xl border border-slate-300 px-3 py-2.5"
              >
                <option value="">All refund statuses</option>
                {refundStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <input
                value={refundOrderIdFilter}
                onChange={(event) => { setRefundOrderIdFilter(event.target.value); setRefundPage(1); }}
                placeholder="Search order ID"
                className="rounded-xl border border-slate-300 px-3 py-2.5"
              />
              <ActionButton
                type="button"
                tone="neutral"
                onClick={() => {
                  setRefundStatusFilter('');
                  setRefundOrderIdFilter('');
                  setRefundPage(1);
                }}
              >
                Reset Refund Filters
              </ActionButton>
            </div>

            {refundError ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{refundError}</p> : null}

            <div className="mt-4 space-y-3">
              {refundLoading ? <InlineSpinner label="Loading refunds..." /> : null}

              {refunds.map((refund) => (
                <article key={refund.id} className="surface-card rounded-2xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">Refund #{refund.id} | Order #{refund.orderId}</p>
                      <p className="text-xs text-slate-500">
                        Customer: {refund.order?.customer?.user?.name || refund.order?.customer?.user?.email || '-'} | Order total: {formatCurrency(refund.order?.total)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Created by {refund.createdBy?.name || refund.createdBy?.email || '-'} | Refunded on {formatDate(refund.refundedAt || refund.updatedAt)}
                      </p>
                      <p className="text-sm text-slate-700">Reason: {refund.reason}</p>
                      {refund.note ? <p className="text-xs text-slate-600">Note: {refund.note}</p> : null}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <StatusPill
                        label={refund.status}
                        tone={refund.status === 'PROCESSED' ? 'warning' : refund.status === 'CANCELLED' ? 'danger' : 'info'}
                      />
                      <p className="text-lg font-semibold text-rose-700">{formatCurrency(refund.amount)}</p>
                      <p className="text-xs text-slate-500">Txn Ref: {refund.transactionRef || '-'}</p>
                    </div>
                  </div>
                </article>
              ))}

              {!refundLoading && refunds.length === 0 ? <p className="text-sm text-slate-500">No refunds found.</p> : null}
            </div>

            <div className="mt-4">
              <Pagination
                page={refundPage}
                totalPages={refundTotalPages}
                onPrev={() => setRefundPage((prev) => Math.max(prev - 1, 1))}
                onNext={() => setRefundPage((prev) => Math.min(prev + 1, refundTotalPages))}
              />
            </div>
          </div>
        ) : null}

        {(canRaiseTicket || canReviewTicket) ? (
          <div className="surface-panel rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Payment Disputes</h2>
                <p className="text-sm text-slate-500">Locked-payment tickets and their admin resolution trail.</p>
              </div>

              <select value={ticketStatusFilter} onChange={(event) => setTicketStatusFilter(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm">
                <option value="">All statuses</option>
                {ticketStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>

            <div className="mt-3 space-y-3">
              {ticketLoading ? <InlineSpinner label="Loading disputes..." /> : null}

              {tickets.map((ticket) => (
                <div key={ticket.id} className="surface-card rounded-2xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">Dispute #{ticket.id} | Payment #{ticket.paymentId}</p>
                      <p className="text-xs text-slate-500">
                        Worker: {ticket.payment?.worker?.name || '-'} | Amount: {formatCurrency(ticket.payment?.amount)} | Locked: {String(ticket.payment?.lockedByAdmin)}
                      </p>
                      <p className="text-xs text-slate-500">Raised by {ticket.raisedBy?.name || ticket.raisedBy?.email || '-'}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill label={ticket.status} tone={ticket.status === 'APPROVED' || ticket.status === 'RESOLVED' ? 'success' : ticket.status === 'REJECTED' ? 'danger' : 'warning'} />
                      <ActionButton type="button" tone="neutral" onClick={() => navigate(`/orders?focusOrderId=${ticket.payment?.order?.id}`)}>
                        Open Order
                      </ActionButton>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-slate-700">Reason: {ticket.reason}</p>
                  {ticket.adminNote ? <p className="mt-2 text-sm text-slate-600">Admin note: {ticket.adminNote}</p> : null}

                  {canReviewTicket ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {ticket.payment?.lockedByAdmin ? (
                        <ActionButton
                          type="button"
                          tone="warning"
                          onClick={() => openDialog({
                            mode: 'review-ticket',
                            paymentId: ticket.paymentId,
                            ticketId: ticket.id,
                            reviewStatus: 'RESOLVED',
                            resolutionAction: 'UNLOCK',
                            title: `Resolve dispute #${ticket.id} and unlock payment`,
                            description: 'This will resolve the ticket, unlock the payment, and save your admin note in the audit trail.',
                            commentLabel: 'Resolution note',
                            commentPlaceholder: 'Explain why the dispute is being approved and why the payment is being unlocked.',
                            confirmLabel: 'Resolve & Unlock',
                            confirmTone: 'warning',
                            loadingLabel: 'Resolving dispute...',
                          })}
                        >
                          Resolve & Unlock
                        </ActionButton>
                      ) : null}

                      <ActionButton
                        type="button"
                        tone="brand"
                        onClick={() => openDialog({
                          mode: 'review-ticket',
                          paymentId: ticket.paymentId,
                          ticketId: ticket.id,
                          reviewStatus: 'APPROVED',
                          title: `Approve dispute #${ticket.id}`,
                          description: 'Approve this dispute without changing the payment lock state. The note stays in the dispute audit trail.',
                          commentLabel: 'Approval note',
                          commentPlaceholder: 'Explain the approval decision.',
                          confirmLabel: 'Approve',
                          confirmTone: 'brand',
                          loadingLabel: 'Approving dispute...',
                        })}
                      >
                        Approve
                      </ActionButton>

                      <ActionButton
                        type="button"
                        tone="danger"
                        onClick={() => openDialog({
                          mode: 'review-ticket',
                          paymentId: ticket.paymentId,
                          ticketId: ticket.id,
                          reviewStatus: 'REJECTED',
                          title: `Reject dispute #${ticket.id}`,
                          description: 'Reject this dispute request and save the rejection reason for future traceability.',
                          commentLabel: 'Rejection note',
                          commentPlaceholder: 'Explain why this dispute is being rejected.',
                          confirmLabel: 'Reject',
                          confirmTone: 'danger',
                          loadingLabel: 'Rejecting dispute...',
                        })}
                      >
                        Reject
                      </ActionButton>
                    </div>
                  ) : null}
                </div>
              ))}

              {!ticketLoading && tickets.length === 0 ? <p className="text-sm text-slate-500">No disputes found.</p> : null}
            </div>
          </div>
        ) : null}
      </div>

      <ActionDialog
        dialog={dialog}
        loading={dialogLoading}
        onClose={closeDialog}
        onChange={(patch) => setDialog((prev) => (prev ? { ...prev, ...patch } : prev))}
        onSubmit={handleDialogSubmit}
      />
    </>
  );
}

export default Payments;
