import { logger } from "./logger";

export interface LeadNotice {
  id: string;
  fullName: string;
  companyName: string;
  phone: string;
  monthlyProjects: string;
  mainChallenge: string;
  preferredContactTime: string;
  source: string;
  interestedPlan?: string;
  userId?: string;
  createdAt: Date;
}

/**
 * Where demo / upgrade requests go after they are stored in `lead_requests`.
 * TODO(crm): implement with the CRM or a transactional e-mail to the sales inbox
 * and register it with `setLeadSink` at startup.
 */
export interface LeadSink {
  leadCreated(lead: LeadNotice): Promise<void>;
}

const maskPhone = (phone: string) => phone.replace(/\d(?=\d{2})/g, "•");

const logSink: LeadSink = {
  async leadCreated(lead) {
    logger.info(
      { leadId: lead.id, source: lead.source, plan: lead.interestedPlan, phone: maskPhone(lead.phone) },
      "lead.created (not forwarded: no CRM configured)",
    );
  },
};

let sink: LeadSink = logSink;

export function setLeadSink(next: LeadSink): void {
  sink = next;
}

/** The lead is already stored, so a failing sink never fails the request. */
export function forwardLead(lead: LeadNotice): void {
  sink.leadCreated(lead).catch((err: unknown) => {
    logger.error({ err, leadId: lead.id }, "Lead forwarding failed");
  });
}
