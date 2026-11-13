import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { DIFFICULTY_BADGE_CLASSES, DIFFICULTY_OPTIONS } from "@/notes/difficulty";
import {
  readNewNoteDefaults,
  writeNewNoteDefaults,
  type NewNoteDefaults,
} from "@/notes/newNoteDefaults";
import { ReviewStatusPicker } from "@/notes/ReviewStatusPicker";

export function NotesSettings() {
  const [defaults, setDefaults] = useState(() => readNewNoteDefaults(window.localStorage));
  const [unsaved, setUnsaved] = useState(false);
  const change = (patch: Partial<NewNoteDefaults>) => {
    const next = { ...defaults, ...patch };
    setDefaults(next);
    try {
      writeNewNoteDefaults(window.localStorage, next);
      setUnsaved(false);
    } catch {
      setUnsaved(true);
    }
  };
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Start new notes with these choices</span>
          <span className="block text-xs text-muted-foreground">
            Off: every new note starts in review with Medium difficulty. Saved on this device.
          </span>
        </span>
        <Switch
          checked={defaults.enabled}
          onCheckedChange={(enabled) => change({ enabled })}
          aria-label="Start new notes with these choices"
        />
      </label>
      <fieldset disabled={!defaults.enabled} className="flex flex-col gap-6 disabled:opacity-50">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Review status</p>
          <ReviewStatusPicker
            value={defaults.status}
            onChange={(status) => change({ status })}
            disabled={!defaults.enabled}
            label="Default review status"
          />
        </div>
        <div role="group" aria-label="Default difficulty" className="flex flex-col gap-2">
          <p className="text-sm font-medium">Difficulty</p>
          <div className="flex items-center gap-1.5">
            {DIFFICULTY_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={defaults.difficulty === option.value}
                onClick={() => change({ difficulty: option.value })}
                className={cn(
                  defaults.difficulty === option.value && DIFFICULTY_BADGE_CLASSES[option.value],
                )}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </fieldset>
      {unsaved ? (
        <p role="alert" className="text-xs text-destructive">
          This browser couldn’t save the choices, so they apply only until you reload.
        </p>
      ) : null}
    </div>
  );
}
