import { createRequire } from "node:module";
import path from "node:path";
import PDFDocument from "pdfkit";

/** What a version freezes; the PDF is drawn only from this, so it can be regenerated identically. */
export interface ProtocolSnapshot {
  number: string; address: string; propertyType: string; handoverDate: string | null;
  parties: { role: string; name: string; phone: string }[];
  rooms: { id: string; name: string; kind: string; condition: string | null; note: string; photos: string[]; defects: { id: string; text: string; photos: string[] }[] }[];
  meters: { kind: string; value: string; note: string; photos: string[] }[];
  keys: { kind: string; count: number }[];
  keyPhotos: string[];
  notes: string;
  otherPhotos: string[];
  revision: number;
}
export interface PdfApproval { role: string; decision: string; at: Date; authLevel: string; authDetail: string; comment: string }
export interface PdfInput {
  snapshot: ProtocolSnapshot; version: number; contentHash: string; createdAt: Date;
  approvals: PdfApproval[]; final: boolean; photo: (id: string) => Promise<Buffer | null>; captions: Map<string, string>;
}

const require = createRequire(import.meta.url);
const fontDir = () => path.join(path.dirname(require.resolve("dejavu-fonts-ttf/package.json")), "ttf");

export const ROLE_LABEL: Record<string, string> = { realtor: "Rieltor", seller: "Satıcı (ev sahibi)", buyer: "Alıcı" };
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
  doc.font("b").fontSize(16).fillColor(ink).text("Təhvil-təslim protokolu", 50);
  doc.moveDown(0.5);
  kv("Əmlakın ünvanı", s.address);
  kv("Növü", PROPERTY_LABEL[s.propertyType] ?? s.propertyType);
  kv("Təhvil tarixi", day(s.handoverDate));

  h2("Tərəflər");
  for (const p of s.parties) {
    const a = input.approvals.find((x) => x.role === p.role);
    const status = a ? (a.decision === "approved" ? `Təsdiqləyib · ${bakuTime(a.at)}` : `Düzəliş istəyib · ${bakuTime(a.at)}`) : p.role === "realtor" ? "Təsdiq tələb olunmur" : "Təsdiq gözlənilir";
    kv(ROLE_LABEL[p.role] ?? p.role, `${p.name || "—"}${p.phone ? ` · ${p.phone}` : ""}\n${status}`);
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
        const cap = input.captions.get(id);
        if (cap) doc.font("r").fontSize(8).fillColor(muted).text(cap, x, y + h + 3, { width: size, height: 20, ellipsis: true });
      });
      doc.y = y + h + 22;
      doc.x = 50;
    }
  };

  h2("Otaqlar");
  if (!s.rooms.length) doc.font("r").fontSize(10).fillColor(muted).text("Otaq əlavə edilməyib.", 50);
  for (const r of s.rooms) {
    ensure(46);
    doc.font("b").fontSize(11.5).fillColor(ink).text(r.name, 50);
    doc.font("r").fontSize(9.5).fillColor(r.condition === "defective" ? "#9a3b1f" : muted).text(`Vəziyyət: ${r.condition ? CONDITION_LABEL[r.condition] ?? r.condition : "qeyd edilməyib"}`);
    if (r.note) doc.font("r").fontSize(10).fillColor(ink).text(r.note, 50, doc.y, { width: W });
    if (r.defects.length) {
      doc.moveDown(0.2).font("b").fontSize(10).fillColor("#9a3b1f").text("Qüsurlar:");
      for (const d of r.defects) { ensure(16); doc.font("r").fontSize(10).fillColor(ink).text(`• ${d.text}`, 60, doc.y, { width: W - 10 }); if (d.photos.length) { doc.x = 50; await photoGrid(d.photos); } }
      doc.x = 50;
    }
    if (r.photos.length) { doc.moveDown(0.3); await photoGrid(r.photos); }
    doc.moveDown(0.5);
  }

  h2("Sayğac göstəriciləri");
  const meters = s.meters.filter((m) => m.value || m.note || m.photos.length);
  if (!meters.length) doc.font("r").fontSize(10).fillColor(muted).text("Daxil edilməyib.");
  for (const m of meters) { kv(METER_LABEL[m.kind] ?? m.kind, [m.value, m.note].filter(Boolean).join(" · ")); if (m.photos.length) await photoGrid(m.photos); }

  h2("Açarlar və giriş vasitələri");
  const keys = s.keys.filter((k) => k.kind.trim() && k.count > 0);
  if (!keys.length) doc.font("r").fontSize(10).fillColor(muted).text("Daxil edilməyib.");
  for (const k of keys) kv(k.kind, `${k.count} ədəd`);
  if (s.keyPhotos.length) await photoGrid(s.keyPhotos);

  if (s.notes || s.otherPhotos.length) { h2("Digər qeydlər"); if (s.notes) doc.font("r").fontSize(10).fillColor(ink).text(s.notes, 50, doc.y, { width: W }); if (s.otherPhotos.length) await photoGrid(s.otherPhotos); }

  h2("Təsdiqlər");
  const decided = input.approvals;
  if (!decided.length) doc.font("r").fontSize(10).fillColor(muted).text("Bu versiya üzrə hələ qərar verilməyib.");
  for (const a of decided) kv(ROLE_LABEL[a.role] ?? a.role, `${a.decision === "approved" ? "Təsdiq edirəm" : "Düzəliş istəyirəm"} · ${bakuTime(a.at)}\nKimlik: ${AUTH_LABEL[a.authLevel] ?? a.authLevel}${a.authDetail ? ` (${a.authDetail})` : ""}${a.comment ? `\nQeyd: ${a.comment}` : ""}`);
  doc.moveDown(0.6);
  ensure(48);
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
