import type { ReadingFont } from "@/lib/readingFont";
import { cn } from "@/lib/utils";
import ThemeToggle from "@/theme/ThemeToggle";
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

const PREVIEW_TEXT = "Spaced repetition turns what you read into what you remember.";

export function AppearanceSettings() {
  const [readingFont, setReadingFont] = useReadingFont();

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
    </div>
  );
}
