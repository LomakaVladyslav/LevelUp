import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AchievementMetrics,
  isAchievementConditionMet,
} from './achievement.service';

const metrics: AchievementMetrics = {
  totalActivities: 72,
  activityCounts: {
    STUDY: 50,
    WORKOUT: 12,
    HABIT: 10,
  },
  streakDays: 14,
  level: 8,
  totalXp: 1200,
};

test('achievement conditions use the collected activity metrics', () => {
  assert.equal(isAchievementConditionMet('study_count:50', metrics), true);
  assert.equal(isAchievementConditionMet('workout_count:50', metrics), false);
  assert.equal(isAchievementConditionMet('activities_count:70', metrics), true);
});

test('achievement conditions support streak and XP thresholds', () => {
  assert.equal(isAchievementConditionMet('streak_days:14', metrics), true);
  assert.equal(isAchievementConditionMet('xp_reached:1000', metrics), true);
  assert.equal(isAchievementConditionMet('level_reached:10', metrics), false);
});

test('unknown or malformed achievement conditions remain locked', () => {
  assert.equal(isAchievementConditionMet('unknown:1', metrics), false);
  assert.equal(isAchievementConditionMet('xp_reached:nope', metrics), false);
});
