// Спільні типи даних застосунку.

/** Статус заявки. */
export type TicketStatus = "new" | "in_progress" | "done";

/** Допустимі значення статусу (використовуються при валідації). */
export const TICKET_STATUSES: TicketStatus[] = ["new", "in_progress", "done"];

/** Виконавець. */
export interface Employee {
  id: string;
  name: string;
  competence: number;     // рівень компетентності, 1..5
  availableHours: number; // доступний робочий час, год
}

/** ІТ-заявка. */
export interface Ticket {
  id: string;
  title: string;
  priority: number;       // пріоритет, 1..5 (5 — найвищий)
  effort: number;         // трудомісткість, год
  minCompetence: number;  // мінімальна потрібна компетентність, 1..5
  status: TicketStatus;
}

/** Пара «заявка → виконавець» (вхід для оцінювання плану). */
export interface AssignmentPair {
  ticketId: string;
  employeeId: string;
}

/** Рядок таблиці розподілу: заявка + призначений виконавець. */
export interface PlannedAssignment {
  ticketId: string;
  title: string;
  priority: number;
  effort: number;
  minCompetence: number;
  employeeId: string;
  employeeName: string;
  constraintsOk: boolean; // чи виконані обмеження за компетентністю й часом
  check: string;          // текстовий результат перевірки обмежень
}

/** Нерозподілена заявка з причиною. */
export interface UnassignedTicket {
  ticketId: string;
  title: string;
  priority: number;
  effort: number;
  minCompetence: number;
  reason: string;
}

/** Завантаження виконавця за планом. */
export interface EmployeeLoad {
  employeeId: string;
  name: string;
  competence: number;
  availableHours: number;
  usedHours: number;
  remainingHours: number;
  loadPercent: number; // використана частка часу, %
}

/** Показники ефективності плану. */
export interface PlanMetrics {
  totalTickets: number;    // усього заявок у плануванні
  assignedCount: number;   // розподілено
  unassignedCount: number; // не розподілено
  totalEffort: number;     // сумарна трудомісткість усіх заявок, год
  assignedEffort: number;  // сумарна трудомісткість розподілених, год
  loadStdDev: number;      // стандартне відхилення завантаження, % (менше — рівномірніше)
}

/** Повний план розподілу. */
export interface Plan {
  assignments: PlannedAssignment[];
  unassigned: UnassignedTicket[];
  employeeLoads: EmployeeLoad[];
  metrics: PlanMetrics;
  violations: string[]; // порушені обмеження (для коректного плану — порожньо)
}

/** Збережений в історії план. */
export interface SavedPlan {
  id: string;
  createdAt: string; // ISO-дата формування
  note: string;
  plan: Plan;
}
