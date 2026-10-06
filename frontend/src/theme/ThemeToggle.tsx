import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Theme } from "@/lib/theme";
import { MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";

const OPTIONS: { value: Theme; label: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border p-0.5"
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="icon-sm"
          variant="ghost"
          role="radio"
          aria-checked={theme === option.value}
          aria-label={option.label}
          className={cn(theme === option.value && "bg-muted text-foreground")}
          onClick={() => setTheme(option.value)}
        >
          <option.icon />
        </Button>
      ))}
    </div>
  );
}
