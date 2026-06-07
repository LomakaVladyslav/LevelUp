import api from './api';
import { Recommendation } from '../types';

export const recommendationService = {
  getAll: async () => {
    const { data } = await api.get('/recommendations');
    return data.recommendations as Recommendation[];
  },
};
