import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { Button } from "@/types/components/ui/button";

/** Single-button light/dark toggle. Sun shows in dark mode, Moon in light. */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  );
}
