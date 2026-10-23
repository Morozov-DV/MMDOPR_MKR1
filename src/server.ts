// Точка входу: запуск HTTP-сервера.
import { createApp } from "./app";

const PORT = Number(process.env.PORT) || 3000;

createApp().listen(PORT, () => {
  console.log(`Сервер запущено: http://localhost:${PORT}`);
});
