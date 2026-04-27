import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { motion } from 'framer-motion';
import { ArrowRight, MapPinned, ShieldCheck, Sparkles, UserPlus } from 'lucide-react';
import WorkerScene from '../components/WorkerScene.jsx';
import { BusyOverlay } from '../components/Spinner.jsx';
import LocationSelector from '../components/LocationSelector.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getApiErrorMessage } from '../utils/api.js';

function Signup() {
  const navigate = useNavigate();
  const { requestOtp, signup } = useAuth();
  const toast = useToast();
  const panelRef = useRef(null);

  const [role, setRole] = useState('CUSTOMER');
  const [identifierType, setIdentifierType] = useState('phone');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const [location, setLocation] = useState({
    stateId: '',
    districtId: '',
    blockId: '',
    stateName: '',
    districtName: '',
    blockName: '',
  });

  useEffect(() => {
    if (!panelRef.current) return;
    gsap.fromTo(
      panelRef.current.querySelectorAll('[data-signup-item]'),
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.46, stagger: 0.06, ease: 'power2.out' },
    );
  }, []);

  const busy = busyAction !== '';
  const isCustomer = role === 'CUSTOMER';
  const useEmail = isCustomer ? identifierType === 'email' : true;
  const busyLabel = useMemo(() => {
    if (busyAction === 'otp') {
      return role === 'CSC_AGENT'
        ? 'Sending your CSC signup OTP...'
        : 'Sending your signup OTP...';
    }

    return role === 'CSC_AGENT'
      ? 'Creating your CSC account...'
      : 'Creating your customer account...';
  }, [busyAction, role]);

  const identifierPayload = useEmail
    ? { email: email.trim().toLowerCase(), phone: undefined }
    : { phone: phone.trim(), email: undefined };

  async function handleRequestOtp() {
    setBusyAction('otp');

    try {
      const response = await requestOtp({
        ...identifierPayload,
        role,
        purpose: 'SIGNUP',
      });
      toast.success(
        response.mockOtp
          ? `OTP sent. Use ${response.mockOtp} (mock) to complete signup.`
          : 'OTP sent to your email. Enter the 6-digit code from your inbox.',
      );
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError, 'Unable to request OTP'));
    } finally {
      setBusyAction('');
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    setBusyAction('submit');

    if (!location.stateId || !location.districtId || !location.blockId) {
      setBusyAction('');
      toast.error('Please select state, district, and block before signup.');
      return;
    }

    try {
      const payload = {
        role,
        name,
        password,
        code,
        address,
        stateId: location.stateId,
        districtId: location.districtId,
        blockId: location.blockId,
        ...identifierPayload,
      };

      await signup(payload);
      toast.success(role === 'CSC_AGENT' ? 'CSC signup completed. Log in and finish document submission from Profile.' : 'Signup completed. Redirecting to login.');
      window.setTimeout(() => navigate('/login'), 700);
    } catch (signupError) {
      toast.error(getApiErrorMessage(signupError, 'Signup failed'));
    } finally {
      setBusyAction('');
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute left-[-8%] top-[6%] h-72 w-72 rounded-full bg-[rgba(255,122,64,0.12)] blur-3xl" />
        <div className="absolute right-[-8%] top-[18%] h-80 w-80 rounded-full bg-[rgba(91,215,255,0.12)] blur-3xl" />
        <div className="absolute bottom-[-10%] left-[28%] h-[26rem] w-[26rem] rounded-full bg-[rgba(139,123,255,0.12)] blur-3xl" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface-hero relative mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] lg:grid-cols-[0.88fr,1.12fr] lg:items-start"
      >
        <div className="relative overflow-hidden border-r border-white/8 bg-[linear-gradient(160deg,rgba(6,9,14,0.98),rgba(11,16,24,0.96),rgba(255,122,64,0.2))] p-6 text-white sm:p-8">
          <div className="absolute inset-0 opacity-70">
            <div className="absolute left-[14%] top-[10%] h-28 w-28 rounded-full bg-white/8 blur-2xl" />
            <div className="absolute bottom-[10%] right-[8%] h-40 w-40 rounded-full bg-[rgba(91,215,255,0.18)] blur-3xl" />
          </div>

          <div className="relative flex h-full flex-col gap-6">
            <div className="space-y-4">
              <div className="glass-chip border-white/12 bg-white/10 text-white/80">
                <Sparkles size={14} />
                Focused signup
              </div>

              <div>
                <h1 className="display-font max-w-md text-2xl font-extrabold leading-tight text-white sm:text-[2.15rem]">
                  Create your account inside one focused signup panel.
                </h1>
                <p className="mt-3 max-w-md text-sm leading-6 text-white/72">
                  The whole page stays centered on signup, with a simpler split layout and better loading feedback while you verify and submit.
                </p>
              </div>
            </div>

            <WorkerScene variant={isCustomer ? 'plumber' : 'painter'} compact className="bg-transparent" />

            <div className="flex flex-wrap gap-2">
              {['Customer or CSC', 'Location-aware'].map((item) => (
                <span key={item} className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/72">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          className="relative bg-[rgba(6,10,16,0.82)] p-6 sm:p-8 lg:p-9"
        >
          {busy ? <BusyOverlay label={busyLabel} className="rounded-none lg:rounded-l-none lg:rounded-r-[2rem]" /> : null}

          <div className={busy ? 'pointer-events-none opacity-70' : ''}>
            <div data-signup-item className="flex items-center justify-between gap-4">
              <div>
                <p className="section-label">Create account</p>
                <h2 className="mt-2 display-font text-2xl font-bold text-slate-950">Signup</h2>
              </div>
              <Link to="/login" className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white/6">
                Login
              </Link>
            </div>

            <div data-signup-item className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setRole('CUSTOMER');
                  setIdentifierType('phone');
                }}
                disabled={busy}
                className={`rounded-[1.25rem] border px-4 py-4 text-left transition ${role === 'CUSTOMER' ? 'border-[rgba(255,122,64,0.24)] bg-[rgba(255,122,64,0.1)] shadow-[0_18px_34px_rgba(255,122,64,0.14)]' : 'border-white/10 bg-white/4 hover:bg-white/6'}`.trim()}
              >
                <p className="text-sm font-bold text-slate-900">Customer signup</p>
                <p className="mt-1 text-sm text-slate-500">Book services and save your address for future orders.</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole('CSC_AGENT');
                  setIdentifierType('email');
                }}
                disabled={busy}
                className={`rounded-[1.25rem] border px-4 py-4 text-left transition ${role === 'CSC_AGENT' ? 'border-[rgba(91,215,255,0.26)] bg-[rgba(91,215,255,0.1)] shadow-[0_18px_34px_rgba(91,215,255,0.14)]' : 'border-white/10 bg-white/4 hover:bg-white/6'}`.trim()}
              >
                <p className="text-sm font-bold text-slate-900">CSC signup</p>
                <p className="mt-1 text-sm text-slate-500">Verify with OTP and move into the approval workflow.</p>
              </button>
            </div>

            {isCustomer ? (
              <div data-signup-item className="mt-4 flex gap-2 rounded-full border border-white/8 bg-white/4 p-1.5 sm:w-fit">
                <button
                  type="button"
                  onClick={() => setIdentifierType('phone')}
                  disabled={busy}
                  className={`rounded-full px-4 py-2.5 text-sm font-semibold ${identifierType === 'phone' ? 'bg-white/10 text-white shadow-[0_18px_30px_rgba(0,0,0,0.2)]' : 'text-slate-600'}`.trim()}
                >
                  Phone OTP
                </button>
                <button
                  type="button"
                  onClick={() => setIdentifierType('email')}
                  disabled={busy}
                  className={`rounded-full px-4 py-2.5 text-sm font-semibold ${identifierType === 'email' ? 'bg-white/10 text-white shadow-[0_18px_30px_rgba(0,0,0,0.2)]' : 'text-slate-600'}`.trim()}
                >
                  Email OTP
                </button>
              </div>
            ) : null}

            <form onSubmit={handleSignup} className="mt-6 space-y-4">
              <div data-signup-item className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="mb-1.5 block font-semibold">Full name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full px-4 py-3"
                    placeholder="Enter full name"
                    required
                  />
                </label>

                {useEmail ? (
                  <label className="text-sm text-slate-700">
                    <span className="mb-1.5 block font-semibold">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full px-4 py-3"
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                ) : (
                  <label className="text-sm text-slate-700">
                    <span className="mb-1.5 block font-semibold">Phone</span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="w-full px-4 py-3"
                      placeholder="10 digit phone"
                      required
                    />
                  </label>
                )}
              </div>

              <div data-signup-item className="surface-soft rounded-[1.35rem] p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MapPinned size={16} className="text-[var(--brand)]" />
                  Service location
                </p>
                <p className="mt-1 text-sm text-slate-500">Choose state, district, and block before continuing.</p>
                <div className="mt-4">
                  <LocationSelector
                    idPrefix="signup-location"
                    value={location}
                    onChange={setLocation}
                    required
                    disabled={busy}
                  />
                </div>
              </div>

              <div data-signup-item>
                <label className="text-sm text-slate-700">
                  <span className="mb-1.5 block font-semibold">Full address</span>
                  <textarea
                    rows={4}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="w-full px-4 py-3"
                    placeholder="House no., street, landmark, village/town, PIN"
                    required
                  />
                </label>
              </div>

              <div data-signup-item className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="mb-1.5 block font-semibold">Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full px-4 py-3"
                    minLength={6}
                    placeholder="Create a password"
                    required
                  />
                </label>

                <label className="text-sm text-slate-700">
                  <span className="mb-1.5 block font-semibold">OTP</span>
                  <input
                    type="text"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    className="w-full px-4 py-3"
                    placeholder="Enter verification code"
                    required
                  />
                </label>
              </div>

              <div data-signup-item className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={busy}
                  className="surface-card rounded-full px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:opacity-70"
                >
                  Request OTP
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_34px_rgba(255,122,64,0.24)] disabled:opacity-70"
                >
                  Complete signup
                  <ArrowRight size={16} />
                </button>
              </div>

              <p data-signup-item className="text-sm text-slate-600">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-[var(--brand)]">
                  Go to login
                </Link>
              </p>
            </form>
          </div>
        </motion.div>
      </motion.section>
    </div>
  );
}

export default Signup;
