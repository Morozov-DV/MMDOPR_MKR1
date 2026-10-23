// Контролери заявок: приймають HTTP-запит, викликають сервіс, формують відповідь.
import { asyncHandler } from "../middleware/errorHandler";
import * as service from "../services/ticketService";

export const list = asyncHandler(async (_req, res) => {
  res.status(200).json(await service.getTickets());
});
export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.createTicket(req.body));
});
export const update = asyncHandler(async (req, res) => {
  res.status(200).json(await service.updateTicket(String(req.params.id), req.body));
});
export const remove = asyncHandler(async (req, res) => {
  await service.deleteTicket(String(req.params.id));
  res.status(200).json({ deleted: true, id: req.params.id });
});
