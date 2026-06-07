import api from './api';
import { StatsOverview } from '../types';

export const statsService = {
  getOverview: async () => {
    const { data } = await api.get('/stats/overview');
    return data as StatsOverview;
  },

  getWeekly: async () => {
    const { data } = await api.get('/stats/weekly');
    return data.chartData as { date: string; count: number; xpEarned: number }[];
  },

  getXpHistory: async () => {
    const { data } = await api.get('/stats/xp-history');
    return data.chartData as { date: string; xp: number }[];
  },
};
