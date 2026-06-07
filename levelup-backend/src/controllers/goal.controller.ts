import { Request, Response } from 'express';
import prisma from '../utils/prisma';

// POST /api/goals
export const createGoal = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { title, targetCount, type, deadline } = req.body;

    if (!title || !targetCount || !type) {
      res.status(400).json({ error: 'Title, targetCount and type are required' });
      return;
    }

    const goal = await prisma.goal.create({
      data: {
        userId: req.user.id,
        title,
        targetCount: parseInt(targetCount),
        type,
        deadline: deadline ? new Date(deadline) : null,
      },
    });

    res.status(201).json({ goal });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/goals
export const getGoals = async (req: Request, res: Response): Promise<void> => {
  try {
    const goals = await prisma.goal.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ goals });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PUT /api/goals/:id
export const updateGoal = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const goal = await prisma.goal.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    const { currentCount, isCompleted } = req.body;

    const updated = await prisma.goal.update({
      where: { id: req.params.id },
      data: {
        ...(currentCount !== undefined && { currentCount }),
        ...(isCompleted !== undefined && { isCompleted }),
      },
    });

    res.json({ goal: updated });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/goals/:id
export const deleteGoal = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const goal = await prisma.goal.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    await prisma.goal.delete({ where: { id: req.params.id } });
    res.json({ message: 'Goal deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};
