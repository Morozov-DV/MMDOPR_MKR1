// Сховище на JSON-файлах (node:fs/promises) замість бази даних.
import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "../middleware/errorHandler";
import type { Employee, SavedPlan, Ticket } from "../types";

/**
 * Клієнт НЕ може вказати шлях до файлу: доступні лише ці три імені,
 * а повний шлях будується на сервері (захист від path traversal).
 */
export type DataFile = "tickets" | "employees" | "planning-history";

/** Каталог data/ (працює і для src/, і для скомпільованого dist/). */
const DATA_DIR = path.resolve(__dirname, "../../data");

/** Початкові дані — використовуються, якщо файл відсутній або пошкоджений. */
const DEFAULTS: { tickets: Ticket[]; employees: Employee[]; "planning-history": SavedPlan[] } = {
  tickets: [
    { id: "T1", title: "Помилка авторизації", priority: 5, effort: 3, minCompetence: 3, status: "new" },
    { id: "T2", title: "Налаштування резервного копіювання", priority: 4, effort: 4, minCompetence: 4, status: "new" },
    { id: "T3", title: "Оновлення вебсервера", priority: 4, effort: 5, minCompetence: 4, status: "new" },
    { id: "T4", title: "Налаштування робочих станцій", priority: 2, effort: 3, minCompetence: 2, status: "new" },
    { id: "T5", title: "Аналіз журналів помилок", priority: 3, effort: 2, minCompetence: 3, status: "new" },
    { id: "T6", title: "Відновлення доступу до сервісу", priority: 5, effort: 2, minCompetence: 4, status: "new" },
    { id: "T7", title: "Оновлення документації", priority: 1, effort: 2, minCompetence: 1, status: "new" },
    { id: "T8", title: "Перевірка мережевої конфігурації", priority: 3, effort: 4, minCompetence: 3, status: "new" },
  ],
  employees: [
    { id: "E1", name: "Олена", competence: 5, availableHours: 8 },
    { id: "E2", name: "Андрій", competence: 4, availableHours: 7 },
    { id: "E3", name: "Максим", competence: 3, availableHours: 8 },
    { id: "E4", name: "Ірина", competence: 5, availableHours: 6 },
  ],
  "planning-history": [],
};

const filePath = (name: DataFile): string => path.join(DATA_DIR, `${name}.json`);

/** Запис «атомарно»: спершу у тимчасовий файл, потім перейменування. */
async function writeAtomic(name: DataFile, data: unknown): Promise<void> {
  const target = filePath(name);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await fs.rename(tmp, target);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    console.error(`Помилка запису файлу ${name}.json:`, err);
    throw new AppError(500, "STORAGE_WRITE_ERROR", "Не вдалося зберегти дані у файл.");
  }
}

/**
 * Читання колекції.
 *  - файл відсутній  → створюємо його з початковими даними;
 *  - JSON пошкоджено → робимо резервну копію *.corrupted-<час>.json і відновлюємо початкові дані;
 *  - інша помилка читання → 500.
 */
export async function readJson<T>(name: DataFile): Promise<T[]> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath(name), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const initial = structuredClone(DEFAULTS[name]) as unknown as T[];
      await writeAtomic(name, initial);
      return initial;
    }
    console.error(`Помилка читання файлу ${name}.json:`, err);
    throw new AppError(500, "STORAGE_READ_ERROR", "Не вдалося прочитати дані з файлу.");
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Очікувався масив");
    return parsed as T[];
  } catch {
    const backup = `${filePath(name).replace(/\.json$/, "")}.corrupted-${Date.now()}.json`;
    console.warn(`Файл ${name}.json пошкоджено. Копію збережено: ${backup}. Відновлено початкові дані.`);
    await fs.writeFile(backup, raw, "utf-8").catch(() => undefined);
    const initial = structuredClone(DEFAULTS[name]) as unknown as T[];
    await writeAtomic(name, initial);
    return initial;
  }
}

/**
 * Черга операцій: усі «прочитати → змінити → записати» виконуються по одній,
 * тому паралельні запити не затирають зміни один одного.
 */
let queue: Promise<unknown> = Promise.resolve();

/** Безпечне оновлення колекції: updater отримує поточні дані й повертає нові. */
export function updateJson<T>(name: DataFile, updater: (items: T[]) => T[] | Promise<T[]>): Promise<T[]> {
  const run = queue.then(async () => {
    const next = await updater(await readJson<T>(name));
    await writeAtomic(name, next);
    return next;
  });
  queue = run.catch(() => undefined); // помилка однієї операції не блокує чергу
  return run;
}
