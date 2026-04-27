import { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import PageTitle from '../components/PageTitle.jsx';
import Pagination from '../components/Pagination.jsx';
import { cachedGet, getApiErrorMessage } from '../utils/api.js';

function Customers() {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');

  const canView = user?.role === 'SUPER_ADMIN' || user?.role === 'BLOCK_ADMIN';

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchCustomers() {
      setLoading(true);
      setError('');

      try {
        const response = await cachedGet(`/customers?page=${page}`, { skipErrorToast: true }, { ttl: 10_000 });
        if (!mounted) return;
        setCustomers(response.data.customers || []);
        setTotalPages(response.data.totalPages || 1);
      } catch (requestError) {
        if (!mounted) return;
        const message = getApiErrorMessage(requestError, 'Unable to load customers');
        setError(message);
        toast.error(message);
        setCustomers([]);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchCustomers();

    return () => {
      mounted = false;
    };
  }, [canView, page]);

  if (!canView) {
    return (
      <div className="surface-panel rounded-2xl p-5">
        <p className="text-sm text-slate-600">Customers module is available only for SUPER_ADMIN and BLOCK_ADMIN.</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingSkeleton rows={4} />;
  }

  return (
    <div className="space-y-5">
      <PageTitle title="Customers" subtitle="Role-scoped customer directory with location details" />

      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {customers.map((customer) => (
          <article key={customer.id} className="surface-card rounded-2xl p-4">
            <h2 className="text-sm font-semibold text-slate-900">{customer.user?.name || 'Customer'}</h2>
            <p className="mt-1 text-xs text-slate-500">ID #{customer.user?.id}</p>
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p>Email: {customer.user?.email || 'N/A'}</p>
              <p>Phone: {customer.user?.phone || 'N/A'}</p>
              <p>State: {customer.state}</p>
              <p>District: {customer.district}</p>
              <p>Block: {customer.block}</p>
            </div>
          </article>
        ))}
      </div>

      {customers.length === 0 ? <p className="text-sm text-slate-500">No customers found.</p> : null}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPrev={() => setPage((prev) => Math.max(prev - 1, 1))}
        onNext={() => setPage((prev) => Math.min(prev + 1, totalPages))}
      />
    </div>
  );
}

export default Customers;
