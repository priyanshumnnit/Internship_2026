import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  LogOut,
  Menu,
  ShieldCheck,
  UserCircle,
  Users,
  Wallet,
  X,
  AlertTriangle,
  LayoutDashboard,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { needsCscApproval } from '../utils/csc.js';

const navConfig = {
  SUPER_ADMIN: [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/workers', label: 'Workers', icon: Users },
    { path: '/customers', label: 'Customers', icon: UserCircle },
    { path: '/orders', label: 'Orders', icon: ClipboardList },
    { path: '/attendance', label: 'Attendance', icon: CalendarCheck },
    { path: '/payments', label: 'Payments', icon: Wallet },
    { path: '/complaints', label: 'Complaints', icon: AlertTriangle },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/profile', label: 'Profile', icon: UserCircle },
  ],
  BLOCK_ADMIN: [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/workers', label: 'Workers', icon: Users },
    { path: '/customers', label: 'Customers', icon: UserCircle },
    { path: '/orders', label: 'Orders', icon: ClipboardList },
    { path: '/attendance', label: 'Attendance', icon: CalendarCheck },
    { path: '/payments', label: 'Payments', icon: Wallet },
    { path: '/complaints', label: 'Complaints', icon: AlertTriangle },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/profile', label: 'Profile', icon: UserCircle },
  ],
  CSC_AGENT: [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/workers', label: 'Workers', icon: Users },
    { path: '/orders', label: 'Orders', icon: ClipboardList },
    { path: '/profile', label: 'Profile', icon: UserCircle },
  ],
  CUSTOMER: [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/orders', label: 'Orders', icon: ClipboardList },
    { path: '/complaints', label: 'Complaints', icon: AlertTriangle },
    { path: '/profile', label: 'Profile', icon: UserCircle },
  ],
  WORKER: [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/payments', label: 'Payments', icon: Wallet },
    { path: '/profile', label: 'Profile', icon: UserCircle },
  ],
};

function formatRole(role) {
  return (role || '').replaceAll('_', ' ');
}

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuItems = useMemo(() => {
    if (needsCscApproval(user)) {
      return [{ path: '/profile', label: 'Profile Setup', icon: UserCircle }];
    }

    return navConfig[user?.role] || navConfig.CUSTOMER;
  }, [user]);

  const currentItem = menuItems.find((item) => location.pathname.startsWith(item.path)) || menuItems[0];

  const handleLogout = () => {
    logout();
    toast.info('You have been logged out.');
    navigate('/login', { replace: true });
  };

  const navigation = (
    <nav className="space-y-2">
      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => [
              'group flex items-center gap-3 rounded-[1.1rem] border px-3.5 py-2.5 text-sm font-semibold transition-all duration-200',
              isActive
                ? 'border-white/14 bg-[rgba(91,215,255,0.14)] text-white shadow-[0_18px_30px_rgba(0,0,0,0.26)]'
                : 'border-transparent text-white/72 hover:border-white/8 hover:bg-white/6 hover:text-white',
            ].join(' ')}
          >
            {({ isActive }) => (
              <>
                <span className={[
                  'inline-flex h-9 w-9 items-center justify-center rounded-[0.95rem] transition',
                  isActive ? 'bg-white/10' : 'bg-white/5 group-hover:bg-white/10',
                ].join(' ')}>
                  <Icon size={18} />
                </span>
                <span className="flex-1">{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg-shell)]">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute left-[-6%] top-[10%] h-72 w-72 rounded-full bg-[rgba(255,122,64,0.1)] blur-3xl" />
        <div className="absolute right-[-8%] top-[8%] h-80 w-80 rounded-full bg-[rgba(91,215,255,0.08)] blur-3xl" />
        <div className="absolute bottom-[-10%] left-[24%] h-96 w-96 rounded-full bg-[rgba(139,123,255,0.1)] blur-3xl" />
      </div>

      <header className="sticky top-0 z-40 px-4 pb-2 pt-4 sm:px-6 lg:px-8">
        <div className="surface-soft mx-auto flex max-w-[1550px] items-center justify-between gap-4 rounded-[1.4rem] px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="surface-card inline-flex h-10 w-10 items-center justify-center rounded-[1rem] text-slate-700 md:hidden"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <Link to="/dashboard" className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[1.1rem] bg-[var(--brand)] text-base font-extrabold text-white shadow-[0_20px_32px_rgba(255,122,64,0.28)]">
                S
              </span>
              <span>
                <span className="display-font block text-base font-bold tracking-tight text-slate-950">ShramSangam</span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Service control</span>
              </span>
            </Link>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <div className="glass-chip">
              <span className="glass-chip__dot" />
              {formatRole(user?.role)}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{user?.name || user?.email || 'User'}</p>
              <p className="text-xs text-slate-500">{currentItem?.label || 'Dashboard'}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(0,0,0,0.2)]"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto flex max-w-[1550px] gap-5 px-4 pb-8 pt-3 sm:px-6 lg:px-8">
        <motion.aside
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          className={`${mobileOpen ? 'fixed inset-x-4 top-[6.3rem] z-30 block' : 'hidden'} md:static md:block md:w-[17.5rem] md:shrink-0`}
        >
          <div className="surface-dark rounded-[1.8rem] p-4 text-white">
            <div className="surface-card rounded-[1.3rem] p-4 text-white">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[1rem] bg-white/8 text-white">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{user?.name || 'Portal User'}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/60">{formatRole(user?.role)}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[1.3rem] border border-white/6 bg-white/4 p-3">
              <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">Navigation</p>
              <div className="mt-3">
                {navigation}
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/6 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 md:hidden"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </motion.aside>

        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          className="min-w-0 flex-1"
        >
          <Outlet />
        </motion.main>
      </div>
    </div>
  );
}

export default Layout;
