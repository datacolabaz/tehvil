import { logger } from "./logger";

export interface EstimateSentNotice {
  projectId: string;
  projectName: string;
  clientName: string;
  phone: string;
  email?: string;
  url: string;
  version: number;
  attachPdf: boolean;
}

export interface ClientDecisionNotice {
  projectId: string;
  projectName: string;
  ownerUserId: string;
  clientName: string;
  version: number;
}

/**
 * Outgoing messages for AI Smeta. TODO(notify): implement with an SMS provider
 * and transactional e-mail; owner notifications need the owner's contact from Clerk.
 */
export interface SmetaNotifier {
  estimateSent(notice: EstimateSentNotice): Promise<void>;
  estimateApproved(notice: ClientDecisionNotice & { total: number }): Promise<void>;
  revisionRequested(notice: ClientDecisionNotice & { message: string }): Promise<void>;
}

const maskPhone = (phone: string) => phone.replace(/\d(?=\d{2})/g, "•");

const logNotifier: SmetaNotifier = {
  async estimateSent(n) {
    logger.info({ projectId: n.projectId, version: n.version, phone: maskPhone(n.phone), email: Boolean(n.email), attachPdf: n.attachPdf }, "smeta.estimate_sent (notification not delivered: no provider configured)");
  },
  async estimateApproved(n) {
    logger.info({ projectId: n.projectId, version: n.version }, "smeta.estimate_approved (notification not delivered: no provider configured)");
  },
  async revisionRequested(n) {
    logger.info({ projectId: n.projectId, version: n.version }, "smeta.revision_requested (notification not delivered: no provider configured)");
  },
};

let notifier: SmetaNotifier = logNotifier;

export function setSmetaNotifier(next: SmetaNotifier): void {
  notifier = next;
}

/** Notifications never fail the request that triggered them. */
export function notifySmeta<K extends keyof SmetaNotifier>(kind: K, notice: Parameters<SmetaNotifier[K]>[0]): void {
  (notifier[kind] as (n: typeof notice) => Promise<void>)(notice).catch((err: unknown) => {
    logger.error({ err, kind }, "Smeta notification failed");
  });
}
