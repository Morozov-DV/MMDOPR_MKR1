// Маршрути /api/tickets
import { Router } from "express";
import * as c from "../controllers/ticketController";

const router = Router();
router.get("/", c.list);          // GET    /api/tickets
router.post("/", c.create);       // POST   /api/tickets
router.put("/:id", c.update);     // PUT    /api/tickets/:id
router.delete("/:id", c.remove);  // DELETE /api/tickets/:id
export default router;
