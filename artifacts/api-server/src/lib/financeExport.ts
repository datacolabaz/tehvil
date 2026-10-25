import ExcelJS from "exceljs";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db, homeMediaTable, homeRoomsTable, infrastructureItemsTable, workRecordsTable } from "@workspace/db";
import { computeLedger, EXPENSE_CATEGORIES, FORMULAS, fromCents, type ProjectAccess, type ProjectData } from "./financeCore";

/*
 * Excel report of one project, built from the same ledger the site shows (computeLedger), so every
 * figure matches the page. List sheets end with SUMIFS rows over approved records, so totals stay
 * live if someone filters or edits a copy in Excel.
 */

const MONEY = '#,##0.00 "AZN"';
const STATUS: Record<string, string> = { approved: "Təsdiqlənib", pending: "Təsdiq gözləyir", disputed: "Mübahisəlidir", void: "Ləğv edilib" };
const PAY_STATUS: Record<string, string> = { recorded: "Qeyd edilib", confirmed: "Alan təsdiqləyib", disputed: "Mübahisəlidir", cancelled: "Ləğv edilib" };
const PAY_KIND: Record<string, string> = { payment: "Ödəniş", advance: "Avans", refund: "Geri qaytarma" };
const ROLE: Record<string, string> = { contractor: "Podratçı", worker: "Usta", supplier: "Təchizatçı", other: "Digər" };
const PARTY_STATUS: Record<string, string> = { none: "—", unpaid: "Ödənilməyib", partial: "Qismən ödənilib", paid: "Tam ödənilib", overpaid: "Artıq ödənilib", disputed: "Mübahisəlidir" };
const EXP_PAY: Record<string, string> = { unpaid: "Ödənilməyib", partial: "Qismən", paid: "Ödənilib", advance: "Avansdan", "n/a": "—" };
const CO_STATUS: Record<string, string> = { proposed: "Təsdiq gözləyir", approved: "Təsdiqlənib", rejected: "Rədd edilib", clarification: "İzah istənilib" };
const INV_STATUS: Record<string, string> = { uploaded: "Yüklənib", reading: "Oxunur", read: "AI oxuyub, təsdiq gözləyir", failed: "Oxunmadı", confirmed: "Təsdiqlənib", discarded: "Ləğv edilib" };
const LINE: Record<string, string> = { electric: "Elektrik", water: "Su", sewer: "Kanalizasiya", heating: "İstilik", gas: "Qaz", ventilation: "Ventilyasiya", internet: "İnternet / zəif cərəyan", other: "Digər" };
const SOURCE: Record<string, string> = { owner: "İstifadəçi işarələyib", worker: "Usta işarələyib", plan: "Plan / sənəd əsasında", specialist: "Mütəxəssis", ai: "AI təklif edib" };
const n = (cents: number | null) => (cents == null ? null : Number(fromCents(cents)));
const m = (s: string | null | undefined) => (s == null ? null : Number(s));

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number; money?: boolean }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.money ? { numFmt: MONEY } : {} }));
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3D33" } };
  h.alignment = { vertical: "middle", wrapText: true };
  h.height = 28;
  return ws;
}
function finish(ws: ExcelJS.Worksheet) {
  ws.eachRow((row, i) => { if (i > 1) row.font = { name: "Arial", size: 10, ...(row.font ?? {}) }; });
  if (ws.rowCount > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}
/** "Cəmi (təsdiqlənmiş)" row: SUMIFS over the status column. */
function totalRow(ws: ExcelJS.Worksheet, label: string, labelCol: string, sumCols: string[], statusCol: string, status: string) {
  const last = ws.rowCount;
  const r = ws.addRow({});
  r.getCell(labelCol).value = label;
  for (const c of sumCols) r.getCell(c).value = last >= 2 ? { formula: `SUMIFS(${c}2:${c}${last},${statusCol}2:${statusCol}${last},"${status}")` } : 0;
  r.font = { bold: true, name: "Arial", size: 10 };
  r.border = { top: { style: "thin" } };
}

export async function buildFinanceWorkbook(a: ProjectAccess, d: ProjectData): Promise<Buffer> {
  const ledger = computeLedger(d);
  const t = ledger.totals;
  const party = new Map(d.parties.map((p) => [p.id, p.name]));
  const rooms = await db.select().from(homeRoomsTable).where(eq(homeRoomsTable.homeId, a.home.id));
  const room = new Map(rooms.map((r) => [r.id, r.name]));
  const cat = (c: string) => EXPENSE_CATEGORIES[c as keyof typeof EXPENSE_CATEGORIES]?.label ?? c;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Tehvil.az";
  wb.created = new Date();

  /* 1. Summary */
  const s = sheet(wb, "Layihə yekunu", [{ header: "Göstərici", key: "k", width: 42 }, { header: "Məbləğ", key: "v", width: 20, money: true }, { header: "Necə hesablanır", key: "f", width: 90 }]);
  s.addRow({ k: "Ev", v: null, f: a.home.name });
  s.addRow({ k: "Layihə", v: null, f: `${a.project.name}${a.project.startDate ? ` · ${a.project.startDate}` : ""}${a.project.endDate ? ` – ${a.project.endDate}` : ""}` });
  s.addRow({ k: "Hesabat tarixi", v: null, f: new Date().toISOString().slice(0, 16).replace("T", " ") + " (UTC)" });
  s.addRow({});
  const rows: [string, number | null, string][] = [
    ["İlkin büdcə", n(t.budgetInitial), FORMULAS.budgetInitial],
    ["Son razılaşdırılmış büdcə", n(t.budgetCurrent), FORMULAS.budgetCurrent],
    ["Faktiki xərclər", n(t.actual), FORMULAS.actual],
    ["  Material xərcləri", n(t.material), FORMULAS.material],
    ["  İşçilik xərcləri", n(t.labor), FORMULAS.labor],
    ["  Digər xərclər", n(t.other), FORMULAS.other],
    ["Büdcə − faktiki xərc", n(t.budgetDiff), FORMULAS.budgetDiff],
    ["Podratçılara ödənilib", n(t.paidToContractors), FORMULAS.paidToContractors],
    ["Podratçılara qalan ödəniş", n(t.remainingToContractors), FORMULAS.remainingToContractors],
    ["Ustalara ödənilib", n(t.paidToWorkers), "Ustalara və digər tərəflərə hesablanan ödəniş."],
    ["Ustalara qalan ödəniş", n(t.remainingToWorkers), "Razılaşma / qaimələr − ödənilən."],
    ["Təchizatçılara ödənilib", n(t.paidToSuppliers), FORMULAS.paidToSuppliers],
    ["Təchizatçılara qalan borc", n(t.supplierDebt), FORMULAS.supplierDebt],
    ["Avans qalığı", n(t.advanceBalance), FORMULAS.advanceBalance],
    ["Təsdiqlənmiş əlavə işlər", n(t.approvedChangeOrders), "Ev sahibinin təsdiqlədiyi əlavə iş təklifləri."],
    ["Qərar gözləyən əlavə işlər", n(t.proposedChangeOrders), "Büdcəyə daxil deyil."],
    ["Təsdiqlənməmiş xərclər", n(t.pending), FORMULAS.pending],
    ["Mübahisəli xərclər", n(t.disputed), FORMULAS.disputed],
  ];
  for (const [k, v, f] of rows) s.addRow({ k, v, f });
  s.addRow({});
  s.addRow({ k: "Qeyd", f: "Ödənişlər istifadəçilər tərəfindən qeyd edilib; bank tərəfindən təsdiqlənməyib. Avans xərc deyil: avansdan alınan material xərc kimi bir dəfə sayılır." });
  s.getColumn("f").alignment = { wrapText: true, vertical: "top" };
  finish(s);

  /* 2. Daily expenses */
  const e = sheet(wb, "Gündəlik xərclər", [
    { header: "Tarix", key: "date", width: 12 }, { header: "Kateqoriya", key: "cat", width: 26 }, { header: "Təsvir", key: "desc", width: 36 },
    { header: "Təchizatçı / usta", key: "vendor", width: 24 }, { header: "Otaq", key: "room", width: 14 },
    { header: "Ara cəm", key: "sub", width: 14, money: true }, { header: "Endirim", key: "disc", width: 12, money: true }, { header: "Vergi", key: "tax", width: 12, money: true },
    { header: "Yekun", key: "total", width: 14, money: true }, { header: "Ödəniş üsulu", key: "method", width: 12 }, { header: "Avansdan (kimin)", key: "adv", width: 18 },
    { header: "Ödəniş vəziyyəti", key: "pay", width: 14 }, { header: "Status", key: "status", width: 16 }, { header: "Layihə", key: "project", width: 20 }, { header: "Qeyd ID", key: "id", width: 38 },
  ]);
  for (const x of d.expenses) {
    e.addRow({ date: x.date, cat: cat(x.category), desc: x.description, vendor: x.vendorName || (x.partyId ? party.get(x.partyId) : "") || "", room: x.roomId ? room.get(x.roomId) ?? "" : "",
      sub: m(x.subtotal), disc: m(x.discount), tax: m(x.tax), total: m(x.total), method: x.paymentMethod, adv: x.fundedByPartyId ? party.get(x.fundedByPartyId) ?? "" : "",
      pay: EXP_PAY[ledger.payState.get(x.id)?.status ?? "n/a"], status: STATUS[x.status] ?? x.status, project: a.project.name, id: x.id });
  }
  totalRow(e, "Cəmi (təsdiqlənmiş)", "desc", ["F", "G", "H", "I"], "M", STATUS.approved);
  finish(e);

  /* 3. Materials */
  const mt = sheet(wb, "Materiallar", [
    { header: "Tarix", key: "date", width: 12 }, { header: "Material / xidmət", key: "name", width: 34 }, { header: "Miqdar", key: "q", width: 10 }, { header: "Vahid", key: "u", width: 8 },
    { header: "Vahid qiyməti", key: "p", width: 14, money: true }, { header: "Cəmi", key: "t", width: 14, money: true }, { header: "Təchizatçı", key: "v", width: 24 },
    { header: "Kateqoriya", key: "c", width: 22 }, { header: "Status", key: "s", width: 16 }, { header: "Xərc ID", key: "id", width: 38 },
  ]);
  const byId = new Map(d.expenses.map((x) => [x.id, x]));
  for (const i of d.items) {
    const x = byId.get(i.expenseId);
    if (!x || x.status === "void") continue;
    mt.addRow({ date: x.date, name: i.name, q: i.quantity ? Number(i.quantity) : null, u: i.unit, p: m(i.unitPrice), t: m(i.lineTotal), v: x.vendorName || (x.partyId ? party.get(x.partyId) : "") || "", c: cat(x.category), s: STATUS[x.status], id: x.id });
  }
  totalRow(mt, "Cəmi (təsdiqlənmiş)", "name", ["F"], "I", STATUS.approved);
  finish(mt);

  /* 4. Parties */
  const pa = sheet(wb, "Usta və podratçı hesabları", [
    { header: "Ad", key: "name", width: 26 }, { header: "Rol", key: "role", width: 12 }, { header: "Əsas", key: "basis", width: 12 },
    { header: "Müqavilə", key: "contract", width: 14, money: true }, { header: "Təsdiqlənmiş əlavə işlər", key: "co", width: 16, money: true }, { header: "Qaimələr üzrə", key: "inv", width: 14, money: true },
    { header: "Öhdəlik", key: "obl", width: 14, money: true }, { header: "Ödənilib (avans daxil)", key: "paid", width: 16, money: true }, { header: "Geri qaytarılıb", key: "ref", width: 14, money: true },
    { header: "Avansdan alınan materiallar", key: "spent", width: 18, money: true }, { header: "Hesaba sayılan ödəniş", key: "cred", width: 16, money: true },
    { header: "Qalıq borc", key: "rem", width: 14, money: true }, { header: "Avans qalığı", key: "advb", width: 14, money: true }, { header: "Status", key: "st", width: 16 },
  ]);
  for (const b of ledger.parties) {
    pa.addRow({ name: b.name, role: ROLE[b.role] ?? b.role, basis: b.basis === "contract" ? "Müqavilə" : "Qaimələr", contract: n(b.contract), co: n(b.approvedChangeOrders), inv: n(b.invoicedExpenses),
      obl: n(b.obligation), paid: n(b.paid), ref: n(b.refunds), spent: n(b.advanceSpent), cred: n(b.credited), rem: n(b.remaining), advb: n(b.advanceBalance), st: PARTY_STATUS[b.status] });
  }
  pa.addRow({});
  pa.addRow({ name: "Hesaba sayılan ödəniş = ödəniş + avans − geri qaytarılan − avansdan üçüncü tərəfə alınan materiallar. Qalıq = öhdəlik − hesaba sayılan." });
  finish(pa);

  /* 5. Payments */
  const py = sheet(wb, "Ödəniş tarixçəsi", [
    { header: "Tarix", key: "date", width: 12 }, { header: "Növ", key: "kind", width: 14 }, { header: "Ödəyən", key: "payer", width: 18 }, { header: "Alan", key: "payee", width: 24 },
    { header: "Məbləğ", key: "amount", width: 14, money: true }, { header: "Məqsəd", key: "purpose", width: 30 }, { header: "Üsul", key: "method", width: 10 },
    { header: "Status", key: "status", width: 16 }, { header: "Sübut faylı", key: "proof", width: 10 }, { header: "Əlaqəli qeyd", key: "ref", width: 38 }, { header: "Bank təsdiqi", key: "bank", width: 12 },
  ]);
  for (const p of d.payments) {
    py.addRow({ date: p.date, kind: PAY_KIND[p.kind] ?? p.kind, payer: p.kind === "refund" ? (p.partyId ? party.get(p.partyId) : p.payerName) : p.payerName || "Ev sahibi",
      payee: p.kind === "refund" ? "Ev sahibi" : (p.partyId ? party.get(p.partyId) : p.payeeName) || "", amount: m(p.amount), purpose: p.purpose, method: p.method,
      status: PAY_STATUS[p.status] ?? p.status, proof: p.proofMediaId ? "Var" : "Yoxdur", ref: p.expenseId ? `Xərc ${p.expenseId}` : p.changeOrderId ? `Əlavə iş ${p.changeOrderId}` : "", bank: "Yoxdur" });
  }
  totalRow(py, "Cəmi (qeyd edilmiş)", "payee", ["E"], "H", PAY_STATUS.recorded);
  const last = py.addRow({});
  last.getCell("D").value = "Cəmi (alan təsdiqləyib)";
  const lr = py.rowCount - 2;
  last.getCell("E").value = lr >= 2 ? { formula: `SUMIFS(E2:E${lr},H2:H${lr},"${PAY_STATUS.confirmed}")` } : 0;
  last.font = { bold: true, name: "Arial", size: 10 };
  finish(py);

  /* 6. By category */
  const bc = sheet(wb, "Kateqoriya üzrə xərclər", [{ header: "Kateqoriya", key: "c", width: 34 }, { header: "Qrup", key: "g", width: 12 }, { header: "Say", key: "n", width: 8 }, { header: "Məbləğ", key: "t", width: 16, money: true }, { header: "Pay", key: "p", width: 10 }]);
  const groupLabel: Record<string, string> = { material: "Material", labor: "İşçilik", other: "Digər" };
  for (const r of ledger.byCategory) {
    bc.addRow({ c: r.label, g: groupLabel[EXPENSE_CATEGORIES[r.category as keyof typeof EXPENSE_CATEGORIES].group], n: r.count, t: n(r.total), p: null });
  }
  const bcLast = bc.rowCount;
  for (let i = 2; i <= bcLast; i++) { bc.getCell(`E${i}`).value = { formula: `IF(SUM(D$2:D$${bcLast})=0,0,D${i}/SUM(D$2:D$${bcLast}))` }; bc.getCell(`E${i}`).numFmt = "0.0%"; }
  const bcTot = bc.addRow({ c: "Cəmi" });
  bcTot.getCell("C").value = bcLast >= 2 ? { formula: `SUM(C2:C${bcLast})` } : 0;
  bcTot.getCell("D").value = bcLast >= 2 ? { formula: `SUM(D2:D${bcLast})` } : 0;
  bcTot.font = { bold: true, name: "Arial", size: 10 };
  finish(bc);

  /* 7. Utility lines */
  const lines = await db.select().from(infrastructureItemsTable).where(eq(infrastructureItemsTable.homeId, a.home.id)).orderBy(asc(infrastructureItemsTable.createdAt));
  const ln = sheet(wb, "Kommunikasiya xətləri", [
    { header: "Tarix", key: "date", width: 12 }, { header: "Otaq", key: "room", width: 18 }, { header: "Xətt növü", key: "type", width: 18 }, { header: "Ad", key: "label", width: 24 },
    { header: "Qeyd", key: "notes", width: 36 }, { header: "Mənbə", key: "src", width: 22 }, { header: "Yoxlanılıb", key: "ver", width: 12 }, { header: "Foto ID", key: "photo", width: 38 },
  ]);
  for (const l of lines) {
    ln.addRow({ date: l.createdAt.toISOString().slice(0, 10), room: l.roomId ? room.get(l.roomId) ?? "" : "", type: LINE[l.type] ?? l.type, label: l.label, notes: l.notes,
      src: SOURCE[l.source] ?? l.source, ver: l.verifiedAt ? l.verifiedAt.toISOString().slice(0, 10) : "Yox", photo: l.mediaId ?? "" });
  }
  ln.addRow({});
  ln.addRow({ date: "Qeyd: işarələr təxminidir və köməkçi arxivdir; yoxlanılmamış məlumat mühəndislik planı deyil." });
  finish(ln);

  /* 8. Chronology */
  const works = await db.select().from(workRecordsTable).where(eq(workRecordsTable.homeId, a.home.id));
  const photoCounts = await db.select({ workId: homeMediaTable.workId, n: sql<number>`count(*)::int` }).from(homeMediaTable)
    .where(and(eq(homeMediaTable.homeId, a.home.id), isNull(homeMediaTable.deletedAt), ne(homeMediaTable.phase, "finance"))).groupBy(homeMediaTable.workId);
  const pc = new Map(photoCounts.map((r) => [r.workId, r.n]));
  type Ev = { date: string; kind: string; title: string; amount: number | null; status: string; id: string };
  const evs: Ev[] = [
    ...works.map((w) => ({ date: w.startDate ?? w.createdAt.toISOString().slice(0, 10), kind: "Mərhələ", title: `${w.title} (${pc.get(w.id) ?? 0} fayl)`, amount: null, status: w.status, id: w.id })),
    ...d.expenses.map((x) => ({ date: x.date, kind: "Xərc", title: x.description, amount: m(x.total), status: STATUS[x.status], id: x.id })),
    ...d.payments.map((p) => ({ date: p.date, kind: PAY_KIND[p.kind] ?? p.kind, title: (p.partyId ? party.get(p.partyId) : p.payeeName) ?? "", amount: m(p.amount), status: PAY_STATUS[p.status], id: p.id })),
    ...d.changeOrders.map((c) => ({ date: c.date, kind: "Əlavə iş", title: `№${c.number} ${c.title}`, amount: m(c.amount), status: CO_STATUS[c.status], id: c.id })),
    ...d.invoices.map((i) => ({ date: i.docDate ?? i.createdAt.toISOString().slice(0, 10), kind: "Qaimə", title: i.vendor || "qaimə", amount: m(i.total), status: INV_STATUS[i.status], id: i.id })),
    ...d.budget.map((v) => ({ date: v.createdAt.toISOString().slice(0, 10), kind: "Büdcə", title: `v${v.version} ${v.note}`, amount: m(v.total), status: v.reason, id: v.id })),
  ].sort((x, y) => x.date.localeCompare(y.date));
  const ch = sheet(wb, "Tikinti tarixçəsi", [{ header: "Tarix", key: "date", width: 12 }, { header: "Növ", key: "kind", width: 14 }, { header: "Qeyd", key: "title", width: 44 }, { header: "Məbləğ", key: "amount", width: 14, money: true }, { header: "Status", key: "status", width: 18 }, { header: "ID", key: "id", width: 38 }]);
  for (const v of evs) ch.addRow(v);
  finish(ch);

  /* 9. Budget changes */
  const bv = sheet(wb, "Büdcə dəyişiklikləri", [{ header: "Versiya", key: "v", width: 9 }, { header: "Tarix", key: "date", width: 12 }, { header: "Səbəb", key: "r", width: 18 }, { header: "Qeyd", key: "note", width: 44 }, { header: "Büdcə", key: "t", width: 16, money: true }]);
  const REASON: Record<string, string> = { initial: "İlkin büdcə", change_order: "Əlavə iş", correction: "Düzəliş" };
  for (const v of d.budget) bv.addRow({ v: v.version, date: v.createdAt.toISOString().slice(0, 10), r: REASON[v.reason] ?? v.reason, note: v.note, t: m(v.total) });
  bv.addRow({});
  bv.addRow({ v: "Əlavə iş təklifləri" }).font = { bold: true, name: "Arial", size: 10 };
  bv.addRow({ v: "№", date: "Tarix", r: "Status", note: "Ad", t: "Məbləğ" }).font = { bold: true, name: "Arial", size: 10 };
  for (const c of d.changeOrders) bv.addRow({ v: c.number, date: c.date, r: CO_STATUS[c.status], note: `${c.title}${c.partyId ? ` · ${party.get(c.partyId) ?? ""}` : ""}${c.decisionNote ? ` — ${c.decisionNote}` : ""}`, t: m(c.amount) });
  finish(bv);

  /* 10. Invoices */
  const iv = sheet(wb, "Qaimələr", [
    { header: "Sənəd №", key: "no", width: 14 }, { header: "Tarix", key: "date", width: 12 }, { header: "Satıcı", key: "vendor", width: 26 }, { header: "Məbləğ", key: "total", width: 14, money: true },
    { header: "Status", key: "status", width: 24 }, { header: "AI oxuyub", key: "ai", width: 10 }, { header: "Dublikat ola bilər", key: "dup", width: 12 }, { header: "Xərc ID", key: "exp", width: 38 }, { header: "Fayl ID", key: "media", width: 38 },
  ]);
  for (const i of d.invoices) {
    iv.addRow({ no: i.docNumber, date: i.docDate, vendor: i.vendor, total: m(i.total), status: INV_STATUS[i.status] ?? i.status, ai: i.aiResult ? "Bəli" : "Xeyr", dup: i.duplicateOfId ? "Bəli" : "", exp: i.expenseId ?? "", media: i.mediaId });
  }
  totalRow(iv, "Cəmi (təsdiqlənmiş)", "vendor", ["D"], "E", INV_STATUS.confirmed);
  finish(iv);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/*
 * "Evimin xərcləri" journal: the simple export of the expense book.
 * Totals are formulas over the "Bütün xərclər" sheet, so they stay right after edits in Excel
 * (edits in Excel are never written back to the site).
 */
export async function buildJournalWorkbook(a: ProjectAccess, d: ProjectData, range: { from?: string; to?: string } = {}, comparison?: { category: string; planned: number; actual: number }[] | null): Promise<Buffer> {
  const cat = (c: string) => EXPENSE_CATEGORIES[c as keyof typeof EXPENSE_CATEGORIES]?.label ?? c;
  const party = new Map(d.parties.map((p) => [p.id, p.name]));
  const inv = new Map(d.invoices.map((i) => [i.id, i]));
  const media = d.invoices.length ? await db.select({ id: homeMediaTable.id, name: homeMediaTable.originalName, sha: homeMediaTable.sha256 }).from(homeMediaTable).where(eq(homeMediaTable.homeId, a.home.id)) : [];
  const mediaBy = new Map(media.map((m) => [m.id, m]));
  const inRange = (date: string) => (!range.from || date >= range.from) && (!range.to || date <= range.to);
  const rows = d.expenses.filter((e) => e.status !== "void" && inRange(e.date)).sort((x, y) => x.date.localeCompare(y.date));
  const itemsBy = new Map<string, typeof d.items>();
  for (const i of d.items) itemsBy.set(i.expenseId, [...(itemsBy.get(i.expenseId) ?? []), i]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tehvil.az"; wb.created = new Date();
  const APPROVED = STATUS.approved;

  /* Bütün xərclər — first built, the other sheets refer to it. */
  const all = sheet(wb, "Bütün xərclər", [
    { header: "Qeyd ID", key: "id", width: 38 }, { header: "Tarix", key: "date", width: 12 }, { header: "Ay", key: "month", width: 9 }, { header: "Ev layihəsi", key: "home", width: 22 },
    { header: "Xərcin adı", key: "name", width: 34 }, { header: "Kateqoriya", key: "cat", width: 26 }, { header: "Miqdar", key: "q", width: 10 }, { header: "Vahid", key: "u", width: 8 },
    { header: "Məbləğ", key: "amount", width: 14, money: true }, { header: "Valyuta", key: "cur", width: 8 }, { header: "Satıcı", key: "vendor", width: 24 }, { header: "Qeyd", key: "note", width: 30 },
    { header: "Qəbzə istinad", key: "receipt", width: 38 }, { header: "Status", key: "status", width: 16 },
  ]);
  for (const e of rows) {
    const items = itemsBy.get(e.id) ?? [];
    const one = items.length === 1 ? items[0] : null;
    all.addRow({ id: e.id, date: e.date, month: e.date.slice(0, 7), home: a.home.name, name: e.description, cat: cat(e.category), q: one?.quantity ? Number(one.quantity) : null, u: one?.unit ?? "",
      amount: m(e.total), cur: a.project.currency, vendor: e.vendorName || (e.partyId ? party.get(e.partyId) : "") || "", note: e.note, receipt: e.invoiceId ?? "", status: STATUS[e.status] ?? e.status });
  }
  const last = Math.max(2, all.rowCount);
  totalRow(all, "Cəmi (təsdiqlənmiş)", "name", ["I"], "N", APPROVED);
  finish(all);
  const R = (col: string) => `'Bütün xərclər'!$${col}$2:$${col}$${last}`;

  /* Ümumi xülasə */
  const ledger = computeLedger(d);
  const s = sheet(wb, "Ümumi xülasə", [{ header: "Göstərici", key: "k", width: 36 }, { header: "Dəyər", key: "v", width: 22 }, { header: "Qeyd", key: "n", width: 60 }]);
  s.addRow({ k: "Ev", v: a.home.name });
  s.addRow({ k: "Dövr", v: `${range.from ? range.from : "əvvəldən"} — ${range.to ? range.to : "bu günə qədər"}` });
  s.addRow({ k: "Hesabat tarixi", v: new Date().toISOString().slice(0, 10) });
  const tot = s.addRow({ k: "Ümumi xərc (təsdiqlənmiş)", n: "Bütün xərclər vərəqindəki təsdiqlənmiş qeydlərin cəmi" });
  tot.getCell("v").value = { formula: `SUMIFS(${R("I")},${R("N")},"${APPROVED}")` }; tot.getCell("v").numFmt = MONEY;
  const bud = s.addRow({ k: "Büdcə", v: n(ledger.totals.budgetCurrent), n: ledger.totals.budgetCurrent == null ? "Büdcə daxil edilməyib" : "Son razılaşdırılmış büdcə" });
  bud.getCell("v").numFmt = MONEY;
  const left = s.addRow({ k: "Büdcədən qalan", n: ledger.totals.budgetCurrent == null ? "Büdcə olmadığı üçün hesablanmır" : "Büdcə − ümumi xərc" });
  if (ledger.totals.budgetCurrent != null) { left.getCell("v").value = { formula: `B${bud.number}-B${tot.number}` }; left.getCell("v").numFmt = MONEY; } else left.getCell("v").value = "—";
  s.addRow({ k: "Qeyd sayı", v: rows.length });
  s.addRow({});
  s.addRow({ k: "Qeyd", n: "Excel-də etdiyiniz dəyişikliklər sayta avtomatik yazılmır." });
  finish(s);

  /* Kateqoriyalar üzrə */
  const bc = sheet(wb, "Kateqoriyalar üzrə", [{ header: "Kateqoriya", key: "c", width: 30 }, { header: "Say", key: "n", width: 8 }, { header: "Məbləğ", key: "t", width: 16, money: true }]);
  const cats = [...new Set(rows.map((e) => cat(e.category)))].sort();
  for (const c of cats) {
    const r = bc.addRow({ c });
    r.getCell("n").value = { formula: `COUNTIFS(${R("F")},A${r.number},${R("N")},"${APPROVED}")` };
    r.getCell("t").value = { formula: `SUMIFS(${R("I")},${R("F")},A${r.number},${R("N")},"${APPROVED}")` };
  }
  const bcEnd = bc.rowCount;
  const bct = bc.addRow({ c: "Cəmi" });
  bct.getCell("n").value = bcEnd >= 2 ? { formula: `SUM(B2:B${bcEnd})` } : 0;
  bct.getCell("t").value = bcEnd >= 2 ? { formula: `SUM(C2:C${bcEnd})` } : 0;
  bct.font = { bold: true, name: "Arial", size: 10 };
  finish(bc);

  /* Aylıq xərclər */
  const mo = sheet(wb, "Aylıq xərclər", [{ header: "Ay", key: "m", width: 10 }, { header: "Say", key: "n", width: 8 }, { header: "Məbləğ", key: "t", width: 16, money: true }]);
  for (const month of [...new Set(rows.map((e) => e.date.slice(0, 7)))].sort()) {
    const r = mo.addRow({ m: month });
    r.getCell("n").value = { formula: `COUNTIFS(${R("C")},A${r.number},${R("N")},"${APPROVED}")` };
    r.getCell("t").value = { formula: `SUMIFS(${R("I")},${R("C")},A${r.number},${R("N")},"${APPROVED}")` };
  }
  const moEnd = mo.rowCount;
  const mot = mo.addRow({ m: "Cəmi" });
  mot.getCell("t").value = moEnd >= 2 ? { formula: `SUM(C2:C${moEnd})` } : 0;
  mot.font = { bold: true, name: "Arial", size: 10 };
  finish(mo);

  /* Smeta və faktiki xərc */
  if (comparison?.length) {
    const cm = sheet(wb, "Smeta və faktiki", [{ header: "Kateqoriya", key: "c", width: 30 }, { header: "Smetada", key: "p", width: 16, money: true }, { header: "Faktiki", key: "a", width: 16, money: true }, { header: "Fərq (faktiki − smeta)", key: "d", width: 20, money: true }]);
    for (const c of comparison) {
      const r = cm.addRow({ c: c.category, p: n(c.planned), a: n(c.actual) });
      r.getCell("d").value = { formula: `C${r.number}-B${r.number}` }; r.getCell("d").numFmt = MONEY;
    }
    finish(cm);
  }

  /* Əlavə məlumatlar və qəbzlər */
  const ex = sheet(wb, "Qəbzlər və əlavə məlumat", [{ header: "Qeyd ID", key: "id", width: 38 }, { header: "Qəbz ID", key: "inv", width: 38 }, { header: "Fayl", key: "file", width: 30 }, { header: "SHA-256", key: "sha", width: 66 }, { header: "AI oxuyub", key: "ai", width: 10 }, { header: "Satıcı (qəbzdə)", key: "v", width: 24 }, { header: "Sənəd №", key: "no", width: 14 }]);
  for (const e of rows) {
    const i = e.invoiceId ? inv.get(e.invoiceId) : null;
    const f = i ? mediaBy.get(i.mediaId) : null;
    ex.addRow({ id: e.id, inv: i?.id ?? "", file: f?.name ?? "", sha: f?.sha ?? "", ai: i?.aiResult ? "Bəli" : i ? "Xeyr" : "", v: i?.vendor ?? "", no: i?.docNumber ?? "" });
  }
  finish(ex);

  // Summary first, as people open the file.
  const order = ["Ümumi xülasə", "Bütün xərclər", "Kateqoriyalar üzrə", "Aylıq xərclər", "Smeta və faktiki", "Qəbzlər və əlavə məlumat"];
  wb.worksheets.sort((x, y) => order.indexOf(x.name) - order.indexOf(y.name)).forEach((w, i) => { (w as unknown as { orderNo: number }).orderNo = i; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
