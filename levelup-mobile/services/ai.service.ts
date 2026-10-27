import api from './api';
import { SuggestedActivity } from '../types';

export type AiMessage = {
  role: 'user' | 'assistant';
  content: string;
  suggestedActivities?: SuggestedActivity[];
};

export const aiService = {
  chat: async (messages: AiMessage[], timezone?: string) => {
    const { data } = await api.post('/ai/chat', { messages: messages.slice(-12).map(({ role, content }) => ({ role, content })), timezone }, { timeout: 30000 });
    return data.message as AiMessage;
  },
};
