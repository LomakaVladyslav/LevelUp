import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { HttpError, sendError } from '../utils/http-error';
import { isRecord, textField, validActivityType, dateOnly } from '../utils/validation';
import { runMutation, withUserLock } from '../services/user-mutation.service';

export const createGoal = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isRecord(req.body)) throw new HttpError(400, 'Goal payload must be an object');
    const title = textField(req.body.title, 'Title', 200, true)!;
    const { targetCount, type } = req.body;
    if (typeof targetCount !== 'number' || !Number.isInteger(targetCount) || targetCount < 1 || targetCount > 1000000 || !validActivityType(type)) throw new HttpError(400, 'Invalid goal target or type');
    const deadline = dateOnly(req.body.deadline);
    if (deadline === undefined) throw new HttpError(400, 'Invalid deadline');
    if (deadline) deadline.setUTCHours(23, 59, 59, 999);
    res.status(201).json(await runMutation(req, async (tx) => ({
      goal: await tx.goal.create({ data: { userId: req.user.id, title, targetCount, type, deadline } }),
    })));
  } catch (error) { sendError(res, error); }
};

export const getGoals = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json({ goals: await prisma.goal.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } }) });
  } catch (error) { sendError(res, error); }
};

export const updateGoal = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isRecord(req.body)) throw new HttpError(400, 'Invalid goal update');
    res.json(await runMutation(req, async (tx) => {
      const goal = await tx.goal.findFirst({ where: { id: req.params.id, userId: req.user.id } });
      if (!goal) throw new HttpError(404, 'Goal not found');
      let currentCount = req.body.currentCount ?? goal.currentCount;
      if (typeof currentCount !== 'number' || !Number.isInteger(currentCount) || currentCount < 0 || currentCount > goal.targetCount ||
        (req.body.isCompleted !== undefined && typeof req.body.isCompleted !== 'boolean')) throw new HttpError(400, 'Invalid goal progress');
      if (req.body.isCompleted === true) currentCount = goal.targetCount;
      if (req.body.isCompleted === false && currentCount >= goal.targetCount) throw new HttpError(400, 'Reduce progress to reopen this goal');
      return { goal: await tx.goal.update({ where: { id: goal.id }, data: { currentCount, isCompleted: currentCount >= goal.targetCount } }) };
    }));
  } catch (error) { sendError(res, error); }
};

export const deleteGoal = async (req: Request, res: Response): Promise<void> => {
  try {
    await withUserLock(req.user.id, (tx) => tx.goal.deleteMany({ where: { id: req.params.id, userId: req.user.id } }), req.user.sessionVersion);
    res.json({ message: 'Goal deleted' });
  } catch (error) { sendError(res, error); }
};
