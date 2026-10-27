import 'dotenv/config';
import express, { ErrorRequestHandler } from 'express';
import prisma from './utils/prisma';
import cors from 'cors';

import authRoutes from './routes/auth.routes';
import activityRoutes from './routes/activity.routes';
import achievementRoutes from './routes/achievement.routes';
import statsRoutes from './routes/stats.routes';
import goalRoutes from './routes/goal.routes';
import aiRoutes from './routes/ai.routes';
import plannedActivityRoutes from './routes/planned-activity.routes';
import recommendationRoutes from './routes/recommendation.routes';
import { authenticate } from './middleware/auth.middleware';
import { getAvatar, getLegacyAvatar } from './controllers/avatar.controller';
import { requestMetrics } from './middleware/request-metrics.middleware';

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
const PORT = process.env.PORT || 3000;
const PASSWORD_RESET_APP_URL_BASE =
  process.env.PASSWORD_RESET_APP_URL_BASE || 'levelup://auth/reset-password';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const createPasswordResetAppUrl = (token: string): string => {
  const separator = PASSWORD_RESET_APP_URL_BASE.includes('?') ? '&' : '?';
  return `${PASSWORD_RESET_APP_URL_BASE}${separator}token=${encodeURIComponent(token)}`;
};

// Middleware — runs on every request
app.use(cors());                    // Allow requests from the mobile app
app.use(express.json({ limit: '64kb' }));            // Parse JSON request bodies
app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
app.get('/uploads/avatars/:filename', authenticate, getLegacyAvatar);
app.use(requestMetrics);

// Health check — useful for deployment monitoring
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch { res.status(503).json({ status: 'unavailable' }); }
});

app.get('/api/avatars/:id', authenticate, getAvatar);

app.get('/reset-password', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (!token) {
    res.status(400).type('html').send(
      '<!doctype html><html><head><title>Invalid reset link</title></head><body><h1>Invalid reset link</h1><p>Request a new password reset email from LevelUp.</p></body></html>',
    );
    return;
  }

  const appUrl = createPasswordResetAppUrl(token);
  const escapedAppUrl = escapeHtml(appUrl);
  const jsAppUrl = JSON.stringify(appUrl);

  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Open LevelUp</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f4ff; color: #211b3d; }
      main { width: min(420px, calc(100% - 32px)); padding: 28px; border-radius: 16px; background: #fff; box-shadow: 0 12px 40px rgba(42, 31, 92, 0.16); text-align: center; }
      h1 { margin: 0 0 10px; font-size: 24px; }
      p { margin: 0 0 20px; color: #5f5875; line-height: 1.5; }
      a { display: inline-block; border-radius: 12px; background: #6c47ff; color: #fff; padding: 14px 18px; font-weight: 700; text-decoration: none; }
    </style>
    <script>
      window.addEventListener('DOMContentLoaded', function () {
        window.location.href = ${jsAppUrl};
      });
    </script>
  </head>
  <body>
    <main>
      <h1>Open LevelUp</h1>
      <p>If the app does not open automatically, tap the button below.</p>
      <a href="${escapedAppUrl}">Open LevelUp</a>
    </main>
  </body>
</html>`);
});

// Mount all route groups
app.use('/api/auth', authRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/planned-activities', plannedActivityRoutes);
app.use('/api/recommendations', recommendationRoutes);

// 404 handler — catches any unknown routes
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
  res.status(status).json({ error: status === 500 ? 'Internal server error' : 'Invalid request body' });
};
app.use(errorHandler);

if (require.main === module) {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Configure DATABASE_URL and JWT_SECRET (at least 32 characters) before starting.');
  }
  const server = app.listen(PORT, () => {
    console.log(`LevelUp backend running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
    server.close(() => { void prisma.$disconnect().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 15000).unref();
  });
}

export default app;
