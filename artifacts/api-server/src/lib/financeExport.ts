import ExcelJS from "exceljs";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db, homeMediaTable, homeRoomsTable, infrastructureItemsTable, workRecordsTable } from "@workspace/db";
import { computeLedger, EXPENSE_CATEGORIES, expenseSlices, FORMULAS, fromCents, toCents, type ProjectAccess, type ProjectData } from "./financeCore";

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
  const REASON: Record<string, string> = { initial: "İlkin büdcə", change_order: "Əlavə iş", correction: "Düzəliş", removed: "Büdcə götürüldü" };
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
 * "Bütün xərclər" has one row per material / work line (a day with cement, rebar and a worker's fee gives three rows),
 * plus a correction row when an expense total differs from its lines (discount, tax). So the rows always add up to the
 * expense totals: nothing is lost and nothing is counted twice. Every other sheet is formulas over these rows.
 * Edits in Excel are never written back to the site.
 */
export async function buildJournalWorkbook(a: ProjectAccess, d: ProjectData, range: { from?: string; to?: string; cat?: string; pay?: "paid" | "unpaid"; entry?: string } = {}, comparison?: { category: string; planned: number; actual: number }[] | null): Promise<Buffer> {
  const cat = (c: string) => EXPENSE_CATEGORIES[c as keyof typeof EXPENSE_CATEGORIES]?.label ?? c;
  const GROUP: Record<string, string> = { material: "Material", labor: "İşçilik", other: "Digər" };
  const grp = (c: string) => GROUP[EXPENSE_CATEGORIES[c as keyof typeof EXPENSE_CATEGORIES]?.group ?? "other"];
  const party = new Map(d.parties.map((p) => [p.id, p.name]));
  const inv = new Map(d.invoices.map((i) => [i.id, i]));
  const media = d.invoices.length ? await db.select({ id: homeMediaTable.id, name: homeMediaTable.originalName, sha: homeMediaTable.sha256 }).from(homeMediaTable).where(eq(homeMediaTable.homeId, a.home.id)) : [];
  const mediaBy = new Map(media.map((x) => [x.id, x]));
  const inRange = (date: string) => (!range.from || date >= range.from) && (!range.to || date <= range.to);
  const itemsBy = new Map<string, typeof d.items>();
  for (const i of d.items) itemsBy.set(i.expenseId, [...(itemsBy.get(i.expenseId) ?? []), i]);
  const ledger = computeLedger(d);
  // Same filters as the page: period, category (only that category's lines), paid / unpaid.
  const owed = (e: (typeof d.expenses)[number]) => { const p = ledger.payState.get(e.id); return e.status === "approved" && p && (p.status === "unpaid" || p.status === "partial") ? toCents(e.total) - p.paid : 0; };
  const rows = d.expenses.filter((e) => e.status !== "void" && inRange(e.date)
    && (!range.entry || e.id === range.entry || e.entryId === range.entry)
    && (!range.pay || (range.pay === "unpaid" ? owed(e) > 0 : owed(e) === 0))
    && (!range.cat || expenseSlices(e, itemsBy.get(e.id) ?? []).some((x) => x.category === range.cat)))
    .sort((x, y) => x.date.localeCompare(y.date) || x.createdAt.getTime() - y.createdAt.getTime());
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tehvil.az"; wb.created = new Date();
  const APPROVED = STATUS.approved;
  const UNPAID = EXP_PAY.unpaid;
  const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const DATE = "dd.mm.yyyy";

  /* Bütün xərclər — first built, the other sheets refer to it. A..M as asked, N..P helper columns for the totals. */
  const all = sheet(wb, "Bütün xərclər", [
    { header: "Tarix", key: "date", width: 12 }, { header: "Ev layihəsi", key: "home", width: 22 }, { header: "Qeyd ID-si", key: "id", width: 38 },
    { header: "Məhsul və ya iş", key: "name", width: 34 }, { header: "Kateqoriya", key: "cat", width: 26 }, { header: "Miqdar", key: "q", width: 10 }, { header: "Vahid", key: "u", width: 8 },
    { header: "Vahid qiymət", key: "p", width: 14, money: true }, { header: "Ümumi məbləğ", key: "amount", width: 15, money: true }, { header: "Ödəniş statusu", key: "pay", width: 16 },
    { header: "Satıcı", key: "vendor", width: 24 }, { header: "Qeyd", key: "note", width: 30 }, { header: "Qaimə və ya fayl identifikatoru", key: "receipt", width: 38 },
    { header: "Ay", key: "month", width: 9 }, { header: "Qeydin statusu", key: "status", width: 16 }, { header: "Qrup", key: "group", width: 10 },
  ]);
  let lineCount = 0;
  for (const e of rows) {
    const items = itemsBy.get(e.id) ?? [];
    const pay = EXP_PAY[ledger.payState.get(e.id)?.status ?? "n/a"] ?? "—";
    const i0 = e.invoiceId ? inv.get(e.invoiceId) : null;
    const base = {
      date: asDate(e.date), home: a.home.name, id: e.entryId ?? e.id, pay, vendor: e.vendorName || (e.partyId ? party.get(e.partyId) : "") || "",
      receipt: e.invoiceId ? `${i0?.docNumber ? `№ ${i0.docNumber} · ` : ""}${e.invoiceId}` : "", month: e.date.slice(0, 7), status: STATUS[e.status] ?? e.status,
    };
    const add = (v: Record<string, unknown>, formula?: string) => {
      const r = all.addRow({ ...base, ...v });
      r.getCell("date").numFmt = DATE;
      if (formula) r.getCell("amount").value = { formula: formula.replace(/#/g, String(r.number)), result: v.amount as number };
      lineCount++;
    };
    if (!items.length) { add({ name: e.description, cat: cat(e.category), group: grp(e.category), amount: m(e.total), note: e.note }); continue; }
    let covered = 0;
    for (const i of items) {
      const c = i.category ?? e.category;
      if (range.cat && c !== range.cat) { covered += Math.round(Number(i.lineTotal) * 100); continue; }
      covered += Math.round(Number(i.lineTotal) * 100);
      const q = i.quantity ? Number(i.quantity) : null, p = i.unitPrice ? Number(i.unitPrice) : null;
      // Quantity × unit price as a formula when it is what was recorded; the receipt's own figure otherwise.
      const exact = q != null && p != null && Math.round(q * p * 100) === Math.round(Number(i.lineTotal) * 100);
      add({ name: i.name, cat: cat(c), group: grp(c), q, u: i.unit, p, amount: m(i.lineTotal), note: [i.note, e.note].filter(Boolean).join(" · ") }, exact ? "ROUND(F#*H#,2)" : undefined);
    }
    const diff = Math.round(Number(e.total) * 100) - covered;
    if (diff !== 0 && (!range.cat || e.category === range.cat)) add({ name: `${e.description} — endirim / vergi / fərq`, cat: cat(e.category), group: grp(e.category), amount: n(diff), note: "Xərcin yekunu ilə sətirlərin cəmi arasındakı fərq" });
  }
  const last = Math.max(2, all.rowCount);
  totalRow(all, "Cəmi (təsdiqlənmiş)", "name", ["I"], "O", APPROVED);
  finish(all);
  const R = (col: string) => `'Bütün xərclər'!$${col}$2:$${col}$${last}`;
  const ok = `${R("O")},"${APPROVED}"`;

  /* Ümumi xülasə */
  const s = sheet(wb, "Ümumi xülasə", [{ header: "Göstərici", key: "k", width: 36 }, { header: "Dəyər", key: "v", width: 22 }, { header: "Qeyd", key: "n", width: 64 }]);
  s.addRow({ k: "Ev", v: a.home.name });
  s.addRow({ k: "Dövr", v: `${range.from ? range.from : "əvvəldən"} — ${range.to ? range.to : "bu günə qədər"}` });
  if (range.entry) s.addRow({ k: "Qeyd", v: rows[0] ? `${rows[0].date} · ${rows[0].description}` : "—", n: "Yalnız bu gündəlik qeyd" });
  if (range.cat || range.pay) s.addRow({ k: "Filtr", v: [range.cat ? cat(range.cat) : "", range.pay === "unpaid" ? "Yalnız ödənilməyib" : range.pay === "paid" ? "Yalnız ödənilib" : ""].filter(Boolean).join(" · "), n: "Saytdakı seçimə uyğun" });
  s.addRow({ k: "Hesabat tarixi", v: new Date().toISOString().slice(0, 10) });
  const money = (k: string, formula: string, note: string) => { const r = s.addRow({ k, n: note }); r.getCell("v").value = { formula }; r.getCell("v").numFmt = MONEY; return r; };
  const tot = money("Ümumi xərc (təsdiqlənmiş)", `SUMIFS(${R("I")},${ok})`, "Bütün xərclər vərəqindəki təsdiqlənmiş sətirlərin cəmi");
  money("O cümlədən material", `SUMIFS(${R("I")},${ok},${R("P")},"Material")`, "Material kateqoriyalı sətirlər");
  money("O cümlədən usta və işlər", `SUMIFS(${R("I")},${ok},${R("P")},"İşçilik")`, "Usta və fəhlə haqqı, digər işlər");
  money("O cümlədən digər", `SUMIFS(${R("I")},${ok},${R("P")},"Digər")`, "Texnika, nəqliyyat, layihə və digər xərclər");
  money("Ödənilməyib", `SUMIFS(${R("I")},${ok},${R("J")},"${UNPAID}")`, "“Ödənilməyib” statuslu sətirlər (qismən ödənilənlər daxil deyil)");
  const bud = s.addRow({ k: "Büdcə", v: n(ledger.totals.budgetCurrent), n: ledger.totals.budgetCurrent == null ? "Büdcə daxil edilməyib" : "Son razılaşdırılmış büdcə" });
  bud.getCell("v").numFmt = MONEY;
  const left = s.addRow({ k: "Büdcədən qalan", n: ledger.totals.budgetCurrent == null ? "Büdcə olmadığı üçün hesablanmır" : "Büdcə − ümumi xərc" });
  if (ledger.totals.budgetCurrent != null) { left.getCell("v").value = { formula: `B${bud.number}-B${tot.number}` }; left.getCell("v").numFmt = MONEY; } else left.getCell("v").value = "—";
  s.addRow({ k: "Xərc qeydi", v: rows.length, n: "Bir gündəlik qeyd ödənilən və ödənilməyən hissəyə bölünə bilər" });
  s.addRow({ k: "Sətir", v: lineCount, n: "Material və iş sətirləri" });
  s.addRow({});
  s.addRow({ k: "Qeyd", n: "Excel-də etdiyiniz dəyişikliklər sayta avtomatik yazılmır." });
  finish(s);

  /* Day / month / category sheets: the same columns, grouped by a different key. */
  const grouped = (name: string, keyHeader: string, keyCol: string, keys: (string | Date)[], dateKeys = false) => {
    const ws = sheet(wb, name, [
      { header: keyHeader, key: "k", width: 26 }, { header: "Sətir sayı", key: "c", width: 10 }, { header: "Material", key: "mat", width: 15, money: true },
      { header: "Usta və işlər", key: "lab", width: 15, money: true }, { header: "Digər", key: "oth", width: 15, money: true }, { header: "Cəmi", key: "t", width: 16, money: true },
      { header: "O cümlədən ödənilməyib", key: "u", width: 18, money: true },
    ]);
    for (const k of keys) {
      const r = ws.addRow({ k });
      if (dateKeys) r.getCell("k").numFmt = DATE;
      const by = `${R(keyCol)},A${r.number}`;
      r.getCell("c").value = { formula: `COUNTIFS(${by},${ok})` };
      r.getCell("mat").value = { formula: `SUMIFS(${R("I")},${by},${ok},${R("P")},"Material")` };
      r.getCell("lab").value = { formula: `SUMIFS(${R("I")},${by},${ok},${R("P")},"İşçilik")` };
      r.getCell("oth").value = { formula: `SUMIFS(${R("I")},${by},${ok},${R("P")},"Digər")` };
      r.getCell("t").value = { formula: `SUMIFS(${R("I")},${by},${ok})` };
      r.getCell("u").value = { formula: `SUMIFS(${R("I")},${by},${ok},${R("J")},"${UNPAID}")` };
    }
    const end = ws.rowCount;
    const t = ws.addRow({ k: "Cəmi" });
    for (const col of ["B", "C", "D", "E", "F", "G"]) t.getCell(col).value = end >= 2 ? { formula: `SUM(${col}2:${col}${end})` } : 0;
    t.font = { bold: true, name: "Arial", size: 10 }; t.border = { top: { style: "thin" } };
    finish(ws);
  };
  grouped("Günlər üzrə xərclər", "Tarix", "A", [...new Set(rows.map((e) => e.date))].sort().map(asDate), true);
  grouped("Aylar üzrə xərclər", "Ay", "N", [...new Set(rows.map((e) => e.date.slice(0, 7)))].sort());
  const usedCats = new Set<string>();
  for (const e of rows) { const it = itemsBy.get(e.id) ?? []; usedCats.add(e.category); for (const i of it) usedCats.add(i.category ?? e.category); }
  grouped("Kateqoriyalar üzrə xərclər", "Kateqoriya", "E", [...usedCats].map(cat).filter((v, i, arr) => arr.indexOf(v) === i).sort());

  /* Smeta və faktiki xərc */
  if (comparison?.length) {
    const cm = sheet(wb, "Smeta və faktiki", [{ header: "Kateqoriya", key: "c", width: 30 }, { header: "Smetada", key: "p", width: 16, money: true }, { header: "Faktiki", key: "a", width: 16, money: true }, { header: "Fərq (faktiki − smeta)", key: "d", width: 20, money: true }]);
    for (const c of comparison) {
      const r = cm.addRow({ c: c.category, p: n(c.planned), a: n(c.actual) });
      r.getCell("d").value = { formula: `C${r.number}-B${r.number}` }; r.getCell("d").numFmt = MONEY;
    }
    finish(cm);
  }

  /* Qəbzlər və əlavə məlumat: which file is behind each record. */
  const ex = sheet(wb, "Qəbzlər və əlavə məlumat", [{ header: "Qeyd ID-si", key: "id", width: 38 }, { header: "Xərc ID", key: "eid", width: 38 }, { header: "Qəbz ID", key: "inv", width: 38 }, { header: "Fayl", key: "file", width: 30 }, { header: "SHA-256", key: "sha", width: 66 }, { header: "AI oxuyub", key: "ai", width: 10 }, { header: "Satıcı (qəbzdə)", key: "v", width: 24 }, { header: "Sənəd №", key: "no", width: 14 }]);
  for (const e of rows) {
    const i = e.invoiceId ? inv.get(e.invoiceId) : null;
    const f = i ? mediaBy.get(i.mediaId) : null;
    ex.addRow({ id: e.entryId ?? e.id, eid: e.id, inv: i?.id ?? "", file: f?.name ?? "", sha: f?.sha ?? "", ai: i?.aiResult ? "Bəli" : i ? "Xeyr" : "", v: i?.vendor ?? "", no: i?.docNumber ?? "" });
  }
  finish(ex);

  // Summary first, as people open the file.
  // The lines first: that is what people look for when they open the file; the summary right after.
  const order = ["Bütün xərclər", "Ümumi xülasə", "Günlər üzrə xərclər", "Aylar üzrə xərclər", "Kateqoriyalar üzrə xərclər", "Smeta və faktiki", "Qəbzlər və əlavə məlumat"];
  wb.worksheets.sort((x, y) => order.indexOf(x.name) - order.indexOf(y.name)).forEach((w, i) => { (w as unknown as { orderNo: number }).orderNo = i; });
  wb.views = [{ x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
