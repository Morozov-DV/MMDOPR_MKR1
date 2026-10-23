// Контролери виконавців.
import { asyncHandler } from "../middleware/errorHandler";
import * as service from "../services/employeeService";

export const list = asyncHandler(async (_req, res) => {
  res.status(200).json(await service.getEmployees());
});
export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.createEmployee(req.body));
});
export const update = asyncHandler(async (req, res) => {
  res.status(200).json(await service.updateEmployee(String(req.params.id), req.body));
});
