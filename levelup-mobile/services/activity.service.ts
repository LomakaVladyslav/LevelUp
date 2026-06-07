import api from './api';
import { Activity, ActivityResult, ActivityType } from '../types';

export const activityService = {
  create: async (data: {
    type: ActivityType;
    title: string;
    description?: string;
    duration?: number;
  }) => {
    const response = await api.post('/activities', data);
    return response.data as ActivityResult;
  },

  getAll: async (page = 1) => {
    const { data } = await api.get(`/activities?page=${page}&limit=20`);
    return data as {
      activities: Activity[];
      pagination: { total: number; totalPages: number; page: number };
    };
  },

  delete: async (id: string) => {
    await api.delete(`/activities/${id}`);
  },
};
