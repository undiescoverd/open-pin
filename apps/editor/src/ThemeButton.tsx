import { Icon, IconButton } from '@waypost/ui';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemePreference } from './theme';

const LABEL = { system: 'Theme: match the system', light: 'Theme: light', dark: 'Theme: dark' } as const;
const GLYPH = { system: Monitor, light: Sun, dark: Moon } as const;

export function ThemeButton() {
  const [pref, cycle] = useThemePreference();
  return <IconButton label={LABEL[pref]} icon={<Icon icon={GLYPH[pref]} />} onClick={cycle} data-theme-pref={pref} />;
}
