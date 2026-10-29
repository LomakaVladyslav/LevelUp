import { invalidateData } from '../stores/data.store';
import api from './api';
import { mutate } from './mutation';
import { Activity, ActivityResult, ActivityType } from '../types';

export const activityService = {
  undo: (id: string) => mutate<{ activityId: string; undone: boolean; totalXp: number; newLevel: number }>('post', `/activities/${id}/undo`),
  create: async (data: {
    type: ActivityType;
    title: string;
    description?: string;
    duration?: number;
  }) => {
    return mutate<ActivityResult>('post', '/activities', data);
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
    invalidateData();
  },
};
