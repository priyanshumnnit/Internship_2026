import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { SpinnerPanel } from './Spinner.jsx';
import { needsCscApproval } from '../utils/csc.js';

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <SpinnerPanel label="Checking your session..." className="p-6" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (needsCscApproval(user) && location.pathname !== '/profile') {
    return <Navigate to="/profile?setup=csc" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
