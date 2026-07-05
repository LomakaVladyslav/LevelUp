import { themes } from '../constants/theme';
import { useSettingsStore } from '../stores/settings.store';

export const useTheme = () => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  return themes[themeMode];
};
