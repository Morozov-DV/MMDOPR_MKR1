// Бізнес-логіка роботи із заявками: валідація та CRUD.
import { badRequest, notFound } from "../middleware/errorHandler";
import { readJson, updateJson } from "../storage/jsonStorage";
import { TICKET_STATUSES, type Ticket, type TicketStatus } from "../types";

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/**
 * Перевірка вхідних даних заявки (без id). Повертає очищений об'єкт
 * або кидає 400 зі списком усіх знайдених помилок.
 */
export function validateTicketInput(body: unknown): Omit<Ticket, "id"> {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (title.length === 0 || title.length > 120) errors.push("title: назва обов'язкова, до 120 символів.");
  if (!isInt(b.priority, 1, 5)) errors.push("priority: ціле число від 1 до 5.");
  if (typeof b.effort !== "number" || !Number.isFinite(b.effort) || b.effort <= 0 || b.effort > 100)
    errors.push("effort: число більше 0 і не більше 100 (год).");
  if (!isInt(b.minCompetence, 1, 5)) errors.push("minCompetence: ціле число від 1 до 5.");
  // Статус необов'язковий: за замовчуванням «new»
  const status = (b.status ?? "new") as TicketStatus;
  if (!TICKET_STATUSES.includes(status)) errors.push(`status: одне з [${TICKET_STATUSES.join(", ")}].`);

  if (errors.length > 0) throw badRequest("Некоректні дані заявки.", errors);

  return {
    title,
    priority: b.priority as number,
    effort: b.effort as number,
    minCompetence: b.minCompetence as number,
    status,
  };
}

/** Генерація унікального id вигляду T<n> (максимальний номер + 1). */
function nextId(items: Ticket[]): string {
  const max = items.reduce((m, t) => Math.max(m, Number(t.id.replace(/\D/g, "")) || 0), 0);
  return `T${max + 1}`;
}

export const getTickets = (): Promise<Ticket[]> => readJson<Ticket>("tickets");

export async function createTicket(body: unknown): Promise<Ticket> {
  const data = validateTicketInput(body); // валідуємо ДО зміни колекції
  let created!: Ticket;
  await updateJson<Ticket>("tickets", (items) => {
    created = { id: nextId(items), ...data };
    return [...items, created];
  });
  return created;
}

export async function updateTicket(id: string, body: unknown): Promise<Ticket> {
  const data = validateTicketInput(body);
  let updated: Ticket | undefined;
  await updateJson<Ticket>("tickets", (items) =>
    items.map((t) => (t.id === id ? (updated = { id, ...data }) : t))
  );
  if (!updated) throw notFound(`Заявку ${id} не знайдено.`);
  return updated;
}

export async function deleteTicket(id: string): Promise<void> {
  let found = false;
  await updateJson<Ticket>("tickets", (items) => {
    found = items.some((t) => t.id === id);
    return items.filter((t) => t.id !== id);
  });
  if (!found) throw notFound(`Заявку ${id} не знайдено.`);
}
