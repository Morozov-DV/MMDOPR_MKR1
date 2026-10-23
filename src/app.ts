// Конфігурація Express-застосунку (без запуску сервера — зручно для тестування).
import express from "express";
import path from "node:path";
import { apiNotFound, errorHandler } from "./middleware/errorHandler";
import employeeRoutes from "./routes/employeeRoutes";
import planningRoutes from "./routes/planningRoutes";
import ticketRoutes from "./routes/ticketRoutes";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "100kb" })); // розбір JSON-тіла запитів

  // API
  app.use("/api/tickets", ticketRoutes);
  app.use("/api/employees", employeeRoutes);
  app.use("/api/planning", planningRoutes);
  app.use("/api", apiNotFound); // невідомі /api/... → 404 у форматі JSON

  // Клієнтська частина (статичні файли з public/)
  app.use(express.static(path.resolve(__dirname, "../public")));

  app.use(errorHandler); // завжди останнім
  return app;
}
