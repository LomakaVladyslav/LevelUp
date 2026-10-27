import { themes } from '../constants/theme';

const luminance = (hex: string) => {
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (text: string, background: string) => {
  const values = [luminance(text), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
test.each(['light', 'dark'] as const)('%s theme keeps normal text and primary actions readable', (mode) => {
  const c = themes[mode].colors;
  for (const background of [c.background, c.surface, c.surfaceSecondary]) {
    for (const foreground of [c.textPrimary, c.textSecondary, c.textMuted, c.primary, c.danger, c.xpText, c.streakFire]) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(contrast(c.textOnPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(c.textOnPrimary, c.success)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(c.successText, c.successSurface)).toBeGreaterThanOrEqual(4.5);
});
