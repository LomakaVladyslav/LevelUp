import { invalidateData, useDataRevision } from '../stores/data.store';
import { apiContext, getDeviceTimezone } from './api-context';
import api from './api';
import { mutate } from './mutation';
import {
  ActivityResult,
  PlannedActivity,
  PlannedActivityInput,
  PlannedActivityUpdateInput,
  TodayProgress,
} from '../types';

type TaskList = { plannedActivities: PlannedActivity[]; todayProgress: TodayProgress };
const reads = new Map<string, Promise<TaskList>>();

export const plannedActivityService = {
  getAll: (includeDisabled = false): Promise<TaskList> => {
    const context = apiContext.get();
    const key = `${context.sessionVersion}:${context.language}:${getDeviceTimezone()}:${useDataRevision.getState().revision}:${includeDisabled}`;
    const existing = reads.get(key);
    if (existing) return existing;
    // Home and reminder reconciliation share only in-flight reads. A write,
    // account/language change or later refresh always gets a fresh response.
    const request = api.get('/planned-activities', { params: { includeDisabled } })
      .then(({ data }) => data as TaskList).finally(() => { reads.delete(key); });
    reads.set(key, request);
    return request;
  },

  create: async (input: PlannedActivityInput) => {
    const data = await mutate('post', '/planned-activities', input);
    return data as { plannedActivity: PlannedActivity };
  },

  bulkCreate: async (activities: PlannedActivityInput[]) => {
    const data = await mutate('post', '/planned-activities/bulk', { activities });
    return data as { plannedActivities: PlannedActivity[] };
  },

  update: async (id: string, input: PlannedActivityUpdateInput) => {
    const data = await mutate('patch', `/planned-activities/${id}`, input);
    return data as { plannedActivity: PlannedActivity };
  },

  complete: async (id: string, completionDate?: string, updatedAt?: string) => {
    const data = await mutate('post', `/planned-activities/${id}/complete`, { ...(completionDate ? { completionDate } : {}), ...(updatedAt ? { updatedAt } : {}) });
    return data as ActivityResult;
  },

  delete: async (id: string) => {
    await api.delete(`/planned-activities/${id}`);
    invalidateData();
  },
};
