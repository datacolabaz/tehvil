/**
 * Answers from the sign-up form that Clerk does not store for us (phone, consent time).
 * Kept in sessionStorage only until onboarding saves them to `/api/contractor/onboarding`.
 */
export interface PendingSignup {
  fullName: string;
  phone: string;
  termsAcceptedAt: string;
  method: 'email' | 'google';
}

const KEY = 'tehvil-contractor-signup';

export function savePendingSignup(data: PendingSignup) {
  try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode: onboarding asks again */ }
}

export function readPendingSignup(): PendingSignup | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as PendingSignup : null;
  } catch { return null; }
}

export function clearPendingSignup() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
