// Бізнес-логіка роботи з виконавцями: валідація, додавання, редагування.
import { badRequest, notFound } from "../middleware/errorHandler";
import { readJson, updateJson } from "../storage/jsonStorage";
import type { Employee } from "../types";

/** Перевірка вхідних даних виконавця (без id). */
export function validateEmployeeInput(body: unknown): Omit<Employee, "id"> {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (name.length === 0 || name.length > 60) errors.push("name: ім'я обов'язкове, до 60 символів.");
  if (typeof b.competence !== "number" || !Number.isInteger(b.competence) || b.competence < 1 || b.competence > 5)
    errors.push("competence: ціле число від 1 до 5.");
  if (typeof b.availableHours !== "number" || !Number.isFinite(b.availableHours) || b.availableHours <= 0 || b.availableHours > 168)
    errors.push("availableHours: число більше 0 і не більше 168 (год).");

  if (errors.length > 0) throw badRequest("Некоректні дані виконавця.", errors);
  return { name, competence: b.competence as number, availableHours: b.availableHours as number };
}

function nextId(items: Employee[]): string {
  const max = items.reduce((m, e) => Math.max(m, Number(e.id.replace(/\D/g, "")) || 0), 0);
  return `E${max + 1}`;
}

export const getEmployees = (): Promise<Employee[]> => readJson<Employee>("employees");

export async function createEmployee(body: unknown): Promise<Employee> {
  const data = validateEmployeeInput(body);
  let created!: Employee;
  await updateJson<Employee>("employees", (items) => {
    created = { id: nextId(items), ...data };
    return [...items, created];
  });
  return created;
}

export async function updateEmployee(id: string, body: unknown): Promise<Employee> {
  const data = validateEmployeeInput(body);
  let updated: Employee | undefined;
  await updateJson<Employee>("employees", (items) =>
    items.map((e) => (e.id === id ? (updated = { id, ...data }) : e))
  );
  if (!updated) throw notFound(`Виконавця ${id} не знайдено.`);
  return updated;
}
