import { Request, Response } from 'express';
import { generateRecommendations } from '../services/recommendation.service';

export const getRecommendations = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const recommendations = await generateRecommendations(req.user.id);
    res.json({ recommendations });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
