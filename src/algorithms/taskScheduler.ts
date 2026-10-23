// Евристичний алгоритм розподілу заявок між виконавцями.
// Модуль «чистий»: не працює з файлами, HTTP чи Express — лише з даними.
import type {
  AssignmentPair,
  Employee,
  EmployeeLoad,
  Plan,
  PlannedAssignment,
  Ticket,
  UnassignedTicket,
} from "../types";

const EPS = 1e-9; // допуск для порівняння дробових чисел

/** Округлення до 2 знаків (щоб уникнути 0.30000000000000004). */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Порядок розгляду заявок:
 * 1) за спаданням пріоритету;
 * 2) за однакового пріоритету — за спаданням трудомісткості;
 * 3) за однакових обох — за id (стабільний, відтворюваний порядок).
 * Повертає НОВИЙ масив, вхідний не змінюється.
 */
export function sortTickets(tickets: Ticket[]): Ticket[] {
  return [...tickets].sort(
    (a, b) =>
      b.priority - a.priority ||
      b.effort - a.effort ||
      a.id.localeCompare(b.id, "en", { numeric: true })
  );
}

/**
 * Евристичне призначення («жадібний» алгоритм).
 * Для кожної заявки (у порядку sortTickets):
 *  - відбираємо виконавців з достатньою компетентністю і достатнім залишком часу;
 *  - обираємо того, у кого частка використаного часу ПІСЛЯ призначення найменша;
 *  - за рівної частки — виконавця, який стоїть раніше у вхідному списку (стабільне правило);
 *  - якщо кандидатів немає — заявка лишається нерозподіленою.
 * Гарантій глобальної оптимальності немає (жадібний вибір не переглядається).
 */
export function assignHeuristic(tickets: Ticket[], employees: Employee[]): AssignmentPair[] {
  // Скільки годин уже використано кожним виконавцем (за id)
  const used = new Map<string, number>(employees.map((e) => [e.id, 0]));
  const pairs: AssignmentPair[] = [];

  for (const ticket of sortTickets(tickets)) {
    let best: Employee | null = null;
    let bestRatio = Infinity;

    // Порядок обходу = порядок вхідного списку, тому за рівних значень
    // перемагає перший кандидат (строге порівняння «<» з допуском).
    for (const emp of employees) {
      const spent = used.get(emp.id) ?? 0;
      const competent = emp.competence >= ticket.minCompetence;
      const hasTime = spent + ticket.effort <= emp.availableHours + EPS;
      if (!competent || !hasTime) continue;

      // Частка використаного часу після призначення цієї заявки
      const ratio = (spent + ticket.effort) / emp.availableHours;
      if (ratio < bestRatio - EPS) {
        best = emp;
        bestRatio = ratio;
      }
    }

    if (best) {
      used.set(best.id, (used.get(best.id) ?? 0) + ticket.effort);
      pairs.push({ ticketId: ticket.id, employeeId: best.id });
    }
  }
  return pairs;
}

/**
 * Оцінює довільний набір призначень (евристичний або ручний):
 * перевіряє обмеження, рахує завантаження й показники, формує список нерозподілених.
 * Не кидає винятків — порушення повертаються в plan.violations.
 */
export function evaluatePlan(
  tickets: Ticket[],
  employees: Employee[],
  pairs: AssignmentPair[]
): Plan {
  const ticketById = new Map(tickets.map((t) => [t.id, t]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const violations: string[] = [];

  // 1) Мапа «заявка → виконавець» з контролем подвійного призначення
  const assignedTo = new Map<string, string>();
  for (const p of pairs) {
    if (assignedTo.has(p.ticketId)) {
      violations.push(`Заявку ${p.ticketId} призначено більш ніж одному виконавцю.`);
      continue;
    }
    if (!ticketById.has(p.ticketId)) {
      violations.push(`Заявку ${p.ticketId} не знайдено серед заявок для планування.`);
      continue;
    }
    if (!empById.has(p.employeeId)) {
      violations.push(`Виконавця ${p.employeeId} не знайдено.`);
      continue;
    }
    assignedTo.set(p.ticketId, p.employeeId);
  }

  // 2) Використаний час кожного виконавця
  const used = new Map<string, number>(employees.map((e) => [e.id, 0]));
  for (const [ticketId, empId] of assignedTo) {
    used.set(empId, (used.get(empId) ?? 0) + ticketById.get(ticketId)!.effort);
  }

  // 3) Рядки розподілу (у порядку розгляду заявок) з перевіркою обмежень
  const assignments: PlannedAssignment[] = [];
  const unassigned: UnassignedTicket[] = [];

  for (const t of sortTickets(tickets)) {
    const empId = assignedTo.get(t.id);
    if (!empId) {
      unassigned.push({
        ticketId: t.id,
        title: t.title,
        priority: t.priority,
        effort: t.effort,
        minCompetence: t.minCompetence,
        reason: explainUnassigned(t, employees, used),
      });
      continue;
    }

    const emp = empById.get(empId)!;
    const problems: string[] = [];
    if (emp.competence < t.minCompetence) {
      problems.push(`компетентність ${emp.competence} < потрібної ${t.minCompetence}`);
    }
    if (round2(used.get(empId) ?? 0) > emp.availableHours + EPS) {
      problems.push(
        `перевищено доступний час (${round2(used.get(empId) ?? 0)} год із ${emp.availableHours} год)`
      );
    }
    if (problems.length > 0) {
      violations.push(`Заявка ${t.id} → ${emp.name}: ${problems.join("; ")}.`);
    }

    assignments.push({
      ticketId: t.id,
      title: t.title,
      priority: t.priority,
      effort: t.effort,
      minCompetence: t.minCompetence,
      employeeId: emp.id,
      employeeName: emp.name,
      constraintsOk: problems.length === 0,
      check: problems.length === 0 ? "Обмеження виконано" : `Порушення: ${problems.join("; ")}`,
    });
  }

  // 4) Завантаження виконавців
  const employeeLoads: EmployeeLoad[] = employees.map((e) => {
    const usedHours = round2(used.get(e.id) ?? 0);
    return {
      employeeId: e.id,
      name: e.name,
      competence: e.competence,
      availableHours: e.availableHours,
      usedHours,
      remainingHours: round2(e.availableHours - usedHours),
      loadPercent: e.availableHours > 0 ? round2((usedHours / e.availableHours) * 100) : 0,
    };
  });

  // 5) Показники ефективності плану
  const loads = employeeLoads.map((l) => l.loadPercent);
  const mean = loads.length ? loads.reduce((s, x) => s + x, 0) / loads.length : 0;
  const variance = loads.length ? loads.reduce((s, x) => s + (x - mean) ** 2, 0) / loads.length : 0;

  return {
    assignments,
    unassigned,
    employeeLoads,
    metrics: {
      totalTickets: tickets.length,
      assignedCount: assignments.length,
      unassignedCount: unassigned.length,
      totalEffort: round2(tickets.reduce((s, t) => s + t.effort, 0)),
      assignedEffort: round2(assignments.reduce((s, a) => s + a.effort, 0)),
      loadStdDev: round2(Math.sqrt(variance)),
    },
    violations,
  };
}

/** Побудова плану евристикою: призначення + оцінювання. */
export function buildPlan(tickets: Ticket[], employees: Employee[]): Plan {
  return evaluatePlan(tickets, employees, assignHeuristic(tickets, employees));
}

/** Пояснення, чому заявка залишилась нерозподіленою. */
function explainUnassigned(t: Ticket, employees: Employee[], used: Map<string, number>): string {
  const competent = employees.filter((e) => e.competence >= t.minCompetence);
  if (competent.length === 0) {
    return `Немає виконавця з компетентністю не нижче ${t.minCompetence}.`;
  }
  const hasTime = competent.some(
    (e) => (used.get(e.id) ?? 0) + t.effort <= e.availableHours + EPS
  );
  return hasTime
    ? "Заявку не призначено (є вільний виконавець — призначте вручну)."
    : "Недостатньо вільного часу у виконавців із потрібною компетентністю.";
}
