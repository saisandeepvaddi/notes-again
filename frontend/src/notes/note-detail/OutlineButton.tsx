import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState } from "react";
import { extractOutline } from "../outline";

interface OutlineButtonProps {
  markdown: string;
  scope: string;
}

export function OutlineButton({ markdown, scope }: OutlineButtonProps) {
  const [open, setOpen] = useState(false);
  const items = extractOutline(markdown);
  if (items.length < 3) return null;
  const top = Math.min(...items.map((item) => item.level));
  const go = (index: number) => {
    setOpen(false);
    const headings = document.querySelectorAll<HTMLElement>(`${scope} :is(h1, h2, h3, h4, h5, h6)`);
    headings[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            Contents
          </button>
        }
      />
      <PopoverContent align="end" className="max-h-80 w-72 overflow-y-auto p-1">
        <nav aria-label="Note contents" className="flex flex-col">
          {items.map((item) => (
            <button
              key={item.index}
              type="button"
              onClick={() => go(item.index)}
              style={{ paddingLeft: `${0.5 + (item.level - top) * 0.75}rem` }}
              className="truncate rounded-md py-1 pr-2 text-left text-xs/relaxed hover:bg-muted"
            >
              {item.title}
            </button>
          ))}
        </nav>
      </PopoverContent>
    </Popover>
  );
}
