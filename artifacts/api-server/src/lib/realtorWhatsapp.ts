import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import {
  db,
  propertyPassportsTable,
  realtorAppointmentsTable,
  realtorLeadsTable,
  realtorMessagesTable,
  realtorWhatsappSettingsTable,
  type LeadBotStateJson,
} from "@workspace/db";
import { logger } from "./logger";
import {
  DEAL_LABEL,
  type LeadRow,
  matchListings,
  normalizePhone,
  notify,
  priceText,
  publicOrigin,
} from "./realtorCore";

/*
 * WhatsApp automation.
 *
 * Two modes:
 *  - manual: Təhvil prepares every message (greeting, qualifying questions,
 *    matching listings, appointment slots, follow-ups, reminders) and the realtor
 *    sends it with one tap through a wa.me click-to-chat link.
 *  - cloud_api: the realtor connects a WhatsApp Business number (Meta Cloud API).
 *    Incoming messages reach /api/whatsapp/webhook; the qualifying bot answers
 *    automatically and reminders/follow-ups are sent by the scheduler.
 *
 * Server configuration (names only, never commit values):
 *   WHATSAPP_VERIFY_TOKEN   webhook verification token set in the Meta app
 *   WHATSAPP_APP_SECRET     Meta app secret, used to verify webhook signatures
 *   WHATSAPP_TOKEN_KEY      secret used to encrypt realtors' access tokens at rest
 *   WHATSAPP_GRAPH_VERSION  optional, defaults to v21.0
 */

export type SettingsRow = typeof realtorWhatsappSettingsTable.$inferSelect;

export const DEFAULT_TEXTS = {
  greeting: "Salam! Mesajınız üçün təşəkkür edirik. Sizə ən uyğun mənzili tez tapmaq üçün bir neçə qısa sual verəcəyəm.",
  followUp: "Salam, {ad}! Mənzil axtarışınız hələ aktualdırmı? Yeni uyğun variantlar var — istəsəniz göndərim.",
  reminder: "Salam, {ad}! Xatırlatma: {vaxt} {unvan} ünvanında görüşümüz var. Görüşənədək!",
};

export const cloudApiAvailable = () => !!(process.env.WHATSAPP_TOKEN_KEY && process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET);

function key() {
  const raw = process.env.WHATSAPP_TOKEN_KEY;
  if (!raw) throw new Error("WHATSAPP_TOKEN_KEY is not configured");
  return createHash("sha256").update(raw).digest();
}
export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
function decryptToken(value: string) {
  const [iv, tag, enc] = value.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function verifySignature(rawBody: Buffer, header: string | undefined) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function getSettings(userId: string): Promise<SettingsRow> {
  const [row] = await db.select().from(realtorWhatsappSettingsTable).where(eq(realtorWhatsappSettingsTable.userId, userId));
  if (row) return row;
  const [created] = await db.insert(realtorWhatsappSettingsTable).values({ userId }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(realtorWhatsappSettingsTable).where(eq(realtorWhatsappSettingsTable.userId, userId));
  return again;
}

export const isConnected = (s: SettingsRow) => s.mode === "cloud_api" && !!s.phoneNumberId && !!s.accessTokenEnc && cloudApiAvailable();
export const fill = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? "");

type SendResult = { status: "sent" | "failed" | "manual"; waMessageId?: string; error?: string };

async function callCloudApi(s: SettingsRow, payload: Record<string, unknown>): Promise<SendResult> {
  try {
    const version = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";
    const res = await fetch(`https://graph.facebook.com/${version}/${s.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${decryptToken(s.accessTokenEnc!)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    if (!res.ok) return { status: "failed", error: `${json.error?.code ?? res.status}: ${json.error?.message ?? "WhatsApp API error"}`.slice(0, 500) };
    return { status: "sent", waMessageId: json.messages?.[0]?.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message.slice(0, 500) : "WhatsApp API unreachable" };
  }
}

/**
 * Sends one message and logs it. Free-form text is only allowed within 24 hours
 * of the customer's last message; outside that window an approved template is used
 * when configured, otherwise the message is kept for the realtor to send manually.
 */
export async function sendToLead(opts: { settings: SettingsRow; lead: LeadRow; body: string; kind: string; template?: { name: string; params: string[] } }) {
  const { settings, lead, body, kind, template } = opts;
  const to = normalizePhone(lead.phone);
  let result: SendResult = { status: "manual" };
  if (isConnected(settings) && to) {
    const inWindow = !!lead.lastInboundAt && Date.now() - lead.lastInboundAt.getTime() < 23.5 * 3_600_000;
    if (inWindow) {
      result = await callCloudApi(settings, { to, type: "text", text: { body, preview_url: true } });
    } else if (template?.name) {
      result = await callCloudApi(settings, {
        to, type: "template",
        template: { name: template.name, language: { code: settings.templateLanguage || "az" }, components: [{ type: "body", parameters: template.params.map((text) => ({ type: "text", text })) }] },
      });
    }
  }
  const [message] = await db.insert(realtorMessagesTable).values({
    ownerUserId: lead.ownerUserId, leadId: lead.id, direction: "out", kind, body,
    status: result.status, waMessageId: result.waMessageId ?? null, error: result.error ?? null,
  }).returning();
  if (result.status === "sent") {
    await db.update(realtorLeadsTable).set({ lastContactAt: new Date(), updatedAt: new Date() }).where(eq(realtorLeadsTable.id, lead.id));
  }
  if (result.status === "failed") logger.warn({ leadId: lead.id, kind, error: result.error }, "realtor.whatsapp_send_failed");
  return message;
}

/* ------------------------------------------------------------- bot helpers */

const AZ_DAYS = ["Bazar", "Bazar ertəsi", "Çərşənbə axşamı", "Çərşənbə", "Cümə axşamı", "Cümə", "Şənbə"];
const AZ_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"];
/** Formats an instant in Baku time (UTC+4). */
export function bakuText(d: Date) {
  const b = new Date(d.getTime() + 4 * 3_600_000);
  return `${AZ_DAYS[b.getUTCDay()]}, ${b.getUTCDate()} ${AZ_MONTHS[b.getUTCMonth()]}, ${String(b.getUTCHours()).padStart(2, "0")}:${String(b.getUTCMinutes()).padStart(2, "0")}`;
}

/** Next three free one-hour slots inside working hours, skipping Sundays and booked times. */
export async function nextSlots(userId: string, s: Pick<SettingsRow, "workdayStartHour" | "workdayEndHour">, count = 3) {
  const now = Date.now();
  const booked = await db.select({ startsAt: realtorAppointmentsTable.startsAt }).from(realtorAppointmentsTable)
    .where(and(eq(realtorAppointmentsTable.ownerUserId, userId), eq(realtorAppointmentsTable.status, "planned")));
  const busy = new Set(booked.map((b) => Math.floor(b.startsAt.getTime() / 3_600_000)));
  const slots: Date[] = [];
  const start = Math.max(0, Math.min(23, s.workdayStartHour));
  const end = Math.max(start + 1, Math.min(24, s.workdayEndHour));
  for (let day = 0; day < 10 && slots.length < count; day++) {
    for (const hour of [start + 1, start + 3, end - 2, start + 5, end - 1]) {
      if (hour < start || hour >= end) continue;
      const base = new Date(now + 4 * 3_600_000);
      base.setUTCDate(base.getUTCDate() + day);
      base.setUTCHours(hour, 0, 0, 0);
      const at = new Date(base.getTime() - 4 * 3_600_000);
      if (at.getTime() < now + 2 * 3_600_000) continue;
      if (base.getUTCDay() === 0) continue;
      if (busy.has(Math.floor(at.getTime() / 3_600_000))) continue;
      if (slots.some((x) => x.getTime() === at.getTime())) continue;
      slots.push(at);
      break; // at most one slot per day keeps the choice simple
    }
  }
  return slots;
}

export function parseDeal(text: string): "sale" | "rent" | null {
  const t = text.toLocaleLowerCase("az");
  if (/^\s*1\b/.test(t) || /alq|alma|almaq|al\b|sat|buy|купить|покуп/.test(t)) return "sale";
  if (/^\s*2\b/.test(t) || /icar|kiray|rent|аренд|снять/.test(t)) return "rent";
  return null;
}

/** "150 min", "120-150k", "150000", "1.2 mln" → AZN amounts. */
export function parseBudget(text: string): { min: number | null; max: number | null } | null {
  const t = text.toLocaleLowerCase("az").replace(/\s+/g, " ");
  const matches = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(k|min|мин|тыс|mln|млн|milyon)?/g)];
  const values = matches.map((m) => {
    let v = Number(m[1].replace(",", "."));
    const unit = m[2] ?? "";
    if (/^(k|min|мин|тыс)$/.test(unit)) v *= 1_000;
    if (/^(mln|млн|milyon)$/.test(unit)) v *= 1_000_000;
    if (!unit && v < 10_000 && /min|k\b/.test(t)) v *= 1_000;
    return v;
  }).filter((v) => v >= 100);
  if (!values.length) return null;
  if (values.length >= 2) return { min: Math.min(values[0], values[1]), max: Math.max(values[0], values[1]) };
  return { min: null, max: values[0] };
}

export function parseRooms(text: string) {
  const m = text.match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 0 && n <= 20 ? n : null;
}

const QUESTIONS = {
  deal: "1/5 — Mənzili almaq, yoxsa icarəyə götürmək istəyirsiniz?\n1 — Alqı\n2 — İcarə",
  district: "2/5 — Hansı rayon və ya metro yaxınlığı sizə uyğundur?",
  budget: "3/5 — Büdcəniz nə qədərdir? (məs. 150 min AZN və ya 100–150 min)",
  rooms: "4/5 — Neçə otaqlı mənzil axtarırsınız?",
  timeframe: "5/5 — Nə vaxt almaq və ya köçmək istəyirsiniz? (məs. bu ay, 3 ay ərzində)",
};

async function setBot(lead: LeadRow, state: LeadBotStateJson, patch: Partial<typeof realtorLeadsTable.$inferInsert> = {}) {
  const [next] = await db.update(realtorLeadsTable).set({ botState: state, updatedAt: new Date(), ...patch })
    .where(eq(realtorLeadsTable.id, lead.id)).returning();
  return next;
}

/** Listing lines with a passport link when the apartment is Təhvil-certified. */
export async function listingLines(userId: string, lead: LeadRow, origin: string) {
  const listings = await matchListings(lead, userId, 3);
  const passports = listings.length ? await db.select({ listingId: propertyPassportsTable.listingId, publicId: propertyPassportsTable.publicId })
    .from(propertyPassportsTable).where(and(eq(propertyPassportsTable.ownerUserId, userId), eq(propertyPassportsTable.status, "published"), inArray(propertyPassportsTable.listingId, listings.map((l) => l.id)))) : [];
  const passportFor = new Map(passports.map((p) => [p.listingId, p.publicId]));
  const lines = listings.map((l, i) => {
    const pid = passportFor.get(l.id);
    const facts = [l.district, l.rooms != null ? `${l.rooms} otaq` : "", l.areaM2 ? `${l.areaM2} m²` : "", priceText(l.price, l.currency)].filter(Boolean).join(" · ");
    return `${i + 1}) ${l.title}\n${facts}${pid ? `\n✅ Təhvil Sertifikatlı — təmir tarixçəsi: ${origin}/p/${pid}` : ""}`;
  });
  return { listings, text: lines.join("\n\n") };
}

export function slotsText(slots: Date[]) {
  return `Mənzilə baxış üçün uyğun vaxtı seçin:\n${slots.map((s, i) => `${i + 1} — ${bakuText(s)}`).join("\n")}\nRəqəmi göndərin.`;
}

/**
 * Qualifying bot for one incoming message. Returns without replying when the bot
 * is off or the conversation is already with the realtor.
 */
export async function runBot(settings: SettingsRow, leadIn: LeadRow, text: string) {
  let lead = leadIn;
  const origin = publicOrigin();
  const userId = lead.ownerUserId;
  const send = (body: string, kind: string) => sendToLead({ settings, lead, body, kind });
  const state = lead.botState;

  if (!settings.autoReplyEnabled || state?.step === "done" || state?.step === "handoff") {
    await notify(userId, { kind: "new_message", title: `${lead.fullName} yeni mesaj yazdı`, body: text.slice(0, 140), href: `/realtor/leads?lead=${lead.id}` });
    return;
  }

  if (!state) {
    lead = await setBot(lead, { step: "deal" });
    await send(settings.greeting || DEFAULT_TEXTS.greeting, "auto_reply");
    await send(QUESTIONS.deal, "question");
    return;
  }

  switch (state.step) {
    case "deal": {
      const deal = parseDeal(text);
      if (!deal) { await send(QUESTIONS.deal, "question"); return; }
      lead = await setBot(lead, { step: "district" }, { dealType: deal, status: lead.status === "new" ? "contacted" : lead.status });
      await send(QUESTIONS.district, "question");
      return;
    }
    case "district": {
      lead = await setBot(lead, { step: "budget" }, { district: text.trim().slice(0, 120) });
      await send(QUESTIONS.budget, "question");
      return;
    }
    case "budget": {
      const budget = parseBudget(text);
      lead = await setBot(lead, { step: "rooms" }, budget ? { budgetMin: budget.min, budgetMax: budget.max } : { notes: `${lead.notes}\nBüdcə: ${text.trim()}`.trim().slice(0, 4000) });
      await send(QUESTIONS.rooms, "question");
      return;
    }
    case "rooms": {
      lead = await setBot(lead, { step: "timeframe" }, { rooms: parseRooms(text) });
      await send(QUESTIONS.timeframe, "question");
      return;
    }
    case "timeframe": {
      lead = await setBot(lead, { step: "timeframe" }, { timeframe: text.trim().slice(0, 120), status: ["new", "contacted"].includes(lead.status) ? "interested" : lead.status });
      const { listings, text: lines } = await listingLines(userId, lead, origin);
      if (listings.length) await send(`Təşəkkürlər! Sizin üçün uyğun variantlar:\n\n${lines}`, "listing");
      else await send(`Təşəkkürlər! ${lead.dealType ? DEAL_LABEL[lead.dealType] : "Axtarış"} üzrə uyğun variantları realtorumuz qısa zamanda göndərəcək.`, "listing");
      const slots = await nextSlots(userId, settings);
      if (!slots.length) {
        lead = await setBot(lead, { step: "handoff", offeredListingIds: listings.map((l) => l.id) });
        await notify(userId, { kind: "lead_ready", title: `${lead.fullName} suallara cavab verdi`, body: "Görüş vaxtını özünüz razılaşdırın.", href: `/realtor/leads?lead=${lead.id}` });
        return;
      }
      lead = await setBot(lead, { step: "slots", offeredSlots: slots.map((s) => s.toISOString()), offeredListingIds: listings.map((l) => l.id) });
      await send(slotsText(slots), "slots");
      return;
    }
    case "slots": {
      const choice = Number(text.trim().match(/^\d/)?.[0] ?? NaN);
      const slot = state.offeredSlots?.[choice - 1];
      if (!slot) {
        lead = await setBot(lead, { ...state, step: "handoff" });
        await send("Anladım. Realtorumuz sizinlə əlaqə saxlayıb uyğun vaxtı razılaşdıracaq.", "handoff");
        await notify(userId, { kind: "lead_ready", title: `${lead.fullName} görüş vaxtını özü seçmək istəyir`, body: text.slice(0, 140), href: `/realtor/leads?lead=${lead.id}` });
        return;
      }
      const startsAt = new Date(slot);
      const listingId = lead.listingId ?? state.offeredListingIds?.[0] ?? null;
      await db.insert(realtorAppointmentsTable).values({ ownerUserId: userId, leadId: lead.id, listingId, agentId: lead.agentId, startsAt, notes: "WhatsApp bot ilə planlaşdırıldı" });
      lead = await setBot(lead, { ...state, step: "done" }, { status: "meeting", readyForMeeting: true });
      await send(`Əla! Görüş təyin olundu: ${bakuText(startsAt)}. Görüşdən əvvəl xatırlatma göndərəcəyik.`, "confirm");
      await notify(userId, { kind: "lead_ready", title: `${lead.fullName} görüşə hazırdır`, body: `Görüş: ${bakuText(startsAt)}`, href: `/realtor/appointments` });
      return;
    }
  }
}

/** Finds the active lead for a phone number or creates one. */
export async function leadForInbound(userId: string, phone: string, name: string, text: string) {
  const digits = normalizePhone(phone);
  const candidates = await db.select().from(realtorLeadsTable)
    .where(and(eq(realtorLeadsTable.ownerUserId, userId), notInArray(realtorLeadsTable.status, ["deal", "lost"])))
    .orderBy(desc(realtorLeadsTable.updatedAt)).limit(500);
  const existing = candidates.find((l) => normalizePhone(l.phone) === digits);
  if (existing) return { lead: existing, created: false };
  // A message sent from a passport page carries its link: attach the listing.
  const publicId = text.match(/\/p\/([a-z0-9]{6,16})/)?.[1];
  let listingId: string | null = null;
  if (publicId) {
    const [p] = await db.select({ listingId: propertyPassportsTable.listingId }).from(propertyPassportsTable)
      .where(and(eq(propertyPassportsTable.publicId, publicId), eq(propertyPassportsTable.ownerUserId, userId)));
    listingId = p?.listingId ?? null;
  }
  const [lead] = await db.insert(realtorLeadsTable).values({
    ownerUserId: userId, fullName: name || `+${digits}`, phone: `+${digits}`, source: "whatsapp", status: "new", listingId,
    nextAction: "WhatsApp sorğusuna baxın", nextActionAt: new Date(Date.now() + 30 * 60_000),
  }).returning();
  await notify(userId, { kind: "new_lead", title: `Yeni WhatsApp lead: ${lead.fullName}`, body: text.slice(0, 140), href: `/realtor/leads?lead=${lead.id}` });
  return { lead, created: true };
}

type WebhookValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: { from?: string; id?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[];
};

export async function handleWebhook(body: { entry?: { changes?: { value?: WebhookValue }[] }[] }) {
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId || !value?.messages?.length) continue;
      const [settings] = await db.select().from(realtorWhatsappSettingsTable).where(eq(realtorWhatsappSettingsTable.phoneNumberId, phoneNumberId));
      if (!settings || settings.mode !== "cloud_api") continue;
      for (const msg of value.messages) {
        if (!msg.from) continue;
        const text = msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? `[${msg.type ?? "mesaj"}]`;
        const name = value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? "";
        const { lead } = await leadForInbound(settings.userId, msg.from, name, text);
        await db.insert(realtorMessagesTable).values({ ownerUserId: settings.userId, leadId: lead.id, direction: "in", kind: "inbound", body: text.slice(0, 4000), status: "received", waMessageId: msg.id ?? null });
        const now = new Date();
        const [fresh] = await db.update(realtorLeadsTable).set({ lastInboundAt: now, lastContactAt: now, followUpSentAt: null, updatedAt: now })
          .where(eq(realtorLeadsTable.id, lead.id)).returning();
        await runBot(settings, fresh, text);
      }
    }
  }
}
