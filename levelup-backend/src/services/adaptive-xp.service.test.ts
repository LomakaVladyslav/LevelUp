import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateXpBreakdown,
  getProjectedStreak,
  getStreakMultiplier,
  isBalanceBonusEligible,
} from './adaptive-xp.service';

test('streak multiplier follows all configured boundaries', () => {
  assert.equal(getStreakMultiplier(2), 1);
  assert.equal(getStreakMultiplier(3), 1.1);
  assert.equal(getStreakMultiplier(7), 1.2);
  assert.equal(getStreakMultiplier(14), 1.3);
});

test('projected streak advances only on a consecutive calendar day', () => {
  const lastActivityDate = new Date(2026, 5, 5, 9);

  assert.equal(
    getProjectedStreak(6, lastActivityDate, new Date(2026, 5, 5, 18)),
    6,
  );
  assert.equal(
    getProjectedStreak(6, lastActivityDate, new Date(2026, 5, 6, 9)),
    7,
  );
  assert.equal(
    getProjectedStreak(6, lastActivityDate, new Date(2026, 5, 8, 9)),
    1,
  );
});

test('balance bonus requires enough history and a share below 20 percent', () => {
  assert.equal(
    isBalanceBonusEligible('STUDY', {
      STUDY: 0,
      WORKOUT: 2,
      HABIT: 1,
    }),
    false,
  );
  assert.equal(
    isBalanceBonusEligible('STUDY', {
      STUDY: 1,
      WORKOUT: 3,
      HABIT: 2,
    }),
    true,
  );
  assert.equal(
    isBalanceBonusEligible('CUSTOM', {
      STUDY: 0,
      WORKOUT: 4,
      HABIT: 4,
    }),
    false,
  );
});

test('XP bonuses are independently rounded and added to base XP', () => {
  const breakdown = calculateXpBreakdown({
    activityType: 'HABIT',
    baseXp: 20,
    projectedStreak: 7,
    recentCategoryCounts: {
      STUDY: 4,
      WORKOUT: 4,
      HABIT: 0,
    },
    inactiveForMs: null,
  });

  assert.deepEqual(breakdown, {
    baseXp: 20,
    streakDays: 7,
    streakMultiplier: 1.2,
    streakBonus: 4,
    balanceMultiplier: 1.25,
    balanceBonus: 5,
    balanceApplied: true,
    comebackMultiplier: 1,
    comebackBonus: 0,
    comebackApplied: false,
    totalXp: 29,
  });
});

test('comeback bonus applies after 72 hours of inactivity', () => {
  const breakdown = calculateXpBreakdown({
    activityType: 'STUDY',
    baseXp: 50,
    projectedStreak: 1,
    recentCategoryCounts: {},
    inactiveForMs: 72 * 60 * 60 * 1000,
  });

  assert.equal(breakdown.comebackBonus, 25);
  assert.equal(breakdown.totalXp, 75);
});
