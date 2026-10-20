import { createRequire } from "node:module";
import path from "node:path";
import PDFDocument from "pdfkit";

/** What a version freezes; the PDF is drawn only from this, so it can be regenerated identically. */
export interface SnapItem { id: string; name: string; category: string; quantity: number; condition: string | null; note: string; change: string | null; prevItemId: string | null; photos: string[] }
export interface SnapRoom { id: string; name: string; kind: string; condition: string | null; note: string; prevRoomId?: string | null; photos: string[]; items?: SnapItem[]; defects: { id: string; text: string; photos: string[] }[] }
export interface ProtocolSnapshot {
  kind?: string; number: string; address: string; propertyType: string; handoverDate: string | null; handoverTime?: string;
  rental?: { number: string; startDate: string | null; endDate: string | null; monthlyRent: number | null; deposit: number | null; currency: string } | null;
  base?: { protocolId: string; version: number | null } | null;
  parties: { role: string; name: string; phone: string; agency?: string }[];
  rooms: SnapRoom[];
  meters: { kind: string; value: string; note: string; na?: boolean; photos: string[] }[];
  keys: { kind: string; count: number }[];
  keyPhotos: string[];
  notes: string;
  otherPhotos: string[];
  revision: number;
  baseline?: ProtocolSnapshot | null;
}
export interface PdfApproval { role: string; decision: string; at: Date; authLevel: string; authDetail: string; comment: string }
export interface PdfInput {
  snapshot: ProtocolSnapshot; version: number; contentHash: string; createdAt: Date; protocolCreatedAt?: Date;
  approvals: PdfApproval[]; final: boolean; photo: (id: string) => Promise<Buffer | null>; captions: Map<string, string>; times?: Map<string, { uploaded: Date; taken: Date | null }>;
}

const require = createRequire(import.meta.url);
const fontDir = () => path.join(path.dirname(require.resolve("dejavu-fonts-ttf/package.json")), "ttf");

export const ROLE_LABEL: Record<string, string> = { realtor: "Rieltor", seller: "Satıcı", buyer: "Alıcı", landlord: "Ev sahibi", tenant: "Kirayəçi" };
export const CHANGE_LABEL: Record<string, string> = { unchanged: "Dəyişməyib", new_damage: "Yeni zədə / ləkə", changed: "Əvvəlki zədə dəyişib", resolved: "Təmizlənib / aradan qaldırılıb", missing: "Çatışmır" };
const TITLE: Record<string, string> = { sale: "Təhvil-təslim protokolu", move_in: "Kirayə giriş protokolu", move_out: "Kirayə çıxış protokolu və müqayisə" };
const DECIDERS: Record<string, string[]> = { sale: ["seller", "buyer"], move_in: ["landlord", "tenant"], move_out: ["landlord", "tenant"] };
const num = (v: string) => { const n = Number(v.replace(/\s/g, "").replace(",", ".")); return v.trim() && Number.isFinite(n) ? n : null; };
const fmt = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const money = (n: number | null | undefined, c = "AZN") => (n == null ? "—" : `${n.toLocaleString("az-AZ")} ${c}`);
export const CONDITION_LABEL: Record<string, string> = { good: "Yaxşı", fair: "Qənaətbəxş", defective: "Qüsurlu" };
export const PROPERTY_LABEL: Record<string, string> = { apartment: "Mənzil", house: "Fərdi ev", other: "Digər" };
export const METER_LABEL: Record<string, string> = { water: "Su sayğacı", gas: "Qaz sayğacı", electric: "Elektrik sayğacı" };
const AUTH_LABEL: Record<string, string> = { phone: "telefon nömrəsi təsdiqlənmiş hesab", email: "e-poçtu təsdiqlənmiş hesab", account: "Tehvil.az hesabı" };

/** Baku is UTC+4 all year. */
export const bakuTime = (d: Date) => {
  const b = new Date(d.getTime() + 4 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(b.getUTCDate())}.${p(b.getUTCMonth() + 1)}.${b.getUTCFullYear()} ${p(b.getUTCHours())}:${p(b.getUTCMinutes())} (Bakı)`;
};
const day = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "—");

export async function renderProtocolPdf(input: PdfInput): Promise<Buffer> {
  const { snapshot: s } = input;
  const kind = s.kind ?? "sale";
  const base = s.baseline ?? null;
  const prevRoom = new Map((base?.rooms ?? []).map((r) => [r.id, r]));
  const prevItem = new Map((base?.rooms ?? []).flatMap((r) => (r.items ?? []).map((i) => [i.id, i] as const)));
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 64, left: 50, right: 50 }, bufferPages: true, info: { Title: `Təhvil-təslim protokolu ${s.number}`, Author: "Tehvil.az", Subject: s.address } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  doc.registerFont("r", path.join(fontDir(), "DejaVuSans.ttf"));
  doc.registerFont("b", path.join(fontDir(), "DejaVuSans-Bold.ttf"));
  const W = doc.page.width - 100;
  const ink = "#1f3a33", muted = "#5f6f68", line = "#d9d3c7";
  const ensure = (h: number) => { if (doc.y + h > doc.page.height - 70) doc.addPage(); };
  const h2 = (t: string) => { ensure(40); doc.moveDown(0.6).font("b").fontSize(13).fillColor(ink).text(t, 50, doc.y, { width: W }); doc.moveTo(50, doc.y + 2).lineTo(50 + W, doc.y + 2).strokeColor(line).lineWidth(0.7).stroke(); doc.moveDown(0.4); };
  const kv = (k: string, v: string) => { ensure(18); const y = doc.y; doc.font("r").fontSize(9.5).fillColor(muted).text(k, 50, y, { width: 150 }); doc.font("r").fontSize(10).fillColor(ink).text(v || "—", 205, y, { width: W - 155 }); doc.moveDown(0.25); doc.x = 50; };

  // Header
  doc.font("b").fontSize(18).fillColor(ink).text("Tehvil.az", 50, 50);
  doc.font("r").fontSize(9).fillColor(muted).text("Rəqəmsal təhvil-təslim protokolu", 50, 72);
  doc.font("b").fontSize(11).fillColor(ink).text(`№ ${s.number}`, 50, 50, { width: W, align: "right" });
  doc.font("r").fontSize(9).fillColor(muted).text(`Versiya ${input.version} · ${bakuTime(input.createdAt)}`, 50, 66, { width: W, align: "right" });
  doc.moveDown(2.2);
  if (!input.final) {
    doc.roundedRect(50, doc.y, W, 26, 4).fillColor("#fbe9e3").fill();
    doc.font("b").fontSize(10).fillColor("#9a3b1f").text("TƏSDİQLƏNMƏYİB — bu nüsxə hər iki tərəf təsdiq etməzdən əvvəl hazırlanıb", 58, doc.y + 8, { width: W - 16 });
    doc.moveDown(1.2);
  }
  doc.font("b").fontSize(16).fillColor(ink).text(TITLE[kind] ?? TITLE.sale, 50);
  doc.moveDown(0.5);
  kv("Əmlakın ünvanı", s.address);
  kv("Növü", PROPERTY_LABEL[s.propertyType] ?? s.propertyType);
  if (s.rental) {
    kv("Kirayə qeydi", `№ ${s.rental.number}`);
    if (s.rental.startDate || s.rental.endDate) kv("Kirayə dövrü", s.rental.endDate ? `${day(s.rental.startDate)} — ${day(s.rental.endDate)}` : `${day(s.rental.startDate)} tarixindən`);
    kv("Aylıq kirayə / depozit", `${money(s.rental.monthlyRent, s.rental.currency)} / ${money(s.rental.deposit, s.rental.currency)}`);
  }
  kv(kind === "move_out" ? "Çıxış tarixi" : kind === "move_in" ? "Giriş tarixi" : "Təhvil tarixi", `${day(s.handoverDate)}${s.handoverTime ? `, saat ${s.handoverTime}` : ""}`);
  if (input.protocolCreatedAt) kv("Protokol", `yaradılıb ${bakuTime(input.protocolCreatedAt)} · bu versiya ${bakuTime(input.createdAt)}`);
  if (kind === "move_out") kv("Müqayisə əsası", base ? `Giriş protokolu № ${base.number}${s.base?.version ? `, versiya ${s.base.version}` : " (təsdiqə göndərilməmiş məzmun)"}` : "—");

  h2("Tərəflər");
  for (const p of s.parties) {
    const a = input.approvals.find((x) => x.role === p.role);
    const needed = (DECIDERS[kind] ?? DECIDERS.sale).includes(p.role);
    const status = a ? (a.decision === "approved" ? `Təsdiqləyib · ${bakuTime(a.at)}` : `Düzəliş istəyib · ${bakuTime(a.at)}`) : !needed ? "Təsdiq tələb olunmur" : "TƏSDİQLƏMƏYİB";
    kv(ROLE_LABEL[p.role] ?? p.role, `${p.name || "—"}${p.agency ? ` · ${p.agency}` : ""}${p.phone ? ` · ${p.phone}` : ""}\n${status}`);
  }

  const photoGrid = async (ids: string[]) => {
    const size = (W - 12) / 2;
    for (let i = 0; i < ids.length; i += 2) {
      const row = ids.slice(i, i + 2);
      const bufs = await Promise.all(row.map((id) => input.photo(id)));
      const h = size * 0.75;
      ensure(h + 26);
      const y = doc.y;
      row.forEach((id, k) => {
        const x = 50 + k * (size + 12);
        const buf = bufs[k];
        if (buf) {
          try { doc.image(buf, x, y, { fit: [size, h], align: "center", valign: "center" }); }
          catch { doc.rect(x, y, size, h).strokeColor(line).stroke(); doc.font("r").fontSize(8).fillColor(muted).text("Bu formatdakı foto PDF-ə əlavə oluna bilmədi", x + 8, y + h / 2 - 5, { width: size - 16, align: "center" }); }
        } else { doc.rect(x, y, size, h).strokeColor(line).stroke(); doc.font("r").fontSize(8).fillColor(muted).text("Foto açılmadı", x + 8, y + h / 2 - 5, { width: size - 16, align: "center" }); }
        const t = input.times?.get(id);
        const cap = [input.captions.get(id), t ? `Yüklənib: ${bakuTime(t.uploaded)}${t.taken ? ` · çəkilib (cihaz): ${bakuTime(t.taken)}` : ""}` : ""].filter(Boolean).join(" · ");
        if (cap) doc.font("r").fontSize(7.5).fillColor(muted).text(cap, x, y + h + 3, { width: size, height: 20, ellipsis: true });
      });
      doc.y = y + h + 22;
      doc.x = 50;
    }
  };

  /** Move-in photo on the left, move-out photo on the right, row by row. */
  const compareGrid = async (before: string[], after: string[]) => {
    const size = (W - 12) / 2, h = size * 0.75;
    for (let i = 0; i < Math.max(before.length, after.length); i++) {
      ensure(h + 44);
      const y = doc.y;
      for (const [k, id, label] of [[0, before[i], "Giriş"], [1, after[i], "Çıxış"]] as const) {
        const x = 50 + k * (size + 12);
        doc.font("b").fontSize(8.5).fillColor(muted).text(label, x, y, { width: size });
        if (!id) { doc.rect(x, y + 12, size, h).strokeColor(line).dash(3, { space: 3 }).stroke().undash(); doc.font("r").fontSize(8).fillColor(muted).text(k === 0 ? "Girişdə foto yoxdur" : "Çıxışda foto yoxdur", x + 8, y + 12 + h / 2 - 5, { width: size - 16, align: "center" }); continue; }
        const buf = await input.photo(id);
        if (buf) { try { doc.image(buf, x, y + 12, { fit: [size, h], align: "center", valign: "center" }); } catch { doc.rect(x, y + 12, size, h).strokeColor(line).stroke(); } }
        else doc.rect(x, y + 12, size, h).strokeColor(line).stroke();
        const t = input.times?.get(id);
        if (t) doc.font("r").fontSize(7).fillColor(muted).text(`Yüklənib: ${bakuTime(t.uploaded)}${t.taken ? ` · çəkilib (cihaz): ${bakuTime(t.taken)}` : ""}`, x, y + 14 + h, { width: size, height: 18, ellipsis: true });
      }
      doc.y = y + h + 34; doc.x = 50;
    }
  };

  h2("Otaqlar");
  if (!s.rooms.length) doc.font("r").fontSize(10).fillColor(muted).text("Otaq əlavə edilməyib.", 50);
  const cond = (c: string | null | undefined) => (c ? CONDITION_LABEL[c] ?? c : "qeyd edilməyib");
  for (const r of s.rooms) {
    ensure(46);
    doc.font("b").fontSize(11.5).fillColor(ink).text(r.name, 50);
    const items = r.items ?? [];
    if (items.length) {
      for (const it of items) {
        ensure(40);
        const before = it.prevItemId ? prevItem.get(it.prevItemId) : null;
        const qty = it.quantity !== 1 ? ` (${it.quantity} ədəd)` : "";
        doc.font("b").fontSize(10).fillColor(ink).text(`${it.name}${qty}`, 60, doc.y, { width: W - 10 });
        const blank = kind === "move_out" && !it.condition && !it.change && !it.note && !it.photos.length && (!before || (!before.condition && !before.note && !before.photos.length));
        if (blank) {
          doc.font("r").fontSize(9.5).fillColor(muted).text("Girişdə və çıxışda qeyd edilməyib", 60, doc.y, { width: W - 10 });
          doc.x = 50;
        } else if (kind === "move_out") {
          doc.font("r").fontSize(9.5).fillColor(muted).text(before ? `Girişdə: ${cond(before.condition)}${before.note ? ` — ${before.note}` : ""}${before.quantity !== it.quantity ? ` · say: ${before.quantity}` : ""}` : "Girişdə qeyd olunmayıb", 60, doc.y, { width: W - 10 });
          doc.font("r").fontSize(9.5).fillColor(it.condition === "defective" ? "#9a3b1f" : ink).text(`Çıxışda: ${cond(it.condition)}${it.note ? ` — ${it.note}` : ""}`, 60, doc.y, { width: W - 10 });
          doc.font("b").fontSize(9.5).fillColor(it.change && it.change !== "unchanged" ? "#7d5512" : muted).text(`Qeyd edilən dəyişiklik: ${it.change ? CHANGE_LABEL[it.change] ?? it.change : "qeyd edilməyib"}`, 60, doc.y, { width: W - 10 });
          doc.x = 50;
          await compareGrid(before?.photos ?? [], it.photos);
        } else {
          doc.font("r").fontSize(9.5).fillColor(it.condition === "defective" ? "#9a3b1f" : muted).text(`Vəziyyət: ${cond(it.condition)}${it.note ? ` — ${it.note}` : ""}`, 60, doc.y, { width: W - 10 });
          doc.x = 50;
          if (it.photos.length) await photoGrid(it.photos);
        }
        doc.moveDown(0.2);
      }
      const gone = kind === "move_out" && r.prevRoomId ? (prevRoom.get(r.prevRoomId)?.items ?? []).filter((pi) => !items.some((i) => i.prevItemId === pi.id)) : [];
      for (const pi of gone) doc.font("r").fontSize(9.5).fillColor("#7d5512").text(`${pi.name}: girişdə var idi, çıxış protokolunda göstərilməyib`, 60, doc.y, { width: W - 10 });
      doc.x = 50;
    } else doc.font("r").fontSize(9.5).fillColor(r.condition === "defective" ? "#9a3b1f" : muted).text(`Vəziyyət: ${cond(r.condition)}`);
    if (r.note) doc.font("r").fontSize(10).fillColor(ink).text(r.note, 50, doc.y, { width: W });
    if (r.defects.length) {
      doc.moveDown(0.2).font("b").fontSize(10).fillColor("#9a3b1f").text("Qüsurlar:");
      for (const d of r.defects) { ensure(16); doc.font("r").fontSize(10).fillColor(ink).text(`• ${d.text}`, 60, doc.y, { width: W - 10 }); if (d.photos.length) { doc.x = 50; await photoGrid(d.photos); } }
      doc.x = 50;
    }
    if (kind === "move_out") { const bp = r.prevRoomId ? prevRoom.get(r.prevRoomId)?.photos ?? [] : []; if (bp.length || r.photos.length) { doc.font("b").fontSize(9).fillColor(ink).text("Otağın ümumi fotoları", 50); await compareGrid(bp, r.photos); } }
    else if (r.photos.length) { doc.moveDown(0.3); await photoGrid(r.photos); }
    doc.moveDown(0.5);
  }

  h2("Sayğac göstəriciləri");
  const meters = s.meters.filter((m) => m.na || m.value || m.note || m.photos.length);
  if (!meters.length) doc.font("r").fontSize(10).fillColor(muted).text("Daxil edilməyib.");
  for (const m of meters) {
    if (m.na) { kv(METER_LABEL[m.kind] ?? m.kind, "Tətbiq edilmir (mənzildə yoxdur)"); continue; }
    if (kind === "move_out") {
      const pm = base?.meters.find((x) => x.kind === m.kind);
      const a = num(pm?.value ?? ""), b = num(m.value);
      kv(METER_LABEL[m.kind] ?? m.kind, `Giriş: ${pm?.value || "—"} · Çıxış: ${m.value || "—"}${a != null && b != null ? ` · Fərq: ${fmt(b - a)}` : ""}${m.note ? `\n${m.note}` : ""}`);
      if (pm?.photos.length || m.photos.length) await compareGrid(pm?.photos ?? [], m.photos);
    } else { kv(METER_LABEL[m.kind] ?? m.kind, [m.value, m.note].filter(Boolean).join(" · ")); if (m.photos.length) await photoGrid(m.photos); }
  }

  h2("Açarlar və giriş vasitələri");
  const keys = s.keys.filter((k) => k.kind.trim() && k.count > 0);
  if (!keys.length) doc.font("r").fontSize(10).fillColor(muted).text("Daxil edilməyib.");
  if (kind === "move_out") {
    const kinds = [...new Set([...(base?.keys ?? []).map((k) => k.kind.trim()), ...s.keys.map((k) => k.kind.trim())])].filter(Boolean);
    for (const kd of kinds) { const a = base?.keys.find((k) => k.kind.trim() === kd)?.count ?? 0, b = s.keys.find((k) => k.kind.trim() === kd)?.count ?? 0; kv(kd, `Verilib: ${a} · Qaytarılıb: ${b}${a !== b ? " · fərq var" : ""}`); }
  } else for (const k of keys) kv(k.kind, `${k.count} ədəd`);
  if (s.keyPhotos.length) await photoGrid(s.keyPhotos);

  if (s.notes || s.otherPhotos.length) { h2("Digər qeydlər"); if (s.notes) doc.font("r").fontSize(10).fillColor(ink).text(s.notes, 50, doc.y, { width: W }); if (s.otherPhotos.length) await photoGrid(s.otherPhotos); }

  h2("Təsdiqlər");
  const decided = input.approvals;
  if (!decided.length) doc.font("r").fontSize(10).fillColor(muted).text("Bu versiya üzrə hələ qərar verilməyib.");
  for (const r of (DECIDERS[kind] ?? DECIDERS.sale).filter((x) => !decided.some((a) => a.role === x))) kv(ROLE_LABEL[r] ?? r, "Bu versiyanı təsdiqləməyib");
  for (const a of decided) kv(ROLE_LABEL[a.role] ?? a.role, `${a.decision === "approved" ? "Təsdiq edirəm" : "Düzəliş istəyirəm"} · ${bakuTime(a.at)}\nKimlik: ${AUTH_LABEL[a.authLevel] ?? a.authLevel}${a.authDetail ? ` (${a.authDetail})` : ""}${a.comment ? `\nQeyd: ${a.comment}` : ""}`);
  doc.moveDown(0.6);
  ensure(48);
  if (kind !== "sale") doc.font("r").fontSize(8.5).fillColor(muted).text("Bu hesabat tərəflərin qeydə aldığı faktları və müqayisəni neytral şəkildə göstərir. Zərərin kim tərəfindən yaradıldığını, təqsiri və ya depozitin taleyini müəyyən etmir; avtomatik hüquqi qərar deyil. Foto altındakı “çəkilib” vaxtı cihazın verdiyi məlumatdır, “yüklənib” vaxtını server qeyd edir.", 50, doc.y, { width: W }).moveDown(0.4);
  doc.font("r").fontSize(8.5).fillColor(muted).text(`Bu protokol tərəflərin təhvil zamanı faktiki vəziyyəti necə qeydə aldığını və Tehvil.az hesabları ilə verdikləri təsdiqləri əks etdirir. Hesab üzərindən verilən təsdiq hüquqi elektron imza deyil. Məzmun izi (SHA-256) bu versiyanın dəyişmədiyini yoxlamağa imkan verir: ${input.contentHash}`, 50, doc.y, { width: W });

  // Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("r").fontSize(7.5).fillColor(muted).text(`Tehvil.az · № ${s.number} · versiya ${input.version} · iz ${input.contentHash.slice(0, 16)}… · səhifə ${i - range.start + 1}/${range.count}`, 50, doc.page.height - 40, { width: W, align: "center", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}
