import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import PageTitle from '../components/PageTitle.jsx';
import StatusPill from '../components/StatusPill.jsx';
import LocationSelector from '../components/LocationSelector.jsx';
import { BusyOverlay, InlineSpinner } from '../components/Spinner.jsx';
import api, { cachedGet, getApiErrorMessage } from '../utils/api.js';

function StatCard({ label, value }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-panel rounded-[1.35rem] p-4"
    >
      <div className="mb-3 h-1.5 w-10 rounded-full bg-[var(--accent-strong)]" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2.5 text-xl font-bold tracking-tight text-slate-900 sm:text-[1.35rem]">{value}</p>
    </motion.div>
  );
}

function DashboardHighlight({ item }) {
  if (!item) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="surface-panel rounded-[1.6rem] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-4">
          <p className="section-label">{item.eyebrow}</p>
          <div>
            <h2 className="display-font max-w-3xl text-2xl font-bold tracking-tight text-slate-900 sm:text-[2rem]">
              {item.title}
            </h2>
            <p className="mt-2.5 max-w-2xl text-sm leading-6 text-slate-600">{item.description}</p>
          </div>

          {item.badges?.length ? (
            <div className="page-hero__meta">
              {item.badges.map((badge) => (
                <span key={badge} className="page-hero__pill">
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {item.metrics?.length ? (
          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
            {item.metrics.map((metric) => (
              <div key={metric.label} className="surface-card rounded-[1.2rem] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{metric.label}</p>
                <p className="mt-2 text-base font-bold text-slate-900 sm:text-lg">{metric.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </motion.section>
  );
}

function BusyForm({ busy, label, children, className = '' }) {
  return (
    <div className={`relative ${className}`.trim()}>
      {busy ? <BusyOverlay label={label} /> : null}
      <div className={busy ? 'pointer-events-none opacity-60' : ''}>
        {children}
      </div>
    </div>
  );
}

function formatCurrency(value) {
  return `INR ${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function getDashboardHighlight({ user, analytics, orders, workers, customerPayments, refunds }) {
  if (user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN') {
    return {
      id: 'finance-lens',
      eyebrow: 'Operations spotlight',
      title: 'Collections, refunds, and payouts sit in one calmer control layer.',
      description: 'This dashboard now opens with a lighter summary block instead of a homepage-style carousel, so key financial signals are easier to scan before you move into detailed tables.',
      badges: ['Live analytics', 'Refund aware', 'Decision ready'],
      metrics: [
        { label: 'Customer received', value: formatCurrency(analytics?.grossCustomerReceipts ?? 0) },
        { label: 'Paid orders', value: String(analytics?.paidCustomerOrders ?? customerPayments.length) },
        { label: 'Net profit', value: formatCurrency(analytics?.netProfit ?? 0) },
      ],
    };
  }

  if (user?.role === 'CSC_AGENT') {
    return {
      id: 'worker-intake',
      eyebrow: 'CSC operations',
      title: 'Worker intake and order visibility now stay focused and easier to scan.',
      description: 'The CSC dashboard keeps registration progress, approvals, and block-level orders in one compact summary instead of repeating the animated homepage treatment.',
      badges: ['Worker intake', 'Approval progress', 'Block orders'],
      metrics: [
        { label: 'Registered', value: String(workers.length) },
        { label: 'Approved', value: String(workers.filter((worker) => worker.approvalStatus === 'APPROVED').length) },
        { label: 'Orders in block', value: String(orders.length) },
      ],
    };
  }

  return {
    id: 'customer-overview',
    eyebrow: 'Customer comfort',
    title: 'Order tracking stays cleaner, quieter, and easier to understand.',
    description: 'The customer dashboard now opens with a simple status-first summary so pending, assigned, ongoing, and completed work is visible right away without extra animation blocks.',
    badges: ['Order clarity', 'Attendance aware', 'Status-first'],
    metrics: [
      { label: 'Orders', value: String(orders.length) },
      { label: 'Pending', value: String(orders.filter((order) => order.status === 'pending').length) },
      { label: 'Completed', value: String(orders.filter((order) => order.status === 'completed').length) },
    ],
  };
}

function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customerPayments, setCustomerPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [cscAgents, setCscAgents] = useState([]);
  const [cscAgentsLoading, setCscAgentsLoading] = useState(false);
  const [error, setError] = useState('');

  const [locationSummary, setLocationSummary] = useState(null);
  const [states, setStates] = useState([]);

  const [stateName, setStateName] = useState('');
  const [districtName, setDistrictName] = useState('');
  const [blockName, setBlockName] = useState('');

  const [districtStateId, setDistrictStateId] = useState('');
  const [blockStateId, setBlockStateId] = useState('');
  const [blockDistrictId, setBlockDistrictId] = useState('');
  const [districtOptions, setDistrictOptions] = useState([]);
  const [blockDistrictOptions, setBlockDistrictOptions] = useState([]);

  const [location, setLocation] = useState({
    stateId: '',
    districtId: '',
    blockId: '',
    stateName: '',
    districtName: '',
    blockName: '',
  });
  const [blockAdminForm, setBlockAdminForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: 'BlockAdmin123',
  });

  const [uploadFiles, setUploadFiles] = useState([]);
  const [clearExisting, setClearExisting] = useState(false);
  const [locationAction, setLocationAction] = useState('');
  const [locationRefreshKey, setLocationRefreshKey] = useState(0);
  const [cscStatusFilter, setCscStatusFilter] = useState('PENDING');
  const [cscLocation, setCscLocation] = useState({
    stateId: '',
    districtId: '',
    blockId: '',
    stateName: '',
    districtName: '',
    blockName: '',
  });

  const isAdminRole = user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN';
  const isLocationActionRunning = locationAction !== '';

  const runLocationAction = useCallback(async (action, task) => {
    setLocationAction(action);
    try {
      await task();
    } finally {
      setLocationAction('');
    }
  }, []);

  const fetchStates = useCallback(async (force = false) => {
    const response = await cachedGet('/states', { skipErrorToast: true }, { ttl: 5 * 60 * 1000, force });
    startTransition(() => {
      setStates(response.data || []);
    });
  }, []);

  const fetchLocationSummary = useCallback(async (force = false) => {
    if (user?.role !== 'SUPER_ADMIN') return;
    const response = await cachedGet('/locations/summary', { skipErrorToast: true }, { ttl: 15_000, force });
    startTransition(() => {
      setLocationSummary(response.data);
    });
  }, [user?.role]);

  const fetchDistrictsForState = useCallback(async (stateId, force = false) => {
    if (!stateId) {
      return [];
    }

    const response = await cachedGet('/districts', {
      params: { stateId, search: '' },
      skipErrorToast: true,
    }, { ttl: 60 * 1000, force });

    return response.data || [];
  }, []);

  const loadCscAgents = useCallback(async (options = {}) => {
    if (!isAdminRole) return;

    const { force = false } = options;
    setCscAgentsLoading(true);

    try {
      const params = {
        page: 1,
        cscStatus: cscStatusFilter || undefined,
        stateId: user?.role === 'SUPER_ADMIN' ? (cscLocation.stateId || undefined) : undefined,
        districtId: user?.role === 'SUPER_ADMIN' ? (cscLocation.districtId || undefined) : undefined,
        blockId: user?.role === 'SUPER_ADMIN' ? (cscLocation.blockId || undefined) : undefined,
      };

      const response = await cachedGet('/manage/csc-agents', {
        params,
        skipErrorToast: true,
      }, { ttl: 10_000, force });

      startTransition(() => {
        setCscAgents(response.data.agents || []);
      });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to load CSC review queue'));
      setCscAgents([]);
    } finally {
      setCscAgentsLoading(false);
    }
  }, [cscLocation.blockId, cscLocation.districtId, cscLocation.stateId, cscStatusFilter, isAdminRole, toast, user?.role]);

  const fetchDashboard = useCallback(async (options = {}) => {
    const { force = false } = options;
    setLoading(true);
    setError('');

    try {
      if (user?.role === 'SUPER_ADMIN') {
        const [analyticsResponse, ordersResponse, customerPaymentsResponse, refundsResponse, statesResponse, summaryResponse] = await Promise.all([
          cachedGet('/analytics', { skipErrorToast: true }, { ttl: 10_000, force }),
          cachedGet('/orders?page=1', { skipErrorToast: true }, { ttl: 10_000, force }),
          cachedGet('/orders?page=1&customerPaymentStatus=paid', { skipErrorToast: true }, { ttl: 10_000, force }),
          cachedGet('/refunds?page=1', { skipErrorToast: true }, { ttl: 10_000, force }),
          cachedGet('/states', { skipErrorToast: true }, { ttl: 5 * 60 * 1000, force }),
          cachedGet('/locations/summary', { skipErrorToast: true }, { ttl: 15_000, force }),
        ]);
        startTransition(() => {
          setAnalytics(analyticsResponse.data);
          setOrders(ordersResponse.data.orders || []);
          setCustomerPayments(customerPaymentsResponse.data.orders || []);
          setRefunds(refundsResponse.data.refunds || []);
          setStates(statesResponse.data || []);
          setLocationSummary(summaryResponse.data);
        });
      } else if (isAdminRole) {
        const [analyticsResponse, ordersResponse, customerPaymentsResponse, refundsResponse] = await Promise.all([
          cachedGet('/analytics', { skipErrorToast: true }, { ttl: 10_000, force }),
          cachedGet('/orders?page=1', { skipErrorToast: true }, { ttl: 10_000, force }),
          cachedGet('/orders?page=1&customerPaymentStatus=paid', { skipErrorToast: true }, { ttl: 10_000, force }),
          cachedGet('/refunds?page=1', { skipErrorToast: true }, { ttl: 10_000, force }),
        ]);
        startTransition(() => {
          setAnalytics(analyticsResponse.data);
          setOrders(ordersResponse.data.orders || []);
          setCustomerPayments(customerPaymentsResponse.data.orders || []);
          setRefunds(refundsResponse.data.refunds || []);
        });
      } else if (user?.role === 'CSC_AGENT') {
        const [workersResponse, ordersResponse] = await Promise.all([
          cachedGet('/workers?page=1&mine=true', { skipErrorToast: true }, { ttl: 10_000, force }),
          cachedGet('/orders?page=1', { skipErrorToast: true }, { ttl: 10_000, force }),
        ]);
        startTransition(() => {
          setWorkers(workersResponse.data.workers || []);
          setOrders(ordersResponse.data.orders || []);
        });
      } else {
        const [ordersResponse] = await Promise.all([
          cachedGet('/orders?page=1', { skipErrorToast: true }, { ttl: 10_000, force }),
        ]);
        startTransition(() => {
          setOrders(ordersResponse.data.orders || []);
        });
      }
    } catch (requestError) {
      const message = getApiErrorMessage(requestError, 'Unable to load dashboard data');
      setAnalytics(null);
      setWorkers([]);
      setOrders([]);
      setCustomerPayments([]);
      setRefunds([]);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [isAdminRole, toast, user?.role]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    loadCscAgents();
  }, [loadCscAgents]);

  useEffect(() => {
    if (!districtStateId) {
      setDistrictOptions([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const districts = await fetchDistrictsForState(districtStateId);
        startTransition(() => {
          setDistrictOptions(districts);
        });
      } catch (_error) {
        setDistrictOptions([]);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [districtStateId, fetchDistrictsForState]);

  useEffect(() => {
    if (!blockStateId) {
      setBlockDistrictOptions([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const districts = await fetchDistrictsForState(blockStateId);
        startTransition(() => {
          setBlockDistrictOptions(districts);
        });
      } catch (_error) {
        setBlockDistrictOptions([]);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [blockStateId, fetchDistrictsForState]);

  const orderStatusCounts = useMemo(() => {
    const counts = {
      pending: 0,
      assigned: 0,
      ongoing: 0,
      completed: 0,
      cancelled: 0,
    };

    for (const order of orders) {
      if (counts[order.status] != null) {
        counts[order.status] += 1;
      }
    }

    return counts;
  }, [orders]);

  async function createState(event) {
    event.preventDefault();
    setError('');

    await runLocationAction('state', async () => {
      try {
        const response = await api.post('/locations/states', { name: stateName });
        const createdState = response.data?.state;

        setStateName('');
        await Promise.all([fetchStates(true), fetchLocationSummary(true)]);
        setLocationRefreshKey((current) => current + 1);

        startTransition(() => {
          if (createdState?.id && !districtStateId) {
            setDistrictStateId(createdState.id);
          }
          if (createdState?.id && !blockStateId) {
            setBlockStateId(createdState.id);
          }
        });

        toast.success('State created successfully.');
      } catch (requestError) {
        toast.error(getApiErrorMessage(requestError, 'Unable to create state'));
      }
    });
  }

  async function createDistrict(event) {
    event.preventDefault();
    setError('');

    await runLocationAction('district', async () => {
      try {
        const response = await api.post('/locations/districts', { stateId: districtStateId, name: districtName });
        const createdDistrict = response.data?.district;
        const nextDistricts = await fetchDistrictsForState(districtStateId, true);

        setDistrictName('');
        await fetchLocationSummary(true);
        setLocationRefreshKey((current) => current + 1);

        startTransition(() => {
          setDistrictOptions(nextDistricts);

          if (!blockStateId || blockStateId === districtStateId) {
            setBlockStateId(districtStateId);
            setBlockDistrictOptions(nextDistricts);
            if (createdDistrict?.id) {
              setBlockDistrictId(createdDistrict.id);
            }
          }
        });

        toast.success('District created successfully. You can add blocks to it right away.');
      } catch (requestError) {
        toast.error(getApiErrorMessage(requestError, 'Unable to create district'));
      }
    });
  }

  async function createBlock(event) {
    event.preventDefault();
    setError('');

    await runLocationAction('block', async () => {
      try {
        const response = await api.post('/locations/blocks', { districtId: blockDistrictId, name: blockName });
        const createdBlock = response.data?.block;

        setBlockName('');
        await fetchLocationSummary(true);
        setLocationRefreshKey((current) => current + 1);

        startTransition(() => {
          if (createdBlock?.districtId && location.districtId === createdBlock.districtId && !location.blockId) {
            setLocation((current) => ({
              ...current,
              blockId: createdBlock.id,
              blockName: createdBlock.name,
            }));
          }
        });

        toast.success('Block created successfully.');
      } catch (requestError) {
        toast.error(getApiErrorMessage(requestError, 'Unable to create block'));
      }
    });
  }

  async function importLGD(event) {
    event.preventDefault();
    setError('');

    if (!uploadFiles.length) {
      toast.error('Select at least one LGD Excel file.');
      return;
    }

    await runLocationAction('import', async () => {
      try {
        const formData = new FormData();
        uploadFiles.forEach((file) => formData.append('files', file));
        formData.append('clearExisting', String(clearExisting));

        const response = await api.post('/locations/import-lgd', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        setUploadFiles([]);
        setLocationRefreshKey((current) => current + 1);
        await Promise.all([fetchStates(true), fetchLocationSummary(true)]);
        toast.success(`LGD import completed. Blocks total: ${response.data?.report?.totals?.blocks ?? '-'}`);
      } catch (requestError) {
        toast.error(getApiErrorMessage(requestError, 'LGD import failed'));
      }
    });
  }

  async function createBlockAdmin(event) {
    event.preventDefault();
    setError('');

    if (!location.stateId || !location.districtId || !location.blockId) {
      toast.error('Select state, district and block for block admin assignment.');
      return;
    }

    await runLocationAction('block-admin', async () => {
      try {
        await api.post('/manage/block-admin', {
          ...blockAdminForm,
          stateId: location.stateId,
          districtId: location.districtId,
          blockId: location.blockId,
        });
        toast.success('Block admin created successfully.');
        setBlockAdminForm({ name: '', email: '', phone: '', password: 'BlockAdmin123' });
        setLocation({ stateId: '', districtId: '', blockId: '', stateName: '', districtName: '', blockName: '' });
      } catch (requestError) {
        toast.error(getApiErrorMessage(requestError, 'Unable to create block admin'));
      }
    });
  }

  async function reviewCscAgent(agentId, nextStatus) {
    const reviewNote = window.prompt(
      nextStatus === 'APPROVED'
        ? 'Optional review note for approval:'
        : 'Reason / note for rejection:',
    ) || '';

    try {
      await api.patch(`/manage/csc-agents/${agentId}/status`, {
        status: nextStatus,
        reviewNote,
      });
      toast.success(`CSC agent ${nextStatus.toLowerCase()} successfully.`);
      await loadCscAgents({ force: true });
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to review CSC agent'));
    }
  }

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  if (user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN') {
    return (
      <div className="space-y-5">
        <PageTitle
          title="Admin Dashboard"
          subtitle="Live analytics for customer collections, worker payouts, refunds, and net profit"
        />

        <DashboardHighlight item={getDashboardHighlight({ user, analytics, orders, workers, customerPayments, refunds })} />

        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Workers" value={analytics?.totalWorkers ?? 0} />
          <StatCard label="Total Orders" value={analytics?.totalOrders ?? 0} />
          <StatCard label="Customer Received" value={formatCurrency(analytics?.grossCustomerReceipts ?? 0)} />
          <StatCard label="Refunded" value={formatCurrency(analytics?.totalRefundAmount ?? 0)} />
          <StatCard label="Net Received" value={formatCurrency(analytics?.netCustomerReceipts ?? 0)} />
          <StatCard label="Paid To Workers" value={formatCurrency(analytics?.totalPaidToWorkers ?? 0)} />
          <StatCard label="Pending Worker Payouts" value={formatCurrency(analytics?.pendingWorkerPayoutAmount ?? 0)} />
          <StatCard label="Failed Worker Payouts" value={formatCurrency(analytics?.failedWorkerPayoutAmount ?? 0)} />
          <StatCard label="Net Profit" value={formatCurrency(analytics?.netProfit ?? 0)} />
          <StatCard label="Refund Records" value={analytics?.totalRefunds ?? 0} />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <div className="surface-panel rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Recent Customer Receipts</h2>
                <p className="text-sm text-slate-500">Orders with verified customer payment, used for total collections.</p>
              </div>
              <StatusPill label={`${analytics?.paidCustomerOrders ?? 0} paid orders`} tone="success" />
            </div>
            <div className="mt-3 space-y-2">
              {customerPayments.slice(0, 6).map((order) => (
                <div key={order.id} className="surface-card flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Order #{order.id} - {order.category}</p>
                    <p className="text-xs text-slate-500">
                      {order.customer?.user?.name || order.customer?.user?.email || 'Customer'} | Paid on {formatDate(order.customerPaidAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-700">{formatCurrency(order.total)}</p>
                    <p className="text-xs text-slate-500">{order.state} / {order.district} / {order.block}</p>
                  </div>
                </div>
              ))}
              {customerPayments.length === 0 ? <p className="text-sm text-slate-500">No verified customer payments yet.</p> : null}
            </div>
          </div>

          <div className="surface-panel rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Recent Refunds</h2>
                <p className="text-sm text-slate-500">Processed refunds reduce net received revenue automatically.</p>
              </div>
              <StatusPill label={formatCurrency(analytics?.totalRefundAmount ?? 0)} tone={(analytics?.totalRefundAmount ?? 0) > 0 ? 'warning' : 'info'} />
            </div>
            <div className="mt-3 space-y-2">
              {refunds.slice(0, 6).map((refund) => (
                <div key={refund.id} className="surface-card flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">Refund #{refund.id} - Order #{refund.orderId}</p>
                    <p className="text-xs text-slate-500">{refund.reason}</p>
                    <p className="text-xs text-slate-500">Updated {formatDate(refund.refundedAt || refund.updatedAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusPill
                      label={refund.status}
                      tone={refund.status === 'PROCESSED' ? 'warning' : refund.status === 'CANCELLED' ? 'danger' : 'info'}
                    />
                    <p className="text-sm font-semibold text-rose-700">{formatCurrency(refund.amount)}</p>
                  </div>
                </div>
              ))}
              {refunds.length === 0 ? <p className="text-sm text-slate-500">No refunds recorded yet.</p> : null}
            </div>
          </div>
        </div>

        <div className="surface-panel rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
          <div className="mt-3 space-y-2">
            {orders.slice(0, 6).map((order) => (
              <div key={order.id} className="surface-card flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">Order #{order.id} - {order.category}</p>
                  <p className="text-xs text-slate-500">{order.state} / {order.district} / {order.block}</p>
                </div>
                <StatusPill
                  label={order.status}
                  tone={order.status === 'completed' ? 'success' : order.status === 'cancelled' ? 'danger' : 'info'}
                />
              </div>
            ))}
            {orders.length === 0 ? <p className="text-sm text-slate-500">No orders available.</p> : null}
          </div>
        </div>

        <div className="surface-panel space-y-4 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">CSC Verification Queue</h2>
              <p className="text-sm text-slate-500">Review document submissions before agent dashboard access is unlocked.</p>
            </div>
            {cscAgentsLoading ? <InlineSpinner label="Refreshing CSC queue..." /> : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-[220px,1fr]">
            <select
              value={cscStatusFilter}
              onChange={(event) => setCscStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2.5"
            >
              <option value="">All CSC statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="APPROVED">APPROVED</option>
              <option value="REJECTED">REJECTED</option>
            </select>

            {user?.role === 'SUPER_ADMIN' ? (
              <LocationSelector
                idPrefix="csc-review-location"
                value={cscLocation}
                onChange={setCscLocation}
                required={false}
              />
            ) : null}
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {cscAgents.map((agent) => (
              <div key={agent.id} className="surface-card rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{agent.name || agent.email}</p>
                    <p className="text-xs text-slate-500">{agent.email} {agent.phone ? `| ${agent.phone}` : ''}</p>
                  </div>
                  <StatusPill
                    label={agent.cscStatus || 'PENDING'}
                    tone={agent.cscStatus === 'APPROVED' ? 'success' : agent.cscStatus === 'REJECTED' ? 'danger' : 'warning'}
                  />
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <p>{agent.state} / {agent.district} / {agent.block}</p>
                  <p>{agent.address || 'No saved address yet'}</p>
                  <p>Submitted: {agent.cscDocument?.submittedAt ? formatDate(agent.cscDocument.submittedAt) : 'Not submitted'}</p>
                  {agent.cscDocument?.reviewNote ? <p>Review note: {agent.cscDocument.reviewNote}</p> : null}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <a href={agent.cscDocument?.aadhaarUrl || '#'} target="_blank" rel="noreferrer" className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold ${agent.cscDocument?.aadhaarUrl ? 'border-slate-300 text-slate-700' : 'pointer-events-none border-slate-200 text-slate-400'}`}>Aadhaar</a>
                  <a href={agent.cscDocument?.licenseUrl || agent.cscDocument?.bankPassbookUrl || '#'} target="_blank" rel="noreferrer" className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold ${agent.cscDocument?.licenseUrl || agent.cscDocument?.bankPassbookUrl ? 'border-slate-300 text-slate-700' : 'pointer-events-none border-slate-200 text-slate-400'}`}>License</a>
                  <a href={agent.cscDocument?.verificationCertificateUrl || agent.cscDocument?.cscIdOrVleCertificateUrl || agent.cscDocument?.characterCertificateUrl || '#'} target="_blank" rel="noreferrer" className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold ${agent.cscDocument?.verificationCertificateUrl || agent.cscDocument?.cscIdOrVleCertificateUrl || agent.cscDocument?.characterCertificateUrl ? 'border-slate-300 text-slate-700' : 'pointer-events-none border-slate-200 text-slate-400'}`}>Verification</a>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => reviewCscAgent(agent.id, 'APPROVED')}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewCscAgent(agent.id, 'REJECTED')}
                    className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {!cscAgents.length && !cscAgentsLoading ? <p className="text-sm text-slate-500">No CSC agents found for the current review filters.</p> : null}
          </div>
        </div>

        {user?.role === 'SUPER_ADMIN' ? (
          <div className="surface-panel space-y-4 rounded-2xl p-5">
            <h2 className="text-lg font-semibold text-slate-900">Location Master Management</h2>

            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="States" value={locationSummary?.states ?? 0} />
              <StatCard label="Districts" value={locationSummary?.districts ?? 0} />
              <StatCard label="Blocks" value={locationSummary?.blocks ?? 0} />
            </div>

            {isLocationActionRunning ? <InlineSpinner label="Saving location changes..." /> : null}

            <BusyForm busy={locationAction === 'import'} label="Importing LGD files...">
              <form onSubmit={importLGD} className="surface-card rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-900">Import LGD Excel Files</h3>
                <p className="mt-1 text-xs text-slate-500">Upload district and block LGD sheets. Mapping is done using hierarchy parsing.</p>
                <input
                  type="file"
                  multiple
                  accept=".xlsx,.xls"
                  className="mt-3 block w-full text-sm"
                  onChange={(event) => setUploadFiles(Array.from(event.target.files || []))}
                />
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={clearExisting} onChange={(event) => setClearExisting(event.target.checked)} />
                  Clear existing location master before import
                </label>
                <button type="submit" className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                  {locationAction === 'import' ? 'Importing...' : 'Import LGD'}
                </button>
              </form>
            </BusyForm>

            <div className="grid gap-3 lg:grid-cols-3">
              <BusyForm busy={locationAction === 'state'} label="Saving state...">
                <form onSubmit={createState} className="surface-card rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Add State</h3>
                  <input
                    type="text"
                    value={stateName}
                    onChange={(event) => setStateName(event.target.value)}
                    placeholder="State name"
                    className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    required
                  />
                  <button type="submit" className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                    {locationAction === 'state' ? 'Saving...' : 'Save State'}
                  </button>
                </form>
              </BusyForm>

              <BusyForm busy={locationAction === 'district'} label="Saving district...">
                <form onSubmit={createDistrict} className="surface-card rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Add District</h3>
                  <select
                    value={districtStateId}
                    onChange={(event) => setDistrictStateId(event.target.value)}
                    className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    required
                  >
                    <option value="">Select state</option>
                    {states.map((state) => (
                      <option key={state.id} value={state.id}>{state.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={districtName}
                    onChange={(event) => setDistrictName(event.target.value)}
                    placeholder="District name"
                    className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    required
                  />
                  <button type="submit" className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                    {locationAction === 'district' ? 'Saving...' : 'Save District'}
                  </button>
                </form>
              </BusyForm>

              <BusyForm busy={locationAction === 'block'} label="Saving block...">
                <form onSubmit={createBlock} className="surface-card rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Add Block</h3>
                  <select
                    value={blockStateId}
                    onChange={(event) => {
                      setBlockStateId(event.target.value);
                      setBlockDistrictId('');
                    }}
                    className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    required
                  >
                    <option value="">Select state</option>
                    {states.map((state) => (
                      <option key={state.id} value={state.id}>{state.name}</option>
                    ))}
                  </select>
                  <select
                    value={blockDistrictId}
                    onChange={(event) => setBlockDistrictId(event.target.value)}
                    className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    required
                    disabled={!blockStateId}
                  >
                    <option value="">Select district</option>
                    {blockDistrictOptions.map((district) => (
                      <option key={district.id} value={district.id}>{district.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={blockName}
                    onChange={(event) => setBlockName(event.target.value)}
                    placeholder="Block name"
                    className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                    required
                  />
                  <button type="submit" className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                    {locationAction === 'block' ? 'Saving...' : 'Save Block'}
                  </button>
                </form>
              </BusyForm>
            </div>

            <BusyForm busy={locationAction === 'block-admin'} label="Creating block admin...">
              <form onSubmit={createBlockAdmin} className="surface-card rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-900">Create Block Admin</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <input
                    type="text"
                    value={blockAdminForm.name}
                    onChange={(event) => setBlockAdminForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Name"
                    className="rounded-xl border border-slate-300 px-3 py-2.5"
                    required
                  />
                  <input
                    type="email"
                    value={blockAdminForm.email}
                    onChange={(event) => setBlockAdminForm((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="Email"
                    className="rounded-xl border border-slate-300 px-3 py-2.5"
                    required
                  />
                  <input
                    type="tel"
                    value={blockAdminForm.phone}
                    onChange={(event) => setBlockAdminForm((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="Phone"
                    className="rounded-xl border border-slate-300 px-3 py-2.5"
                  />
                  <input
                    type="password"
                    value={blockAdminForm.password}
                    onChange={(event) => setBlockAdminForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Password"
                    className="rounded-xl border border-slate-300 px-3 py-2.5"
                    required
                  />
                </div>

                <div className="mt-3">
                  <LocationSelector
                    idPrefix="block-admin-location"
                    value={location}
                    onChange={setLocation}
                    required
                    refreshKey={locationRefreshKey}
                  />
                </div>

                <button type="submit" className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                  {locationAction === 'block-admin' ? 'Creating...' : 'Create Block Admin'}
                </button>
              </form>
            </BusyForm>
          </div>
        ) : null}
      </div>
    );
  }

  if (user?.role === 'CSC_AGENT') {
    const approvedWorkers = workers.filter((worker) => worker.approvalStatus === 'APPROVED').length;
    const pendingWorkers = workers.filter((worker) => worker.approvalStatus === 'PENDING').length;

    return (
      <div className="space-y-5">
        <PageTitle
          title="CSC Dashboard"
          subtitle="Worker registration and block-level order tracking"
        />

        <DashboardHighlight item={getDashboardHighlight({ user, analytics, orders, workers, customerPayments, refunds })} />

        {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="My Registered Workers" value={workers.length} />
          <StatCard label="Approved Workers" value={approvedWorkers} />
          <StatCard label="Pending Workers" value={pendingWorkers} />
          <StatCard label="Orders In Block" value={orders.length} />
        </div>

        <div className="surface-panel rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">Latest Workers</h2>
          <div className="mt-3 space-y-2">
            {workers.slice(0, 6).map((worker) => (
              <div key={worker.id} className="surface-card flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{worker.name}</p>
                  <p className="text-xs text-slate-500">{worker.category} | {worker.block}</p>
                </div>
                <StatusPill
                  label={worker.approvalStatus}
                  tone={worker.approvalStatus === 'APPROVED' ? 'success' : worker.approvalStatus === 'REJECTED' ? 'danger' : 'warning'}
                />
              </div>
            ))}
            {workers.length === 0 ? <p className="text-sm text-slate-500">No workers registered yet.</p> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Customer Dashboard"
        subtitle="Track your orders and confirmations"
      />

      <DashboardHighlight item={getDashboardHighlight({ user, analytics, orders, workers, customerPayments, refunds })} />

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Orders" value={orders.length} />
        <StatCard label="Pending" value={orderStatusCounts.pending} />
        <StatCard label="Assigned" value={orderStatusCounts.assigned} />
        <StatCard label="Ongoing" value={orderStatusCounts.ongoing} />
        <StatCard label="Completed" value={orderStatusCounts.completed} />
      </div>

      <div className="surface-panel rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-slate-900">Recent Orders</h2>
        <div className="mt-3 space-y-2">
          {orders.slice(0, 8).map((order) => (
            <div key={order.id} className="surface-card flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2">
              <div>
                <p className="text-sm font-medium text-slate-900">Order #{order.id} - {order.category}</p>
                <p className="text-xs text-slate-500">{order.state} / {order.district} / {order.block}</p>
              </div>
              <StatusPill
                label={order.status}
                tone={order.status === 'completed' ? 'success' : order.status === 'cancelled' ? 'danger' : 'info'}
              />
            </div>
          ))}
          {orders.length === 0 ? <p className="text-sm text-slate-500">No orders created yet.</p> : null}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
