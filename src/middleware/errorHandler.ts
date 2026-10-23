// Єдиний формат помилок + допоміжні засоби для Express.
import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Помилка з HTTP-статусом (400, 404, 500 ...), яку безпечно показати клієнту. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: string[]
  ) {
    super(message);
  }
}

/** Короткі конструктори типових помилок. */
export const badRequest = (message: string, details?: string[]) =>
  new AppError(400, "BAD_REQUEST", message, details);
export const notFound = (message: string) => new AppError(404, "NOT_FOUND", message);

/**
 * Обгортка для async-контролерів: Express 4 сам не ловить відхилені проміси,
 * тому передаємо помилку в next() вручну.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

/** Обробник невідомих маршрутів API → 404 у єдиному форматі. */
export function apiNotFound(req: Request, _res: Response, next: NextFunction): void {
  next(notFound(`Маршрут ${req.method} ${req.originalUrl} не знайдено.`));
}

/**
 * Глобальний обробник помилок. Формат відповіді завжди однаковий:
 * { "error": { "code": "...", "message": "...", "details": [...] } }
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Некоректний JSON у тілі запиту (генерує express.json())
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Тіло запиту містить некоректний JSON." } });
    return;
  }
  // Наші «очікувані» помилки
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }
  // Усе інше — внутрішня помилка; подробиці лише в лог, клієнту — загальний текст
  console.error("Внутрішня помилка:", err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Внутрішня помилка сервера." } });
}
