import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, notInArray, or } from "drizzle-orm";
import { db, realtorAppointmentsTable, realtorLeadsTable, realtorListingsTable, realtorWhatsappSettingsTable } from "@workspace/db";
import { logger } from "./logger";
import { notify } from "./realtorCore";
import { bakuText, DEFAULT_TEXTS, fill, getSettings, sendToLead, type SettingsRow } from "./realtorWhatsapp";

/*
 * Background jobs, every 5 minutes (set REALTOR_SCHEDULER=off to disable on extra instances).
 * Each job claims rows with a conditional UPDATE … RETURNING, so running several
 * API instances never sends the same reminder twice.
 *
 *  1. Next-action reminders: the realtor planned a follow-up time and it has passed.
 *  2. Appointment reminders to the client (WhatsApp) and the realtor (in-app).
 *  3. Follow-ups to leads who went quiet.
 */

const INTERVAL_MS = 5 * 60_000;
const settingsCache = new Map<string, SettingsRow>();
async function settingsFor(userId: string) {
  if (!settingsCache.has(userId)) settingsCache.set(userId, await getSettings(userId));
  return settingsCache.get(userId)!;
}

async function nextActionReminders(now: Date) {
  const due = await db.update(realtorLeadsTable).set({ reminderSentAt: now })
    .where(and(isNotNull(realtorLeadsTable.nextActionAt), lte(realtorLeadsTable.nextActionAt, now), isNull(realtorLeadsTable.reminderSentAt), notInArray(realtorLeadsTable.status, ["deal", "lost"])))
    .returning();
  for (const lead of due) {
    await notify(lead.ownerUserId, { kind: "reminder_due", title: `Xatırlatma: ${lead.fullName}`, body: lead.nextAction || "Növbəti addımın vaxtı çatıb", href: `/realtor/leads?lead=${lead.id}` });
  }
}

async function appointmentReminders(now: Date) {
  // Widest supported window is 72 h; the per-realtor setting is checked below.
  const candidates = await db.select().from(realtorAppointmentsTable)
    .where(and(eq(realtorAppointmentsTable.status, "planned"), isNull(realtorAppointmentsTable.reminderSentAt), gt(realtorAppointmentsTable.startsAt, now), lt(realtorAppointmentsTable.startsAt, new Date(now.getTime() + 72 * 3_600_000))));
  for (const appt of candidates) {
    const settings = await settingsFor(appt.ownerUserId);
    if (appt.startsAt.getTime() - now.getTime() > settings.reminderHoursBefore * 3_600_000) continue;
    const [claimed] = await db.update(realtorAppointmentsTable).set({ reminderSentAt: now })
      .where(and(eq(realtorAppointmentsTable.id, appt.id), isNull(realtorAppointmentsTable.reminderSentAt))).returning();
    if (!claimed) continue;
    const [lead] = appt.leadId ? await db.select().from(realtorLeadsTable).where(eq(realtorLeadsTable.id, appt.leadId)) : [];
    const [listing] = appt.listingId ? await db.select().from(realtorListingsTable).where(eq(realtorListingsTable.id, appt.listingId)) : [];
    const place = listing ? [listing.district, listing.address].filter(Boolean).join(", ") : "razılaşdırılmış";
    await notify(appt.ownerUserId, { kind: "appointment_soon", title: `Görüş: ${bakuText(appt.startsAt)}`, body: [lead?.fullName, listing?.title].filter(Boolean).join(" · "), href: "/realtor/appointments" });
    if (settings.reminderEnabled && lead?.phone) {
      const vars = { ad: lead.fullName.split(" ")[0], vaxt: bakuText(appt.startsAt), unvan: place };
      await sendToLead({
        settings, lead, kind: "reminder",
        body: fill(settings.reminderText || DEFAULT_TEXTS.reminder, vars),
        template: settings.reminderTemplate ? { name: settings.reminderTemplate, params: [vars.ad, vars.vaxt, vars.unvan] } : undefined,
      });
    }
  }
}

async function followUps(now: Date) {
  const enabled = await db.select().from(realtorWhatsappSettingsTable).where(eq(realtorWhatsappSettingsTable.followUpEnabled, true));
  for (const s of enabled) {
    settingsCache.set(s.userId, s);
    const quietSince = new Date(now.getTime() - s.followUpHours * 3_600_000);
    const leads = await db.update(realtorLeadsTable).set({ followUpSentAt: now })
      .where(and(
        eq(realtorLeadsTable.ownerUserId, s.userId),
        inArray(realtorLeadsTable.status, ["new", "contacted", "interested"]),
        isNull(realtorLeadsTable.followUpSentAt),
        or(lt(realtorLeadsTable.lastContactAt, quietSince), and(isNull(realtorLeadsTable.lastContactAt), lt(realtorLeadsTable.createdAt, quietSince))),
      )).returning();
    for (const lead of leads) {
      const vars = { ad: lead.fullName.split(" ")[0] };
      const message = await sendToLead({
        settings: s, lead, kind: "follow_up",
        body: fill(s.followUpText || DEFAULT_TEXTS.followUp, vars),
        template: s.followUpTemplate ? { name: s.followUpTemplate, params: [vars.ad] } : undefined,
      });
      if (message.status !== "sent") {
        await notify(s.userId, { kind: "follow_up", title: `Follow-up lazımdır: ${lead.fullName}`, body: "Hazır mesaj WhatsApp bölməsindədir — bir kliklə göndərin.", href: `/realtor/leads?lead=${lead.id}` });
      }
    }
  }
}

export async function runRealtorJobs(now = new Date()) {
  settingsCache.clear();
  for (const [name, job] of [["next_action", nextActionReminders], ["appointments", appointmentReminders], ["follow_ups", followUps]] as const) {
    try { await job(now); } catch (err) { logger.error({ err, job: name }, "realtor.scheduler_job_failed"); }
  }
}

export function startRealtorScheduler() {
  if (process.env.REALTOR_SCHEDULER === "off") return;
  const timer = setInterval(() => { void runRealtorJobs(); }, INTERVAL_MS);
  timer.unref();
  setTimeout(() => { void runRealtorJobs(); }, 20_000).unref();
}
