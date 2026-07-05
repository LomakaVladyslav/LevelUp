import { NextFunction, Request, Response } from 'express';

const monitoredRoutes = [
  /^\/api\/planned-activities(?:\/|$)/,
  /^\/api\/activities(?:\/|$)/,
  /^\/api\/stats(?:\/|$)/,
  /^\/api\/recommendations(?:\/|$)/,
];

const isMonitoredRoute = (path: string): boolean =>
  monitoredRoutes.some((route) => route.test(path));

export const requestMetrics = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const metric = {
      type: 'request',
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      monitored: isMonitoredRoute(req.path),
    };

    console.info(JSON.stringify(metric));
  });

  next();
};
