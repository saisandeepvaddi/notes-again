import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { NoteAlign } from "@/lib/noteLayout";
import type { ReadingFont } from "@/lib/readingFont";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/theme/ThemeToggle";
import {
  ArrowsOutLineHorizontalIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
} from "@phosphor-icons/react";
import { useNoteLayout } from "./useNoteLayout";
import { useReadingFont } from "./useReadingFont";

const READING_FONT_OPTIONS: {
  value: ReadingFont;
  label: string;
  description: string;
  previewClassName: string;
}[] = [
  {
    value: "sans",
    label: "Sans-serif",
    description: "Compact and even. Suits notes full of code.",
    previewClassName: "font-sans",
  },
  {
    value: "serif",
    label: "Serif",
    description: "Bookish and calm. Easier on long passages.",
    previewClassName: "font-serif",
  },
];

const NOTE_ALIGN_OPTIONS: { value: NoteAlign; label: string; icon: typeof TextAlignLeftIcon }[] = [
  { value: "center", label: "Centered", icon: TextAlignCenterIcon },
  { value: "left", label: "Left", icon: TextAlignLeftIcon },
  { value: "full", label: "Full width", icon: ArrowsOutLineHorizontalIcon },
];

const PREVIEW_TEXT = "Spaced repetition turns what you read into what you remember.";

export function AppearanceSettings() {
  const [readingFont, setReadingFont] = useReadingFont();
  const noteLayout = useNoteLayout();

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Theme</p>
          <p className="text-xs text-muted-foreground">Light, dark, or follow your system.</p>
        </div>
        <ThemeToggle />
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <p id="reading-font-label" className="text-sm font-medium">
            Reading font
          </p>
          <p className="text-xs text-muted-foreground">
            Used for note titles and note text. The rest of the app stays sans-serif. Saved on this
            device.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="reading-font-label"
          className="grid gap-2 sm:grid-cols-2"
        >
          {READING_FONT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={readingFont === option.value}
              onClick={() => setReadingFont(option.value)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
                readingFont === option.value && "border-primary bg-primary/5 hover:bg-primary/5",
              )}
            >
              <span className="flex flex-col">
                <span className="text-xs font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </span>
              <span className={cn("text-sm leading-relaxed", option.previewClassName)}>
                {PREVIEW_TEXT}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <p id="note-align-label" className="text-sm font-medium">
            Note width
          </p>
          <p className="text-xs text-muted-foreground">
            Where note text sits on wide screens. Saved on this device.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="note-align-label"
          className="flex w-fit items-center gap-0.5 rounded-md border p-0.5"
        >
          {NOTE_ALIGN_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant="ghost"
              role="radio"
              aria-checked={noteLayout.align === option.value}
              className={cn(noteLayout.align === option.value && "bg-muted text-foreground")}
              onClick={() => noteLayout.chooseAlign(option.value)}
            >
              <option.icon />
              {option.label}
            </Button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Editor border</span>
          <span className="block text-xs text-muted-foreground">
            Outline the writing area on the note page. Saved on this device.
          </span>
        </span>
        <Switch checked={noteLayout.border} onCheckedChange={noteLayout.chooseBorder} />
      </label>
    </div>
  );
}
