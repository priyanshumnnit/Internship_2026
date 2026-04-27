import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  KeyRound,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import WorkerScene from '../components/WorkerScene.jsx';
import { BusyOverlay } from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getApiErrorMessage } from '../utils/api.js';

function Login() {
  const navigate = useNavigate();
  const { loginWithPassword, loginWithOtp, requestOtp } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState('PASSWORD');
  const [identifierType, setIdentifierType] = useState('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const busy = busyAction !== '';
  const busyLabel = busyAction === 'otp'
    ? 'Sending your login OTP...'
    : mode === 'PASSWORD'
      ? 'Signing you in...'
      : 'Verifying OTP and opening your dashboard...';

  const identifierPayload = useMemo(() => (
    identifierType === 'email' ? { email: email.trim().toLowerCase() } : { phone: phone.trim() }
  ), [identifierType, email, phone]);

  async function handleOtpRequest() {
    setBusyAction('otp');

    try {
      const response = await requestOtp({
        ...identifierPayload,
        purpose: 'LOGIN',
      });
      toast.success(
        response.mockOtp
          ? `OTP sent. Use ${response.mockOtp} (mock) for login.`
          : 'OTP sent to your email. Please enter the 6-digit code from your inbox.',
      );
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Failed to request OTP'));
    } finally {
      setBusyAction('');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusyAction('submit');

    try {
      if (mode === 'PASSWORD') {
        await loginWithPassword({
          ...identifierPayload,
          password,
        });
      } else {
        await loginWithOtp({
          ...identifierPayload,
          code,
        });
      }

      toast.success('Login successful.');
      navigate('/dashboard', { replace: true });
    } catch (loginError) {
      const apiError = loginError.response?.data;
      toast.error(getApiErrorMessage(loginError, 'Login failed'));
      if (apiError?.redirectToSignup) {
        toast.info('No user found. Please complete signup first.');
      }
    } finally {
      setBusyAction('');
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute left-[-7%] top-[8%] h-72 w-72 rounded-full bg-[rgba(255,122,64,0.12)] blur-3xl" />
        <div className="absolute right-[-9%] top-[18%] h-80 w-80 rounded-full bg-[rgba(91,215,255,0.12)] blur-3xl" />
        <div className="absolute bottom-[-12%] left-[32%] h-96 w-96 rounded-full bg-[rgba(139,123,255,0.1)] blur-3xl" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface-hero relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-5xl overflow-hidden rounded-[2rem] lg:grid-cols-[0.9fr,1.1fr] lg:items-stretch"
      >
        <div className="relative overflow-hidden border-r border-white/8 bg-[linear-gradient(160deg,rgba(6,9,14,0.98),rgba(11,16,24,0.96),rgba(255,122,64,0.2))] p-6 text-white sm:p-8">
          <div className="absolute inset-0 opacity-70">
            <div className="absolute left-[12%] top-[12%] h-28 w-28 rounded-full bg-white/8 blur-2xl" />
            <div className="absolute bottom-[8%] right-[10%] h-36 w-36 rounded-full bg-[rgba(91,215,255,0.2)] blur-3xl" />
          </div>

          <div className="relative flex h-full flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="glass-chip border-white/12 bg-white/10 text-white/80">
                <Sparkles size={14} />
                Focused login
              </div>

              <div>
                <h1 className="display-font max-w-md text-2xl font-extrabold leading-tight text-white sm:text-[2.15rem]">
                  Sign in through one focused access panel.
                </h1>
                <p className="mt-3 max-w-md text-sm leading-6 text-white/72">
                  Just the login flow, a subtle animated backdrop, and clear loading feedback while your session opens.
                </p>
              </div>
            </div>

            <WorkerScene variant="mechanic" compact className="bg-transparent" />

            <div className="flex flex-wrap gap-2">
              {['Password or OTP', 'Smooth loading states'].map((item) => (
                <span key={item} className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/72">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative bg-[rgba(6,10,16,0.82)] p-6 sm:p-8 lg:p-9">
          {busy ? <BusyOverlay label={busyLabel} className="rounded-none lg:rounded-l-none lg:rounded-r-[2rem]" /> : null}

          <form onSubmit={handleSubmit} className={busy ? 'pointer-events-none opacity-70' : ''}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="section-label">Access portal</p>
                <h2 className="mt-2 display-font text-2xl font-bold text-slate-950">Login</h2>
              </div>
              <Link to="/signup" className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white/6">
                Signup
              </Link>
            </div>

            <div className="mt-6 flex gap-2 rounded-full border border-white/8 bg-white/4 p-1.5">
              <button
                type="button"
                onClick={() => setMode('PASSWORD')}
                disabled={busy}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold ${mode === 'PASSWORD' ? 'bg-white/10 text-white shadow-[0_18px_30px_rgba(0,0,0,0.2)]' : 'text-slate-600'}`.trim()}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => setMode('OTP')}
                disabled={busy}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold ${mode === 'OTP' ? 'bg-white/10 text-white shadow-[0_18px_30px_rgba(0,0,0,0.2)]' : 'text-slate-600'}`.trim()}
              >
                OTP
              </button>
            </div>

            <div className="mt-4 flex gap-2 rounded-full border border-white/8 bg-white/4 p-1.5">
              <button
                type="button"
                onClick={() => setIdentifierType('email')}
                disabled={busy}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold ${identifierType === 'email' ? 'bg-[var(--brand)] text-white shadow-[0_18px_30px_rgba(255,122,64,0.22)]' : 'text-slate-700'}`.trim()}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setIdentifierType('phone')}
                disabled={busy}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold ${identifierType === 'phone' ? 'bg-[var(--brand)] text-white shadow-[0_18px_30px_rgba(255,122,64,0.22)]' : 'text-slate-700'}`.trim()}
              >
                Phone
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {identifierType === 'email' ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Email</span>
                  <span className="relative block">
                    <Mail size={16} className="pointer-events-none absolute left-4 top-3.5 text-slate-400" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full px-11 py-3"
                      placeholder="you@example.com"
                    />
                  </span>
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Phone</span>
                  <span className="relative block">
                    <Phone size={16} className="pointer-events-none absolute left-4 top-3.5 text-slate-400" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="w-full px-11 py-3"
                      placeholder="10 digit phone"
                    />
                  </span>
                </label>
              )}

              {mode === 'PASSWORD' ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Password</span>
                  <span className="relative block">
                    <Lock size={16} className="pointer-events-none absolute left-4 top-3.5 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full px-11 py-3"
                      placeholder="Enter password"
                    />
                  </span>
                </label>
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-700">OTP</span>
                    <span className="relative block">
                      <KeyRound size={16} className="pointer-events-none absolute left-4 top-3.5 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        className="w-full px-11 py-3"
                        placeholder="Enter OTP"
                      />
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleOtpRequest}
                    disabled={busy}
                    className="surface-card rounded-full px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
                  >
                    Request OTP
                  </button>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--brand)] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_22px_38px_rgba(255,122,64,0.28)] disabled:opacity-70"
            >
              {mode === 'PASSWORD' ? 'Login with Password' : 'Login with OTP'}
            </button>

            <p className="mt-5 text-sm text-slate-600">
              New here?{' '}
              <Link to="/signup" className="font-semibold text-[var(--brand)]">
                Create your account
              </Link>
            </p>
          </form>
        </div>
      </motion.section>
    </div>
  );
}

export default Login;
