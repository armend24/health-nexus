import { Button } from '@/components/ui/button';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

interface ThemeToggleProps {
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
  className?: string;
}

export function ThemeToggle({
  variant = 'ghost',
  size = 'icon',
  className,
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={
        isDark ? 'Switch to light theme' : 'Switch to dark theme'
      }
    >
      {isDark ? (
        <>
          <SunIcon className="size-4" />
          <span className="sr-only">Switch to light theme</span>
        </>
      ) : (
        <>
          <MoonIcon className="size-4" />
          <span className="sr-only">Switch to dark theme</span>
        </>
      )}
    </Button>
  );
}
