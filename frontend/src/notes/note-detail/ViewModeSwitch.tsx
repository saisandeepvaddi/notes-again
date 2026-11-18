import { cn } from "@/lib/utils";

export type NoteViewMode = "edit" | "source" | "read";

const MODES: { value: NoteViewMode; label: string }[] = [
  { value: "edit", label: "Edit" },
  { value: "source", label: "Source" },
  { value: "read", label: "Read" },
];

const STORAGE_KEY = "notes-again.note-view-mode.v1";

export function readViewMode(): NoteViewMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return MODES.some((mode) => mode.value === stored) ? (stored as NoteViewMode) : "edit";
  } catch {
    return "edit";
  }
}

export function rememberViewMode(mode: NoteViewMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    return;
  }
}

interface ViewModeSwitchProps {
  value: NoteViewMode;
  onChange: (mode: NoteViewMode) => void;
}

export function ViewModeSwitch({ value, onChange }: ViewModeSwitchProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Note view"
      className="inline-flex rounded-md border border-border p-0.5 text-xs"
    >
      {MODES.map((mode) => (
        <button
          key={mode.value}
          type="button"
          role="radio"
          aria-checked={value === mode.value}
          onClick={() => onChange(mode.value)}
          className={cn(
            "rounded px-2 py-0.5 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            value === mode.value && "bg-muted font-medium text-foreground",
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
