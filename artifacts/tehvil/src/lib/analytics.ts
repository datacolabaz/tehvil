/**
 * Product analytics for the contractor funnel.
 *
 * Events are typed here and sent to one `AnalyticsSink`. No vendor is wired yet:
 * development logs to the console, production drops events. To connect a tool
 * (PostHog, GA4, Amplitude…), call `setAnalyticsSink` once in `main.tsx`.
 *
 * Never put personal data (names, phones, e-mails, addresses, tokens) in properties.
 */

type Source = 'landing' | 'pricing' | 'onboarding' | 'dashboard' | 'estimate' | 'upgrade' | 'plan_page';

export interface AnalyticsEvents {
  contractor_landing_viewed: { referrer?: string };
  contractor_signup_started: { method: 'email' | 'google'; source: Source };
  contractor_signup_completed: { method: 'email' | 'google' };
  onboarding_completed: { businessType?: string; monthlyProjects?: string; mainChallenge?: string; skipped?: boolean };
  company_profile_completed: { hasLogo: boolean; services: number; source: 'onboarding' | 'settings' };
  estimate_created: { projectId: string; total: number; sections: number; guided: boolean; demo: boolean };
  estimate_shared: { projectId: string; version: number; demo: boolean; first: boolean };
  estimate_client_viewed: { version: number; demo: boolean };
  estimate_client_approved: { version: number; total: number; demo: boolean };
  change_order_created: { projectId: string; impact: number; demo: boolean };
  /** `projectId` is absent when the client decides on the public page (it only knows the share token). */
  change_order_approved: { projectId?: string; by: 'contractor' | 'client'; demo: boolean };
  expense_added: { projectId: string; amount: number; category: string; demo: boolean };
  photo_evidence_added: { projectId: string; phase: string; demo: boolean };
  export_started: { projectId: string; kind: string; demo: boolean };
  export_completed: { projectId: string; kind: string; demo: boolean; ok: boolean };
  upgrade_clicked: { plan: string; feature?: string; source: Source };
  demo_requested: { source: string; monthlyProjects: string; interestedPlan?: string };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

export interface AnalyticsSink {
  track<E extends AnalyticsEventName>(event: E, properties: AnalyticsEvents[E]): void;
}

const consoleSink: AnalyticsSink = {
  track(event, properties) {
    console.info('[analytics]', event, properties);
  },
};
const noopSink: AnalyticsSink = { track() {} };

let sink: AnalyticsSink = import.meta.env.DEV ? consoleSink : noopSink;
const buffer: { event: AnalyticsEventName; properties: unknown; at: string }[] = [];

export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next;
}

/** Fire-and-forget; analytics must never break a user action. */
export function track<E extends AnalyticsEventName>(event: E, properties: AnalyticsEvents[E]): void {
  buffer.push({ event, properties, at: new Date().toISOString() });
  if (buffer.length > 50) buffer.shift();
  try { sink.track(event, properties); } catch { /* ignore sink failures */ }
}

/** Recent events of this page session (for tests and debugging). */
export function recentEvents(): readonly { event: AnalyticsEventName; properties: unknown; at: string }[] {
  return buffer;
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __tehvilAnalytics?: typeof recentEvents }).__tehvilAnalytics = recentEvents;
}
