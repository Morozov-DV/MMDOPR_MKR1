// Сервіс планування: формування, ручне коригування, збереження й історія планів.
import { randomUUID } from "node:crypto";
import { buildPlan, evaluatePlan } from "../algorithms/taskScheduler";
import { badRequest, notFound } from "../middleware/errorHandler";
import { readJson, updateJson } from "../storage/jsonStorage";
import type { AssignmentPair, Employee, Plan, SavedPlan, Ticket } from "../types";
import { getEmployees, validateEmployeeInput } from "./employeeService";
import { getTickets, validateTicketInput } from "./ticketService";

/** Дані для планування: заявки (без виконаних) і виконавці. */
interface PlanningInput {
  tickets: Ticket[];
  employees: Employee[];
}

/**
 * Визначає вхідні дані: якщо клієнт передав tickets/employees — перевіряємо їх,
 * інакше беремо з JSON-сховища. Заявки зі статусом «done» не плануються.
 */
async function resolveInput(body: unknown): Promise<PlanningInput> {
  const b = (body ?? {}) as Record<string, unknown>;

  let tickets: Ticket[];
  if (b.tickets !== undefined) {
    if (!Array.isArray(b.tickets)) throw badRequest("tickets має бути масивом.");
    tickets = b.tickets.map((raw, i) => {
      const id = (raw as { id?: unknown })?.id;
      if (typeof id !== "string" || id.length === 0) throw badRequest(`tickets[${i}]: потрібен рядковий id.`);
      return { id, ...validateTicketInput(raw) };
    });
  } else {
    tickets = await getTickets();
  }

  let employees: Employee[];
  if (b.employees !== undefined) {
    if (!Array.isArray(b.employees)) throw badRequest("employees має бути масивом.");
    employees = b.employees.map((raw, i) => {
      const id = (raw as { id?: unknown })?.id;
      if (typeof id !== "string" || id.length === 0) throw badRequest(`employees[${i}]: потрібен рядковий id.`);
      return { id, ...validateEmployeeInput(raw) };
    });
  } else {
    employees = await getEmployees();
  }

  // Унікальність id у вхідних масивах
  if (new Set(tickets.map((t) => t.id)).size !== tickets.length) throw badRequest("Знайдено дублікати id заявок.");
  if (new Set(employees.map((e) => e.id)).size !== employees.length) throw badRequest("Знайдено дублікати id виконавців.");

  return { tickets: tickets.filter((t) => t.status !== "done"), employees };
}

/** Перевірка масиву пар «заявка → виконавець», що надійшов від клієнта. */
function parsePairs(raw: unknown): AssignmentPair[] {
  if (!Array.isArray(raw)) throw badRequest("assignments має бути масивом.");
  return raw.map((p, i) => {
    const { ticketId, employeeId } = (p ?? {}) as Record<string, unknown>;
    if (typeof ticketId !== "string" || typeof employeeId !== "string")
      throw badRequest(`assignments[${i}]: потрібні рядкові ticketId та employeeId.`);
    return { ticketId, employeeId };
  });
}

/** Формування плану евристичним алгоритмом (план ще не зберігається). */
export async function generatePlan(body: unknown): Promise<Plan> {
  const { tickets, employees } = await resolveInput(body);
  return buildPlan(tickets, employees);
}

/**
 * Ручне коригування: призначити заявку виконавцю (employeeId) або зняти призначення (null).
 * Сервер ПОВТОРНО перевіряє компетентність, доступний час і відсутність дублів.
 */
export async function assignManually(body: unknown): Promise<Plan> {
  const b = (body ?? {}) as Record<string, unknown>;
  const { tickets, employees } = await resolveInput(body);
  const pairs = parsePairs(b.assignments ?? []);

  if (typeof b.ticketId !== "string") throw badRequest("ticketId обов'язковий.");
  if (b.employeeId !== null && typeof b.employeeId !== "string")
    throw badRequest("employeeId має бути рядком або null (зняти призначення).");

  if (!tickets.some((t) => t.id === b.ticketId))
    throw notFound(`Заявку ${b.ticketId} не знайдено серед заявок для планування.`);
  if (b.employeeId !== null && !employees.some((e) => e.id === b.employeeId))
    throw notFound(`Виконавця ${b.employeeId} не знайдено.`);

  // Замінюємо призначення цієї заявки; інші лишаються як були
  const next = pairs.filter((p) => p.ticketId !== b.ticketId);
  if (b.employeeId !== null) next.push({ ticketId: b.ticketId, employeeId: b.employeeId as string });

  const plan = evaluatePlan(tickets, employees, next);
  if (plan.violations.length > 0) throw badRequest("Призначення порушує обмеження.", plan.violations);
  return plan;
}

/** Збереження плану в історію (з перевіркою, унікальним id та датою). */
export async function savePlan(body: unknown): Promise<SavedPlan> {
  const b = (body ?? {}) as Record<string, unknown>;
  const { tickets, employees } = await resolveInput(body);
  const plan = evaluatePlan(tickets, employees, parsePairs(b.assignments));
  if (plan.violations.length > 0) throw badRequest("План порушує обмеження, збереження скасовано.", plan.violations);

  const note = typeof b.note === "string" ? b.note.trim().slice(0, 200) : "";
  const saved: SavedPlan = { id: randomUUID(), createdAt: new Date().toISOString(), note, plan };
  await updateJson<SavedPlan>("planning-history", (items) => [...items, saved]);
  return saved;
}

/** Історія планів: найновіші першими. */
export async function getHistory(): Promise<SavedPlan[]> {
  const items = await readJson<SavedPlan>("planning-history");
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
