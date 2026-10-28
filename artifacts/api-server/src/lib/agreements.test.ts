import { test } from "node:test";
import assert from "node:assert/strict";
import { agreementTotal, computePlan, monthSlots } from "./agreements";

// The owner's example: a 2-month job for 3 500 AZN.
const plan = [
  { dueDate: "2026-11-01", label: "1-ci ay, əvvəl", amount: "1000", rest: false },
  { dueDate: "2026-11-15", label: "1-ci ay, orta", amount: "500", rest: false },
  { dueDate: "2026-11-30", label: "1-ci ay, son", amount: "1000", rest: false },
  { dueDate: "2026-12-01", label: "2-ci ay, əvvəl", amount: "300", rest: false },
  { dueDate: "2026-12-15", label: "2-ci ay, orta", amount: "400", rest: false },
  { dueDate: "2026-12-31", label: "2-ci ay, son — qalan", amount: null, rest: true },
];

test("rest row takes what is left; nothing unplanned", () => {
  const r = computePlan(350000, plan, 0, "2026-10-28");
  assert.equal(r.rows[5].amountC, 30000); // 3500 − 3200
  assert.equal(r.summary.plannedC, 350000); assert.equal(r.summary.unplannedC, 0); assert.deepEqual(r.summary.issues, []);
  assert.equal(r.summary.next?.dueC, 100000);
});

test("payments cover rows in order; partial, paid, overdue, upcoming", () => {
  const r = computePlan(350000, plan, 170000, "2026-12-02"); // paid 1000 + 500 + 200
  assert.deepEqual(r.rows.map((x) => x.status), ["paid", "paid", "partial", "overdue", "upcoming", "upcoming"]);
  assert.equal(r.rows[2].coveredC, 20000);
  assert.equal(r.summary.remainingC, 180000);
  assert.equal(r.summary.overdueC, 80000 + 30000); // 800 left of the end-of-month-1 row + 300 of month 2 start
  assert.equal(r.summary.next?.dueC, 80000);
});

test("fully paid → everything paid, nothing remaining", () => {
  const r = computePlan(350000, plan, 350000, "2027-01-10");
  assert.ok(r.rows.every((x) => x.status === "paid")); assert.equal(r.summary.remainingC, 0); assert.equal(r.summary.next, null);
});

test("issues: plan above the total, missing amounts, unplanned money, two rest rows", () => {
  const over = computePlan(100000, [{ dueDate: null, label: "a", amount: "1500", rest: false }], 0, "2026-10-28");
  assert.ok(over.summary.issues.some((i) => i.includes("çoxdur")));
  const gap = computePlan(100000, [{ dueDate: null, label: "a", amount: "400", rest: false }], 0, "2026-10-28");
  assert.equal(gap.summary.unplannedC, 60000); assert.ok(gap.summary.issues.some((i) => i.includes("plana düşməyib")));
  const miss = computePlan(100000, [{ dueDate: null, label: "a", amount: null, rest: false }], 0, "2026-10-28");
  assert.ok(miss.summary.issues.some((i) => i.includes("məbləğ yazılmayıb")));
  const two = computePlan(100000, [{ dueDate: null, label: "a", amount: null, rest: true }, { dueDate: null, label: "b", amount: null, rest: true }], 0, "2026-10-28");
  assert.ok(two.summary.issues.some((i) => i.includes("bir sətirdə")));
});

test("time-based total and month slots", () => {
  assert.equal(agreementTotal("monthly", "1500", "2", null), "3000.00");
  assert.equal(agreementTotal("daily", "60", "12.5", "1"), "750.00");
  assert.equal(agreementTotal("contract", "1", "1", "3500.00"), "3500.00");
  const s = monthSlots("2026-11-01", 2, ["start", "mid", "end"]);
  assert.deepEqual(s.map((x) => x.dueDate), ["2026-11-01", "2026-11-15", "2026-11-30", "2026-12-01", "2026-12-15", "2026-12-31"]);
  // Starting late in a month: nothing falls before the start.
  const late = monthSlots("2026-10-28", 2, ["start", "mid", "end"]).map((x) => x.dueDate);
  assert.deepEqual(late, ["2026-10-28", "2026-11-11", "2026-11-27", "2026-11-28", "2026-12-12", "2026-12-27"]);
  assert.ok(late.every((x) => x >= "2026-10-28"));
  assert.equal(monthSlots("2027-01-31", 2, ["start"])[1].dueDate, "2027-02-28");
  assert.equal(s[4].label, "2-ci ay, ayın ortası");
});
