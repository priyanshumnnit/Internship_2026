export function hasSubmittedCscDocuments(user) {
  const document = user?.cscDocument;
  if (!document) return false;

  return Boolean(
    document.aadhaarUrl
    && (document.licenseUrl || document.bankPassbookUrl)
    && (
      document.verificationCertificateUrl
      || document.cscIdOrVleCertificateUrl
      || document.characterCertificateUrl
    ),
  );
}

export function needsCscApproval(user) {
  return user?.role === 'CSC_AGENT' && user?.cscStatus !== 'APPROVED';
}

export function getCscOnboardingState(user) {
  if (user?.role !== 'CSC_AGENT') return 'not-csc';
  if (user?.cscStatus === 'APPROVED') return 'approved';
  if (user?.cscStatus === 'REJECTED') return 'rejected';
  if (hasSubmittedCscDocuments(user)) return 'pending-review';
  return 'missing-docs';
}
