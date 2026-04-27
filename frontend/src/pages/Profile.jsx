import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, MapPinned, Save, FileCheck2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { getApiErrorMessage } from '../utils/api.js';
import { getCscOnboardingState } from '../utils/csc.js';

function ProfileField({ label, value }) {
  return (
    <div className="surface-card rounded-[1.4rem] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value || 'Not set'}</p>
    </div>
  );
}

function CscStatusBanner({ state, reviewNote }) {
  const contentMap = {
    'missing-docs': {
      icon: ShieldAlert,
      title: 'Complete your CSC onboarding',
      text: 'Upload Aadhaar, license, and verification certificate to unlock the CSC dashboard and worker tools.',
      borderColor: 'rgba(255, 122, 64, 0.24)',
      titleColor: '#ffe59a',
      iconBackground: 'rgba(255, 122, 64, 0.14)',
      iconColor: '#ffd08a',
    },
    'pending-review': {
      icon: FileCheck2,
      title: 'Documents submitted',
      text: 'Your documents are waiting for review by the block admin or super admin. You will unlock full CSC features after approval.',
      borderColor: 'rgba(91, 215, 255, 0.24)',
      titleColor: '#aae9ff',
      iconBackground: 'rgba(91, 215, 255, 0.12)',
      iconColor: '#87e5ff',
    },
    rejected: {
      icon: ShieldAlert,
      title: 'CSC review needs updates',
      text: 'Your previous submission was rejected. Update the required documents below and resubmit for review.',
      borderColor: 'rgba(255, 106, 135, 0.24)',
      titleColor: '#ffc2cf',
      iconBackground: 'rgba(255, 106, 135, 0.12)',
      iconColor: '#ff99b1',
    },
    approved: {
      icon: ShieldCheck,
      title: 'CSC access approved',
      text: 'Your CSC account is fully verified and all normal agent features are unlocked.',
      borderColor: 'rgba(45, 214, 143, 0.24)',
      titleColor: '#8cf1c3',
      iconBackground: 'rgba(45, 214, 143, 0.12)',
      iconColor: '#8cf1c3',
    },
  };

  const current = contentMap[state] || contentMap['missing-docs'];
  const Icon = current.icon;

  return (
    <div
      className="surface-panel rounded-[1.75rem] px-5 py-4 shadow-[0_18px_44px_rgba(0,0,0,0.22)]"
      style={{ borderColor: current.borderColor }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 rounded-2xl p-2"
          style={{ backgroundColor: current.iconBackground, color: current.iconColor }}
        >
          <Icon size={18} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: current.titleColor }}>{current.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-700">{current.text}</p>
          {reviewNote ? <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: current.titleColor }}>Reviewer note: {reviewNote}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Profile() {
  const { user, submitCscDocuments, refreshProfile, updateProfile } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    address: user?.address || '',
  });
  const [docs, setDocs] = useState({
    aadhaarUrl: user?.cscDocument?.aadhaarUrl || '',
    licenseUrl: user?.cscDocument?.licenseUrl || user?.cscDocument?.bankPassbookUrl || '',
    verificationCertificateUrl: user?.cscDocument?.verificationCertificateUrl || user?.cscDocument?.cscIdOrVleCertificateUrl || user?.cscDocument?.characterCertificateUrl || '',
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingDocs, setSavingDocs] = useState(false);

  const isCscAgent = user?.role === 'CSC_AGENT';
  const setupIntent = searchParams.get('setup') === 'csc';
  const cscOnboardingState = getCscOnboardingState(user);

  useEffect(() => {
    setProfileForm({
      name: user?.name || '',
      address: user?.address || '',
    });
    setDocs({
      aadhaarUrl: user?.cscDocument?.aadhaarUrl || '',
      licenseUrl: user?.cscDocument?.licenseUrl || user?.cscDocument?.bankPassbookUrl || '',
      verificationCertificateUrl:
        user?.cscDocument?.verificationCertificateUrl
        || user?.cscDocument?.cscIdOrVleCertificateUrl
        || user?.cscDocument?.characterCertificateUrl
        || '',
    });
  }, [user]);

  const profileFields = useMemo(() => ([
    ['User ID', user?.id],
    ['Role', user?.role],
    ['Email', user?.email],
    ['Phone', user?.phone],
    ['State', user?.state],
    ['District', user?.district],
    ['Block', user?.block],
    ['CSC Status', user?.cscStatus],
  ]), [user]);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setSavingProfile(true);

    try {
      await updateProfile(profileForm);
      await refreshProfile({ force: true });
      toast.success('Profile details updated.');
    } catch (submitError) {
      toast.error(getApiErrorMessage(submitError, 'Unable to update profile'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleCscDocumentSubmit(event) {
    event.preventDefault();
    setSavingDocs(true);

    try {
      await submitCscDocuments(docs);
      await refreshProfile({ force: true });
      toast.success('Documents submitted. Your CSC review status is now pending.');
    } catch (submitError) {
      toast.error(getApiErrorMessage(submitError, 'Unable to submit CSC documents'));
    } finally {
      setSavingDocs(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title={isCscAgent ? 'Profile & CSC Setup' : 'Profile'}
        subtitle={isCscAgent ? 'Finish your verification, manage your saved address, and keep your account ready for bookings.' : 'Manage your account details and the saved address used across the portal.'}
      />

      {isCscAgent ? (
        <CscStatusBanner
          state={cscOnboardingState}
          reviewNote={user?.cscDocument?.reviewNote}
        />
      ) : null}

      {setupIntent && isCscAgent ? (
        <div
          className="surface-soft rounded-[1.5rem] px-5 py-4 text-sm text-slate-700"
          style={{ borderColor: 'rgba(91, 215, 255, 0.22)' }}
        >
          Your CSC account is signed in, but dashboard access stays locked until your documents are submitted and approved. Start by saving your address and uploading the required verification files below.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {profileFields.map(([label, value]) => (
          <ProfileField key={label} label={label} value={value} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <form onSubmit={handleProfileSubmit} className="surface-panel rounded-[1.9rem] p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-[rgba(231,76,60,0.08)] p-3 text-[var(--brand)]">
              <MapPinned size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Saved Address</h2>
              <p className="text-sm text-slate-500">This address can be reused while placing customer orders.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="text-sm text-slate-700">
              <span className="mb-1.5 block font-semibold">Display Name</span>
              <input
                type="text"
                value={profileForm.name}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-[1.1rem] border border-[rgba(15,23,42,0.12)] bg-white px-4 py-3"
                placeholder="Your full name"
              />
            </label>

            <label className="text-sm text-slate-700">
              <span className="mb-1.5 block font-semibold">Full Address</span>
              <textarea
                rows={5}
                value={profileForm.address}
                onChange={(event) => setProfileForm((prev) => ({ ...prev, address: event.target.value }))}
                className="w-full rounded-[1.1rem] border border-[rgba(15,23,42,0.12)] bg-white px-4 py-3"
                placeholder="House no., street, landmark, village/town, block, district, state, PIN"
                required
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="mt-4 inline-flex items-center gap-2 rounded-[1rem] bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_32px_rgba(231,76,60,0.22)]"
          >
            <Save size={16} />
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </form>

        {isCscAgent ? (
          <form onSubmit={handleCscDocumentSubmit} className="surface-panel rounded-[1.9rem] p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[rgba(91,215,255,0.12)] p-3 text-[var(--accent-strong)]">
                <FileCheck2 size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">CSC Verification Documents</h2>
                <p className="text-sm text-slate-500">Required before block or super admin approval.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <input
                type="url"
                value={docs.aadhaarUrl}
                onChange={(event) => setDocs((prev) => ({ ...prev, aadhaarUrl: event.target.value }))}
                placeholder="Aadhaar certificate URL"
                className="rounded-[1.1rem] border border-[rgba(15,23,42,0.12)] bg-white px-4 py-3"
                required
              />
              <input
                type="url"
                value={docs.licenseUrl}
                onChange={(event) => setDocs((prev) => ({ ...prev, licenseUrl: event.target.value }))}
                placeholder="License document URL"
                className="rounded-[1.1rem] border border-[rgba(15,23,42,0.12)] bg-white px-4 py-3"
                required
              />
              <input
                type="url"
                value={docs.verificationCertificateUrl}
                onChange={(event) => setDocs((prev) => ({ ...prev, verificationCertificateUrl: event.target.value }))}
                placeholder="Verification certificate URL"
                className="rounded-[1.1rem] border border-[rgba(15,23,42,0.12)] bg-white px-4 py-3"
                required
              />
            </div>

            <button
              type="submit"
              disabled={savingDocs}
              className="mt-4 inline-flex items-center gap-2 rounded-[1rem] bg-[var(--accent-strong)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_32px_rgba(91,215,255,0.22)]"
            >
              <ShieldCheck size={16} />
              {savingDocs ? 'Submitting...' : 'Submit For Review'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

export default Profile;
