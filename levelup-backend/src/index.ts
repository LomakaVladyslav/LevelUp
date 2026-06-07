import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';

import authRoutes from './routes/auth.routes';
import activityRoutes from './routes/activity.routes';
import achievementRoutes from './routes/achievement.routes';
import statsRoutes from './routes/stats.routes';
import goalRoutes from './routes/goal.routes';
import aiRoutes from './routes/ai.routes';
import plannedActivityRoutes from './routes/planned-activity.routes';
import recommendationRoutes from './routes/recommendation.routes';
import { uploadsRoot } from './utils/avatar';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware — runs on every request
app.use(cors());                    // Allow requests from the mobile app
app.use(express.json());            // Parse JSON request bodies
app.use('/uploads', express.static(path.resolve(uploadsRoot)));

// Health check — useful for deployment monitoring
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

app.listen(PORT, () => {
  console.log(`✅ LevelUp backend running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});

export default app;
