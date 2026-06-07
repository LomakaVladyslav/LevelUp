import api from './api';
import { SuggestedActivity } from '../types';

export type AiMessage = {
  role: 'user' | 'assistant';
  content: string;
  suggestedActivities?: SuggestedActivity[];
};

export const aiService = {
  chat: async (messages: AiMessage[], timezone?: string) => {
    const { data } = await api.post('/ai/chat', { messages, timezone });
    return data.message as AiMessage;
  },
};
