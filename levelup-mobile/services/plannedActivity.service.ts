import api from './api';
import {
  ActivityResult,
  PlannedActivity,
  PlannedActivityInput,
  PlannedActivityUpdateInput,
} from '../types';

export const plannedActivityService = {
  getAll: async () => {
    const { data } = await api.get('/planned-activities');
    return data as { plannedActivities: PlannedActivity[] };
  },

  create: async (input: PlannedActivityInput) => {
    const { data } = await api.post('/planned-activities', input);
    return data as { plannedActivity: PlannedActivity };
  },

  bulkCreate: async (activities: PlannedActivityInput[]) => {
    const { data } = await api.post('/planned-activities/bulk', { activities });
    return data as { plannedActivities: PlannedActivity[] };
  },

  update: async (id: string, input: PlannedActivityUpdateInput) => {
    const { data } = await api.patch(`/planned-activities/${id}`, input);
    return data as { plannedActivity: PlannedActivity };
  },

  complete: async (id: string) => {
    const { data } = await api.post(`/planned-activities/${id}/complete`);
    return data as ActivityResult;
  },

  delete: async (id: string) => {
    await api.delete(`/planned-activities/${id}`);
  },
};
