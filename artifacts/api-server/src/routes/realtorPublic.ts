import { Readable } from "node:stream";
import { getAuth } from "@clerk/express";
import { and, eq, gt, notInArray } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ConfirmContractorWorkBody,
  ConfirmContractorWorkParams,
  CreatePublicPassportLeadBody,
  CreatePublicPassportLeadParams,
  DecideOwnerWorkBody,
  DecideOwnerWorkParams,
  GetContractorConfirmationParams,
  GetOwnerConfirmationParams,
  GetPublicPassportParams,
  GetRealtorMediaParams,
  RecordPublicPassportEventBody,
  RecordPublicPassportEventParams,
} from "@workspace/api-zod";
import { db, passportWorksTable, propertyPassportsTable, realtorEventsTable, realtorLeadsTable, realtorMediaTable } from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { rateLimit } from "../lib/rateLimit";
import { hashToken, notify, passportDtos, publicOrigin, publicPassportDto, publicWorkDto, trustLevel, type PassportRow } from "../lib/realtorCore";
import { isMediaPublic } from "../lib/realtorMedia";

const router: IRouter = Router();
const storage = new ObjectStorageService();

const readLimit = rateLimit({ windowMs: 60_000, max: 240, key: (req) => `rp:${req.ip}` });
const eventLimit = rateLimit({ windowMs: 60_000, max: 30, key: (req) => `re:${req.ip}` });
// Owners may accept many works in a row; limits are per link (token) and per client.
const writeLimit = rateLimit({ windowMs: 10 * 60_000, max: 40, key: (req) => `rw:${req.ip}:${req.params.token ?? ""}` });
const leadLimit = rateLimit({ windowMs: 10 * 60_000, max: 5, key: (req) => `rl:${req.ip}:${req.params.publicId ?? ""}` });

const gone = (res: Response) => { res.status(404).json({ error: "Bu link aktiv deyil. Realtordan yeni link istəyin." }); };

/* ---------------------------------------------------------------- media files */

router.get("/realtor-media/:mediaId", readLimit, async (req, res): Promise<void> => {
  const params = GetRealtorMediaParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "File not found" }); return; }
  const [media] = await db.select().from(realtorMediaTable).where(eq(realtorMediaTable.id, params.data.mediaId));
  if (!media) { res.status(404).json({ error: "File not found" }); return; }
  const isOwner = getAuth(req).userId === media.ownerUserId;
  const isPublic = !isOwner && (await isMediaPublic(media.id));
  if (!isOwner && !isPublic) { res.status(404).json({ error: "File not found" }); return; }
  try {
    const file = await storage.getObjectEntityFile(media.objectPath);
    const response = await storage.downloadObject(file, 0);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Cache-Control", isPublic ? "public, max-age=600" : "private, max-age=600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "File not found" }); return; }
    req.log.error({ err: error }, "Failed to stream realtor media");
    res.status(500).json({ error: "Failed to serve file" });
  }
});

/* ------------------------------------------------------------- public passport */

async function publishedPassport(publicId: string) {
  const [row] = await db.select().from(propertyPassportsTable)
    .where(and(eq(propertyPassportsTable.publicId, publicId), eq(propertyPassportsTable.status, "published")));
  return row ?? null;
}

async function recordEvent(p: PassportRow, kind: string) {
  await db.insert(realtorEventsTable).values({ ownerUserId: p.ownerUserId, passportId: p.id, listingId: p.listingId, kind });
}

router.get("/public/passports/:publicId", readLimit, async (req, res): Promise<void> => {
  const params = GetPublicPassportParams.safeParse(req.params);
  if (!params.success) return gone(res);
  const row = await publishedPassport(params.data.publicId);
  if (!row) return gone(res);
  const [dto] = await passportDtos([row], publicOrigin(req));
  if (!/bot|crawl|spider|preview/i.test(req.get("user-agent") ?? "")) await recordEvent(row, "passport_view");
  res.setHeader("Cache-Control", "no-store");
  res.json(publicPassportDto(dto));
});

router.post("/public/passports/:publicId/events", eventLimit, async (req, res): Promise<void> => {
  const params = RecordPublicPassportEventParams.safeParse(req.params);
  const body = RecordPublicPassportEventBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid event" }); return; }
  const row = await publishedPassport(params.data.publicId);
  if (!row) return gone(res);
  await recordEvent(row, body.data.kind);
  res.json({ success: true, message: "Recorded" });
});

router.post("/public/passports/:publicId/leads", leadLimit, async (req, res): Promise<void> => {
  const params = CreatePublicPassportLeadParams.safeParse(req.params);
  const body = CreatePublicPassportLeadBody.safeParse(req.body);
  if (!params.success) return gone(res);
  if (!body.success) { res.status(400).json({ error: "Adınızı və telefon nömrənizi yazın" }); return; }
  const row = await publishedPassport(params.data.publicId);
  if (!row) return gone(res);
  const phone = body.data.phone.trim();
  // A repeated request from the same number updates the open lead instead of duplicating it.
  const [existing] = await db.select().from(realtorLeadsTable).where(and(
    eq(realtorLeadsTable.ownerUserId, row.ownerUserId), eq(realtorLeadsTable.phone, phone),
    notInArray(realtorLeadsTable.status, ["deal", "lost"]), gt(realtorLeadsTable.createdAt, new Date(Date.now() - 30 * 86_400_000)),
  ));
  const note = `Pasport səhifəsindən sorğu (${row.title})${body.data.message ? `: ${body.data.message.trim()}` : ""}`;
  let leadId: string;
  if (existing) {
    await db.update(realtorLeadsTable).set({ notes: `${existing.notes}\n${note}`.trim().slice(0, 4000), listingId: existing.listingId ?? row.listingId, nextAction: "Pasport sorğusuna cavab verin", nextActionAt: new Date(), reminderSentAt: null, updatedAt: new Date() })
      .where(eq(realtorLeadsTable.id, existing.id));
    leadId = existing.id;
  } else {
    const [lead] = await db.insert(realtorLeadsTable).values({
      ownerUserId: row.ownerUserId, listingId: row.listingId, fullName: body.data.name.trim(), phone, source: "site", status: "new",
      dealType: row.dealType, district: row.district, rooms: row.rooms, notes: note.slice(0, 4000),
      nextAction: "Pasport sorğusuna cavab verin", nextActionAt: new Date(Date.now() + 15 * 60_000),
    }).returning();
    leadId = lead.id;
  }
  await recordEvent(row, "lead_form");
  await notify(row.ownerUserId, { kind: "new_lead", title: `Yeni lead: ${body.data.name.trim()}`, body: `${row.title} pasportundan · ${phone}`, href: `/realtor/leads?lead=${leadId}` });
  res.json({ success: true, message: "Request sent" });
});

/* ------------------------------------------------------- contractor confirmation */

async function contractorView(req: Request, token: string) {
  const [work] = await db.select().from(passportWorksTable).where(eq(passportWorksTable.contractorTokenHash, hashToken(token)));
  if (!work) return null;
  const [passport] = await db.select().from(propertyPassportsTable).where(eq(propertyPassportsTable.id, work.passportId));
  if (!passport || passport.status === "archived") return null;
  const [dto] = await passportDtos([passport], publicOrigin(req));
  const w = dto.works.find((x) => x.id === work.id)!;
  return {
    passportTitle: dto.title, district: dto.district, realtorName: dto.realtor.name, agency: dto.realtor.agency,
    work: publicWorkDto(w), confirmed: !!w.contractorConfirmedAt, confirmedName: w.contractorConfirmedName,
    _passport: passport, _work: work,
  };
}
const strip = <T extends { _passport: unknown; _work: unknown }>(v: T) => { const { _passport: _p, _work: _w, ...rest } = v; return rest; };

router.get("/public/passport-confirm/contractor/:token", readLimit, async (req, res): Promise<void> => {
  const params = GetContractorConfirmationParams.safeParse(req.params);
  if (!params.success) return gone(res);
  const view = await contractorView(req, params.data.token);
  if (!view) return gone(res);
  res.setHeader("Cache-Control", "no-store");
  res.json(strip(view));
});

router.post("/public/passport-confirm/contractor/:token", writeLimit, async (req, res): Promise<void> => {
  const params = ConfirmContractorWorkParams.safeParse(req.params);
  const body = ConfirmContractorWorkBody.safeParse(req.body);
  if (!params.success) return gone(res);
  if (!body.success) { res.status(400).json({ error: "Adınızı yazın və təsdiqləyin" }); return; }
  const view = await contractorView(req, params.data.token);
  if (!view) return gone(res);
  if (!view.confirmed) {
    await db.update(passportWorksTable).set({ contractorConfirmedAt: new Date(), contractorConfirmedName: body.data.name.trim(), contractorNote: body.data.note?.trim() || null, updatedAt: new Date() })
      .where(eq(passportWorksTable.id, view._work.id));
    await notify(view._passport.ownerUserId, { kind: "contractor_confirmed", title: `Podratçı təsdiqlədi: ${view._work.title}`, body: `${body.data.name.trim()} · ${view._passport.title}`, href: `/realtor/passports/${view._passport.id}` });
  }
  const fresh = await contractorView(req, params.data.token);
  res.json(strip(fresh!));
});

/* ------------------------------------------------------------ owner acceptance */

async function ownerView(req: Request, token: string) {
  const [passport] = await db.select().from(propertyPassportsTable).where(eq(propertyPassportsTable.ownerTokenHash, hashToken(token)));
  if (!passport || passport.status === "archived") return null;
  const [dto] = await passportDtos([passport], publicOrigin(req));
  return { ownerName: passport.ownerName, passport: publicPassportDto(dto), published: passport.status === "published", _row: passport };
}

router.get("/public/passport-confirm/owner/:token", readLimit, async (req, res): Promise<void> => {
  const params = GetOwnerConfirmationParams.safeParse(req.params);
  if (!params.success) return gone(res);
  const view = await ownerView(req, params.data.token);
  if (!view) return gone(res);
  const { _row, ...rest } = view;
  res.setHeader("Cache-Control", "no-store");
  res.json(rest);
});

router.post("/public/passport-confirm/owner/:token/works/:workId", writeLimit, async (req, res): Promise<void> => {
  const params = DecideOwnerWorkParams.safeParse(req.params);
  const body = DecideOwnerWorkBody.safeParse(req.body);
  if (!params.success) return gone(res);
  if (!body.success) { res.status(400).json({ error: "Adınızı yazın və qərar seçin" }); return; }
  const view = await ownerView(req, params.data.token);
  if (!view) return gone(res);
  const [work] = await db.select().from(passportWorksTable).where(and(eq(passportWorksTable.id, params.data.workId), eq(passportWorksTable.passportId, view._row.id)));
  if (!work) return gone(res);
  if (body.data.decision === "accepted" && work.afterPhotoIds.length === 0) {
    res.status(409).json({ error: "Bu işin hələ “sonra” fotosu yoxdur. Qəbuldan əvvəl realtordan foto istəyin." });
    return;
  }
  if (body.data.decision === "revision" && !body.data.note?.trim()) { res.status(400).json({ error: "Nəyin düzəldilməli olduğunu yazın" }); return; }
  await db.update(passportWorksTable).set({ handoverStatus: body.data.decision, ownerDecidedAt: new Date(), ownerDecidedName: body.data.name.trim(), ownerNote: body.data.note?.trim() || null, updatedAt: new Date() })
    .where(eq(passportWorksTable.id, work.id));
  const after = await db.select().from(passportWorksTable).where(eq(passportWorksTable.passportId, view._row.id));
  const level = trustLevel(after);
  await notify(view._row.ownerUserId, {
    kind: body.data.decision === "accepted" ? "owner_accepted" : "owner_revision",
    title: body.data.decision === "accepted" ? `Ev sahibi qəbul etdi: ${work.title}` : `Ev sahibi düzəliş istədi: ${work.title}`,
    body: level === "handover" ? "Pasport ən yüksək etibar səviyyəsinə çatdı — Təhvil təsdiqli." : (body.data.note?.trim() ?? view._row.title),
    href: `/realtor/passports/${view._row.id}`,
  });
  const fresh = await ownerView(req, params.data.token);
  const { _row, ...rest } = fresh!;
  res.json(rest);
});

export default router;
