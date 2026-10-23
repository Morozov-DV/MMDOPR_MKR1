// Маршрути /api/employees
import { Router } from "express";
import * as c from "../controllers/employeeController";

const router = Router();
router.get("/", c.list);        // GET  /api/employees
router.post("/", c.create);     // POST /api/employees
router.put("/:id", c.update);   // PUT  /api/employees/:id
export default router;
