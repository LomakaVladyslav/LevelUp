import { getRequestTimezone } from '../services/planned-activity-metrics.service';
import { Request, Response } from 'express';
import { generateRecommendations } from '../services/recommendation.service';

export const getRecommendations = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const recommendations = await generateRecommendations(req.user.id, new Date(), getRequestTimezone(req));
    res.json({ recommendations });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
