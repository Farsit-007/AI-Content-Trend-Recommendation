import type { TSidebarItem, TUserPath } from '@/types';

/** Base path all dashboard routes live under. */
export const DASHBOARD_BASE = '/dashboard';

/** Turn a role's path config into sidebar items with resolved `to` links. */
export const sidebarItemsGenerator = (
  items: TUserPath[],
  base: string = DASHBOARD_BASE,
): TSidebarItem[] => {
  return items.reduce((acc: TSidebarItem[], item) => {
    if (!item.name) return acc; // routes without a name have no sidebar entry

    acc.push({
      key: item.name,
      label: item.name,
      to: item.index ? base : `${base}/${item.path}`,
      end: item.index,
      icon: item.icon,
    });
    return acc;
  }, []);
};
