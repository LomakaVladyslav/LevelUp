import { AI_FEATURES_ENABLED } from '../services/ai-policy';
import { dateOnly } from '../utils/validation';
import { dateKeyInTimezone, normalizeTimezone } from '../services/planned-activity-metrics.service';
import { Request, Response } from 'express';
import OpenAI from 'openai';
import prisma from '../utils/prisma';
import { getRequestLocale, localeNames } from '../utils/locale';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type SuggestedActivity = {
  title: string;
  description: string | null;
  type: 'STUDY' | 'WORKOUT' | 'HABIT' | 'CUSTOM';
  scheduleType: 'SIMPLE' | 'DAILY' | 'DATE';
  dueDate: string | null;
  dueTimeMinutes: number | null;
};

type StructuredAiReply = {
  content: string;
  suggestedActivities: SuggestedActivity[];
};

const validTypes = ['STUDY', 'WORKOUT', 'HABIT', 'CUSTOM'];
const validScheduleTypes = ['SIMPLE', 'DAILY', 'DATE'];

const isChatMessage = (message: unknown): message is ChatMessage => {
  if (!message || typeof message !== 'object') return false;

  const candidate = message as Partial<ChatMessage>;
  return (
    (candidate.role === 'user' || candidate.role === 'assistant') &&
    typeof candidate.content === 'string' &&
    candidate.content.trim().length > 0
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isDateOnly = (value: string): boolean => !!dateOnly(value);

const normalizeSuggestedActivity = (value: unknown): SuggestedActivity | null => {
  if (!isRecord(value)) return null;

  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!title || title.length > 200) return null;

  const type = typeof value.type === 'string' && validTypes.includes(value.type)
    ? value.type as SuggestedActivity['type']
    : null;
  if (!type) return null;

  const scheduleType = typeof value.scheduleType === 'string' && validScheduleTypes.includes(value.scheduleType)
    ? value.scheduleType as SuggestedActivity['scheduleType']
    : null;
  if (!scheduleType) return null;

  const dueDate = typeof value.dueDate === 'string' && isDateOnly(value.dueDate)
    ? value.dueDate
    : null;
  if (scheduleType === 'DATE' && !dueDate) return null;
  const dueTimeMinutesValue = value.dueTimeMinutes;
  const dueTimeMinutes = typeof dueTimeMinutesValue === 'number' &&
    Number.isInteger(dueTimeMinutesValue) &&
    dueTimeMinutesValue >= 0 &&
    dueTimeMinutesValue <= 1439
    ? dueTimeMinutesValue
    : null;

  return {
    title,
    description: typeof value.description === 'string' && value.description.trim()
      ? value.description.trim()
      : null,
    type,
    scheduleType,
    dueDate: scheduleType === 'DATE' ? dueDate : null,
    dueTimeMinutes,
  };
};

const parseStructuredReply = (content: string): StructuredAiReply => {
  try {
    const parsed = JSON.parse(content);
    if (!isRecord(parsed)) throw new Error('AI response is not an object');

    return {
      content: typeof parsed.content === 'string' && parsed.content.trim()
        ? parsed.content.trim()
        : content,
      suggestedActivities: Array.isArray(parsed.suggestedActivities)
        ? parsed.suggestedActivities
          .map(normalizeSuggestedActivity)
          .filter((activity): activity is SuggestedActivity => Boolean(activity))
          .slice(0, 8)
        : [],
    };
  } catch {
    return { content, suggestedActivities: [] };
  }
};

export const chat = async (req: Request, res: Response): Promise<void> => {
  if (!AI_FEATURES_ENABLED) {
    res.status(503).json({ error: 'AI is disabled in LevelUp v1', errorCode: 'AI_DISABLED' });
    return;
  }
  try {
    const locale = getRequestLocale(req);

    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({
        error: 'AI chat is not configured yet. Add OPENAI_API_KEY on the backend.',
        errorCode: 'AI_NOT_CONFIGURED',
      });
      return;
    }

    const messages = req.body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: 'Messages are required',
        errorCode: 'AI_MESSAGES_REQUIRED',
      });
      return;
    }

    if (messages.length > 100 || messages.some((message) => !isChatMessage(message) || message.content.length > 4000)) {
      res.status(400).json({ error: 'Invalid or oversized messages', errorCode: 'AI_MESSAGES_INVALID' });
      return;
    }
    const cleanedMessages = messages.slice(-12).filter(isChatMessage);
    if (cleanedMessages.length === 0) {
      res.status(400).json({
        error: 'Messages must include role and content',
        errorCode: 'AI_MESSAGES_INVALID',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { username: true, level: true, xp: true, age: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 25000, maxRetries: 0 });
    const transcript = cleanedMessages
      .map((message) => `${message.role}: ${message.content.trim()}`)
      .join('\n');
    const timezone = normalizeTimezone(typeof req.body.timezone === 'string' ? req.body.timezone : 'UTC');
    const today = dateKeyInTimezone(new Date(), timezone);

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      input: [
        {
          role: 'developer',
          content:
            [
              'You are LevelUp AI, a concise productivity and planning coach inside a gamified task app.',
              `Reply in ${localeNames[locale]}, matching the selected application language even if the user writes in another language.`,
              `Write all suggested activity titles and descriptions in ${localeNames[locale]}.`,
              'Keep advice practical and focused on today.',
              'When the user asks to plan, schedule, create, add, or break down activities, include suggestedActivities.',
              'Use types STUDY, WORKOUT, HABIT, CUSTOM. Map sport/training to WORKOUT, habits to HABIT, learning/study to STUDY, everything else to CUSTOM.',
              'Use scheduleType SIMPLE for no fixed date, DAILY for recurring daily tasks, DATE when a concrete date is known.',
              'For DATE suggestions, dueDate must be YYYY-MM-DD. For unknown dates, use SIMPLE instead of inventing a date.',
              'dueTimeMinutes is minutes after midnight, or null when no time is discussed.',
            ].join(' '),
        },
        {
          role: 'user',
          content: `User profile: username=${user.username}, level=${user.level}, xp=${user.xp}, age=${user.age ?? 'unknown'}, timezone=${timezone}, today=${today}.\n\nConversation:\n${transcript}\n\nAnswer the latest user message.`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'levelup_ai_reply',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['content', 'suggestedActivities'],
            properties: {
              content: {
                type: 'string',
                description: 'Natural language reply to show in the chat.',
              },
              suggestedActivities: {
                type: 'array',
                description: 'Activity suggestions that the user may confirm and add.',
                maxItems: 8,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'title',
                    'description',
                    'type',
                    'scheduleType',
                    'dueDate',
                    'dueTimeMinutes',
                  ],
                  properties: {
                    title: { type: 'string' },
                    description: { type: ['string', 'null'] },
                    type: { type: 'string', enum: validTypes },
                    scheduleType: { type: 'string', enum: validScheduleTypes },
                    dueDate: {
                      type: ['string', 'null'],
                      description: 'YYYY-MM-DD for DATE tasks; otherwise null.',
                    },
                    dueTimeMinutes: {
                      type: ['integer', 'null'],
                      minimum: 0,
                      maximum: 1439,
                    },
                  },
                },
              },
            },
          },
        },
      },
      max_output_tokens: 2200,
    });

    const content = response.output_text?.trim();

    if (!content || response.status === 'incomplete') {
      res.status(502).json({
        error: 'AI returned an empty response',
        errorCode: 'AI_EMPTY_RESPONSE',
      });
      return;
    }

    const parsedReply = parseStructuredReply(content);
    res.json({
      message: {
        role: 'assistant',
        content: parsedReply.content,
        suggestedActivities: parsedReply.suggestedActivities,
      },
    });
  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({
      error: 'AI chat failed',
      errorCode: 'AI_CHAT_FAILED',
    });
  }
};
