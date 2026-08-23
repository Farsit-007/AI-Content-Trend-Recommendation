import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sparkles, Sun } from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/context/theme-context';
import { getDashboardPaths } from '@/routes';
import { sidebarItemsGenerator } from '@/utils/sidebarItemsGenerator';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';

/** Lets a visible affordance (the topbar button) open the palette without prop-drilling state. */
export const OPEN_COMMAND_PALETTE_EVENT = 'growth-studio:open-command-palette';

/**
 * The ⌘K / Ctrl+K palette. Its navigation entries come from the same role-based path config the
 * sidebar and router are generated from, so a new page shows up here automatically — nothing to
 * register twice.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const navItems = useMemo(() => sidebarItemsGenerator(getDashboardPaths(user?.role)), [user?.role]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      // Beat the browser's own ⌘K (address-bar search) to the shortcut.
      event.preventDefault();
      setOpen((previous) => !previous);
    };
    const onOpenRequest = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    };
  }, []);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Jump to a page or run a quick action"
    >
      <CommandInput placeholder="Jump to a page, or type an action…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        <CommandGroup heading="Go to">
          {navItems.map((item) => (
            <CommandItem
              key={item.key}
              value={item.label}
              onSelect={() => run(() => navigate(item.to))}
            >
              {item.icon && <item.icon />}
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem
            value="Generate content new draft"
            onSelect={() => run(() => navigate('/dashboard/generate'))}
          >
            <Sparkles />
            Generate content
          </CommandItem>
          <CommandItem
            value={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onSelect={() => run(toggleTheme)}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
            {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            <CommandShortcut>theme</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
