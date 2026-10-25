import ExcelJS from "exceljs";
import { CATEGORY_LABEL, paramLabel, STATUS_LABEL, type EstimateDoc, type EstimateResult, type Question } from "./estimateEngine";

/*
 * AI Smeta → .xlsx. Quantities come from the engine; amounts, rebar masses and totals are Excel formulas,
 * so the file stays right when someone edits a price or a quantity in Excel.
 */
const MONEY = '#,##0.00 "AZN"';
const SRC: Record<string, string> = { drawing: "Çertyojdan", user: "İstifadəçi", assumed: "Fərziyyə", missing: "Yoxdur", engineer: "Mühəndisə soruşulacaq", list: "Mühəndisin siyahısı" };
const UNIT: Record<string, string> = { width: "m", height: "m", depth: "m", length: "m", thickness: "m", cover: "m", area: "m²", openings: "m²", volume: "m³", longD: "mm", stirD: "mm", meshD: "mm", stirSpacing: "m", meshSpacing: "m", count: "ədəd", longCount: "ədəd", layers: "qat", junctions: "ədəd" };

function sheet(wb: ExcelJS.Workbook, name: string, cols: { header: string; key: string; width: number; money?: boolean; fmt?: string }[], title: string[]) {
  const ws = wb.addWorksheet(name);
  for (const t of title) ws.addRow([t]).font = { name: "Arial", size: 10, bold: title.indexOf(t) === 0 };
  if (title.length) ws.addRow([]);
  const headerRow = ws.rowCount + 1;
  ws.columns = cols.map((c) => ({ key: c.key, width: c.width, style: c.money ? { numFmt: MONEY } : c.fmt ? { numFmt: c.fmt } : {} }));
  const h = ws.getRow(headerRow);
  cols.forEach((c, i) => { h.getCell(i + 1).value = c.header; });
  h.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3D33" } };
  h.alignment = { wrapText: true, vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: headerRow }];
  return { ws, headerRow };
}
const font = (ws: ExcelJS.Worksheet, from: number) => ws.eachRow((r, i) => { if (i > from) r.font = { name: "Arial", size: 10, ...(r.font ?? {}) }; });

export async function buildEstimateWorkbook(meta: { name: string; kind: string; location: string; version: number; date: string }, doc: EstimateDoc, r: EstimateResult, questions: Question[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook(); wb.creator = "Tehvil.az AI Smeta"; wb.created = new Date();
  const title = [`${meta.name} — AI Smeta`, `Tarix: ${meta.date} · versiya ${meta.version}${meta.location ? ` · ${meta.location}` : ""}`, "AI smetası mühəndis layihəsini və konstruktiv yoxlamanı əvəz etmir."];

  /* 1. Ümumi smeta */
  const { ws: s, headerRow: sh } = sheet(wb, "Ümumi smeta", [
    { header: "Kateqoriya", key: "cat", width: 16 }, { header: "Material və ya iş", key: "name", width: 40 }, { header: "Miqdar", key: "qty", width: 12, fmt: "#,##0.###" }, { header: "Vahid", key: "unit", width: 8 },
    { header: "Vahid qiymət", key: "price", width: 14, money: true }, { header: "Məbləğ", key: "amount", width: 16, money: true }, { header: "Status", key: "status", width: 28 }, { header: "Qeyd", key: "note", width: 50 },
  ], title);
  for (const i of r.items) {
    const row = s.addRow({ cat: CATEGORY_LABEL[i.category], name: i.name, qty: i.qty, unit: i.unit, price: i.unitPrice, status: STATUS_LABEL[i.status],
      note: [i.overridden ? `Miqdar istifadəçi tərəfindən dəyişdirilib (hesablanan: ${i.computedQty ?? "—"}${doc.overrides[i.key]?.reason ? `; ${doc.overrides[i.key]?.reason}` : ""})` : "", ...i.assumptions, ...(i.extra ?? []).map((x) => `${x.label}: ${x.value} ${x.unit}`)].filter(Boolean).join(" · ") });
    row.getCell("amount").value = { formula: `IF(AND(ISNUMBER(C${row.number}),ISNUMBER(E${row.number})),C${row.number}*E${row.number},"")` };
  }
  const sEnd = s.rowCount;
  const tot = s.addRow({ name: "Cəmi (qiyməti yazılmış sətirlər)" });
  tot.getCell("amount").value = { formula: `SUM(F${sh + 1}:F${sEnd})` };
  tot.font = { bold: true, name: "Arial", size: 10 };
  if (r.totals.unpricedLines) s.addRow({ name: `${r.totals.unpricedLines} sətrin qiyməti yazılmayıb — cəmə daxil deyil.` });
  if (r.totals.openLines) s.addRow({ name: `${r.totals.openLines} sətir “Dəqiqləşdirilməlidir” — miqdar yoxdur.` });
  font(s, sh);

  /* 2. Beton */
  const { ws: c, headerRow: ch } = sheet(wb, "Beton hesablamaları", [{ header: "Element", key: "el", width: 28 }, { header: "Düstur və ölçülər", key: "f", width: 90 }, { header: "Həcm, m³", key: "v", width: 12, fmt: "#,##0.000" }, { header: "Status", key: "st", width: 28 }], title);
  for (const b of r.concrete) c.addRow({ el: b.element, f: b.formula, v: b.value, st: STATUS_LABEL[b.status] });
  const cEnd = c.rowCount; const ct = c.addRow({ f: "Konstruktiv həcm (ehtiyatsız)" }); ct.getCell("v").value = { formula: `SUM(C${ch + 1}:C${cEnd})` }; ct.font = { bold: true, name: "Arial", size: 10 };
  const res = r.items.find((i) => i.key === "concrete:reserve");
  if (res) c.addRow({ f: res.name + " — ayrıca", v: res.qty });
  c.getColumn("f").alignment = { wrapText: true, vertical: "top" };
  font(c, ch);

  /* 3. Armatur */
  const { ws: a, headerRow: ah } = sheet(wb, "Armatur hesablamaları", [
    { header: "Element", key: "el", width: 24 }, { header: "Hissə", key: "part", width: 10 }, { header: "Ø, mm", key: "d", width: 7 }, { header: "Say", key: "n", width: 8 }, { header: "Bir çubuq, m", key: "each", width: 12, fmt: "#,##0.000" },
    { header: "Cəmi, m", key: "m", width: 12, fmt: "#,##0.00" }, { header: "kq/m (d²/162)", key: "kgm", width: 12, fmt: "0.0000" }, { header: "Kütlə, kq", key: "kg", width: 12, fmt: "#,##0.00" }, { header: "Status", key: "st", width: 26 }, { header: "Düstur", key: "f", width: 70 },
  ], title);
  for (const x of r.rebar) {
    const row = a.addRow({ el: x.element, part: x.part, d: x.d || null, n: x.count, each: x.lengthEach, m: x.totalM, st: STATUS_LABEL[x.status], f: x.formula });
    if (x.d) row.getCell("kgm").value = { formula: `C${row.number}^2/162` };
    if (x.totalM != null && x.d) row.getCell("kg").value = { formula: `F${row.number}*G${row.number}` };
  }
  const aEnd = a.rowCount;
  a.addRow({});
  a.addRow({ el: "Diametr üzrə yekun" }).font = { bold: true, name: "Arial", size: 10 };
  for (const d of [...new Set(r.rebar.map((x) => x.d).filter(Boolean))].sort((p, q) => p - q)) {
    const row = a.addRow({ el: `Ø${d} mm`, d });
    row.getCell("kg").value = { formula: `SUMIF(C${ah + 1}:C${aEnd},${d},H${ah + 1}:H${aEnd})` };
    row.getCell("m").value = { formula: `H${row.number}/1000` }; row.getCell("m").numFmt = '0.000 "t"';
  }
  const cut = r.items.find((i) => i.key === "rebar:cut");
  if (cut) a.addRow({ el: cut.name + " — ayrıca", kg: cut.qty });
  font(a, ah);

  /* 4. Qəlib və taxta */
  const { ws: f, headerRow: fh } = sheet(wb, "Qəlib və taxta", [{ header: "Element / material", key: "el", width: 36 }, { header: "Düstur", key: "f", width: 80 }, { header: "Miqdar", key: "v", width: 12, fmt: "#,##0.###" }, { header: "Vahid", key: "u", width: 8 }, { header: "Status", key: "st", width: 28 }], title);
  for (const b of r.formwork) f.addRow({ el: b.element, f: b.formula, v: b.value, u: "m²", st: STATUS_LABEL[b.status] });
  for (const i of r.items.filter((x) => x.category === "formwork" || x.category === "timber")) f.addRow({ el: i.name, f: i.formula, v: i.qty, u: i.unit, st: STATUS_LABEL[i.status] });
  font(f, fh);

  /* 5. Digər materiallar */
  const other = r.items.filter((i) => i.category === "other");
  if (other.length) {
    const { ws: o, headerRow: oh } = sheet(wb, "Digər materiallar", [{ header: "Material", key: "n", width: 36 }, { header: "Miqdar", key: "q", width: 12 }, { header: "Vahid", key: "u", width: 8 }, { header: "Mənbə / düstur", key: "f", width: 70 }, { header: "Status", key: "st", width: 28 }], title);
    for (const i of other) o.addRow({ n: i.name, q: i.qty, u: i.unit, f: i.formula, st: STATUS_LABEL[i.status] });
    font(o, oh);
  }

  /* 6. Ölçülər və izah */
  const { ws: m, headerRow: mh } = sheet(wb, "Ölçülər və izah", [{ header: "Element", key: "el", width: 26 }, { header: "Parametr", key: "p", width: 26 }, { header: "Dəyər", key: "v", width: 12 }, { header: "Vahid", key: "u", width: 8 }, { header: "Mənbə", key: "s", width: 22 }, { header: "Əminlik", key: "c", width: 9 }, { header: "Harada oxunub / qeyd", key: "w", width: 50 }], title);
  for (const e of doc.elements) {
    if (e.segments?.length) m.addRow({ el: e.name, p: "seqmentlər", v: e.segments.join(" + "), u: "m", s: SRC[e.params.segments?.source ?? "drawing"] });
    for (const [k, p] of Object.entries(e.params)) if (k !== "segments" && p) m.addRow({ el: e.name, p: paramLabel(k), v: p.value, u: UNIT[k] ?? "", s: SRC[p.source] ?? p.source, c: p.confidence ?? null, w: p.where ?? p.note ?? "" });
  }
  m.addRow({});
  const st = doc.settings;
  for (const [k, val] of [["Armatur çubuğunun standart uzunluğu, m", st.stockLength], ["Üst-üstə düşmə, d", st.lapD], ["Ankerləmə, d", st.anchorD], ["Xamut qarmaqları, d", st.hookD], ["Beton örtüyü, m", st.cover], ["Beton ehtiyatı, %", st.concreteReservePct], ["Armatur kəsim itkisi, %", st.rebarCutPct], ["Dikt vərəqi, m", `${st.plywood.w} × ${st.plywood.h}`], ["Dikt qalınlığı, mm", st.plywood.thicknessMm ?? "seçilməyib"], ["Qəlibin istifadə sayı", st.formworkUses], ["Taxtanın uzunluğu, m", st.boardLength]] as [string, unknown][]) {
    m.addRow({ el: "Parametrlər", p: k, v: val as string | number });
  }
  for (const [k, val] of Object.entries(doc.norms ?? {})) m.addRow({ el: "Normalar (istifadəçi)", p: k, v: val as number });
  for (const [k, o] of Object.entries(doc.overrides ?? {})) m.addRow({ el: "İstifadəçi düzəlişi", p: r.items.find((i) => i.key === k)?.name ?? k, v: o.qty, w: o.reason ?? "" });
  for (const i of r.items.filter((x) => x.assumptions.length)) m.addRow({ el: "Fərziyyə", p: i.name, w: i.assumptions.join(" ") });
  font(m, mh);

  /* 7. Dəqiqləşdirilməli məsələlər */
  const { ws: q, headerRow: qh } = sheet(wb, "Dəqiqləşdirilməli məsələlər", [{ header: "Məsələ", key: "t", width: 80 }, { header: "Niyə vacibdir", key: "w", width: 50 }, { header: "Status", key: "s", width: 26 }], title);
  for (const x of questions) q.addRow({ t: x.text, w: x.why, s: "Cavab gözləyir" });
  for (const i of r.items.filter((x) => x.status === "missing" || x.status === "engineer")) q.addRow({ t: i.name, w: i.formula.split("\n")[0], s: STATUS_LABEL[i.status] });
  if (q.rowCount === qh) q.addRow({ t: "Açıq məsələ yoxdur." });
  q.getColumn("t").alignment = { wrapText: true, vertical: "top" };
  font(q, qh);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
