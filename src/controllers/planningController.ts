// Контролери планування.
import { asyncHandler } from "../middleware/errorHandler";
import * as service from "../services/planningService";

export const generate = asyncHandler(async (req, res) => {
  res.status(200).json(await service.generatePlan(req.body));
});
export const assign = asyncHandler(async (req, res) => {
  res.status(200).json(await service.assignManually(req.body));
});
export const save = asyncHandler(async (req, res) => {
  res.status(201).json(await service.savePlan(req.body));
});
export const history = asyncHandler(async (_req, res) => {
  res.status(200).json(await service.getHistory());
});
