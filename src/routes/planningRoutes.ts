// Маршрути /api/planning
import { Router } from "express";
import * as c from "../controllers/planningController";

const router = Router();
router.post("/generate", c.generate);  // формування плану
router.post("/assign", c.assign);      // ручне призначення заявки
router.post("/save", c.save);          // збереження плану
router.get("/history", c.history);     // історія планування
export default router;
