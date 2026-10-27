import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { completeActivity } from '../services/completion.service';
import { runMutation, withUserLock } from '../services/user-mutation.service';
import { getRequestTimezone } from '../services/planned-activity-metrics.service';
import { HttpError, sendError } from '../utils/http-error';
import { isRecord, positiveInteger, textField, validActivityType } from '../utils/validation';
import { localizeActivities } from '../services/content-translation.service';
import { getRequestLocale } from '../utils/locale';

const translationInclude = (locale: string) => ({
  translations: {
    where: { locale: { in: [locale, 'en'] } },
  },
});

export const createActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isRecord(req.body)) throw new HttpError(400, 'Activity payload must be an object');
    const { type, duration } = req.body;
    const title = textField(req.body.title, 'Title', 200, true)!;
    const description = textField(req.body.description, 'Description', 5000);
    if (!validActivityType(type)) throw new HttpError(400, 'Invalid activity type');
    if (duration != null && (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 1 || duration > 1440)) {
      throw new HttpError(400, 'Duration must be between 1 and 1440 minutes');
    }
    const result = await runMutation(req, (tx) => completeActivity(tx, {
      userId: req.user.id, locale: getRequestLocale(req), timezone: getRequestTimezone(req),
      type, title, description, duration,
    }));
    res.status(201).json(result);
  } catch (error) { sendError(res, error); }
};

// GET /api/activities
export const getActivities = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user.id;
    const locale = getRequestLocale(req);
    const page = positiveInteger(req.query.page, 1, 1000000);
    const limit = positiveInteger(req.query.limit, 20, 100);
    const skip = (page - 1) * limit;

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where: { userId, hiddenAt: null },
        include: translationInclude(locale),
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.activity.count({ where: { userId, hiddenAt: null } }),
    ]);

    res.json({
      activities: await localizeActivities(activities, locale),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    sendError(res, error);
  }
};

// GET /api/activities/:id
export const getActivityById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const locale = getRequestLocale(req);
    const activity = await prisma.activity.findFirst({
      where: { id: req.params.id, userId: req.user.id, hiddenAt: null },
      include: translationInclude(locale),
    });

    if (!activity) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    const [localizedActivity] = await localizeActivities([activity], locale);
    res.json({ activity: localizedActivity });
  } catch (error) {
    sendError(res, error);
  }
};

// DELETE /api/activities/:id
export const deleteActivity = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    await withUserLock(req.user.id, async (tx) => {
      const activity = await tx.activity.findFirst({ where: { id: req.params.id, userId: req.user.id } });
      if (!activity) throw new HttpError(404, 'Activity not found', 'NOT_FOUND');
      await tx.activity.update({ where: { id: activity.id }, data: { hiddenAt: new Date() } });
    }, req.user.sessionVersion);
    res.json({ message: 'Activity deleted' });
  } catch (error) {
    sendError(res, error);
  }
};
