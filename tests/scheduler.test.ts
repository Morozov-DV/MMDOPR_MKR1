// Перевірка алгоритму на початкових і граничних даних.
// Запуск: npm test  (використовує вбудований test runner Node.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { assignHeuristic, buildPlan, evaluatePlan, sortTickets } from "../src/algorithms/taskScheduler";
import type { Employee, Ticket } from "../src/types";

// --- Початкові (демонстраційні) дані з умови завдання ---
const employees: Employee[] = [
  { id: "E1", name: "Олена", competence: 5, availableHours: 8 },
  { id: "E2", name: "Андрій", competence: 4, availableHours: 7 },
  { id: "E3", name: "Максим", competence: 3, availableHours: 8 },
  { id: "E4", name: "Ірина", competence: 5, availableHours: 6 },
];
const t = (id: string, priority: number, effort: number, minCompetence: number): Ticket => ({
  id, title: `Заявка ${id}`, priority, effort, minCompetence, status: "new",
});
const tickets: Ticket[] = [
  t("T1", 5, 3, 3), t("T2", 4, 4, 4), t("T3", 4, 5, 4), t("T4", 2, 3, 2),
  t("T5", 3, 2, 3), t("T6", 5, 2, 4), t("T7", 1, 2, 1), t("T8", 3, 4, 3),
];

test("сортування: пріоритет ↓, трудомісткість ↓", () => {
  assert.deepEqual(sortTickets(tickets).map((x) => x.id),
    ["T1", "T6", "T3", "T2", "T8", "T5", "T4", "T7"]);
});

test("початкові дані: усі 8 заявок розподілено за очікуваним планом", () => {
  const pairs = assignHeuristic(tickets, employees);
  const map = Object.fromEntries(pairs.map((p) => [p.ticketId, p.employeeId]));
  assert.deepEqual(map, { T1: "E1", T6: "E2", T3: "E4", T2: "E2", T8: "E3", T5: "E1", T4: "E3", T7: "E1" });

  const plan = buildPlan(tickets, employees);
  assert.equal(plan.violations.length, 0);
  assert.equal(plan.metrics.assignedCount, 8);
  assert.equal(plan.metrics.unassignedCount, 0);
  assert.equal(plan.metrics.assignedEffort, 25);
  const load = Object.fromEntries(plan.employeeLoads.map((l) => [l.employeeId, l.usedHours]));
  assert.deepEqual(load, { E1: 7, E2: 6, E3: 7, E4: 5 });
});

test("немає подвійного призначення, обмеження не порушено", () => {
  const plan = buildPlan(tickets, employees);
  const ids = plan.assignments.map((a) => a.ticketId);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(plan.assignments.every((a) => a.constraintsOk));
  assert.ok(plan.employeeLoads.every((l) => l.usedHours <= l.availableHours));
});

test("гранична: порожній список заявок", () => {
  const plan = buildPlan([], employees);
  assert.equal(plan.metrics.totalTickets, 0);
  assert.equal(plan.assignments.length, 0);
});

test("гранична: порожній список виконавців — усі заявки нерозподілені", () => {
  const plan = buildPlan(tickets, []);
  assert.equal(plan.unassigned.length, tickets.length);
  assert.equal(plan.metrics.loadStdDev, 0);
});

test("гранична: недостатня компетентність → нерозподілена з причиною", () => {
  const plan = buildPlan([t("X1", 5, 1, 5)], [employees[2]]); // Максим має 3 < 5
  assert.equal(plan.unassigned.length, 1);
  assert.match(plan.unassigned[0].reason, /компетентністю/);
});

test("гранична: заявка рівно на весь доступний час — призначається", () => {
  const plan = buildPlan([t("X1", 3, 8, 1)], [employees[0]]);
  assert.equal(plan.assignments.length, 1);
  assert.equal(plan.employeeLoads[0].loadPercent, 100);
});

test("гранична: заявка на 0.1 год більша за час — нерозподілена", () => {
  const plan = buildPlan([t("X1", 3, 8.1, 1)], [employees[0]]);
  assert.equal(plan.unassigned.length, 1);
  assert.match(plan.unassigned[0].reason, /вільного часу/);
});

test("ручна перевірка: порушення компетентності й часу виявляються", () => {
  // T3 (мін. 4) → Максим (3): порушення компетентності; плюс 5 год + ... у межах 8
  const bad = evaluatePlan(tickets, employees, [{ ticketId: "T3", employeeId: "E3" }]);
  assert.equal(bad.violations.length, 1);
  assert.match(bad.violations[0], /компетентність/);

  // T3 (5 год) + T2 (4 год) на Ірині (6 год) → перевищення часу
  const over = evaluatePlan(tickets, employees, [
    { ticketId: "T3", employeeId: "E4" }, { ticketId: "T2", employeeId: "E4" },
  ]);
  assert.ok(over.violations.some((v) => /перевищено/.test(v)));
});

test("ручна перевірка: подвійне призначення заявки виявляється", () => {
  const dbl = evaluatePlan(tickets, employees, [
    { ticketId: "T1", employeeId: "E1" }, { ticketId: "T1", employeeId: "E2" },
  ]);
  assert.ok(dbl.violations.some((v) => /більш ніж одному/.test(v)));
});
