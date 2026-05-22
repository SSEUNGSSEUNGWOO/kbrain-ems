import { useRegisterActions } from 'kbar';
import { useThemeConfig } from '@/components/themes/active-theme';
import { THEMES } from '@/components/themes/theme.config';

const useThemeSwitching = () => {
  const { activeTheme, setActiveTheme } = useThemeConfig();

  const cycleTheme = () => {
    const currentIndex = THEMES.findIndex((t) => t.value === activeTheme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    setActiveTheme(THEMES[nextIndex].value);
  };

  const themeActions = [
    {
      id: 'cycleTheme',
      name: 'Switch Theme',
      shortcut: ['t', 't'],
      section: 'Theme',
      perform: cycleTheme
    }
  ];

  useRegisterActions(themeActions, [activeTheme]);
};

export default useThemeSwitching;
