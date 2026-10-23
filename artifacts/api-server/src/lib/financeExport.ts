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
