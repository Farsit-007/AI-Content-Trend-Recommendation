import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/context/theme-context';

// Follows the app's class-based theme (defaults to dark).
function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
