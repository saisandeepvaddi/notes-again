import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { MouseEvent } from "react";

interface SelectCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  // Shift held during the click, for range selection.
  onToggle: (range: boolean) => void;
  // Cards hide it until hover (always shown once selecting, and on touch
  // screens, which have no hover); table rows always show it.
  revealOnHover?: boolean;
  className?: string;
}

export function SelectCheckbox({
  checked,
  indeterminate,
  label,
  onToggle,
  revealOnHover = false,
  className,
}: SelectCheckboxProps) {
  return (
    <Checkbox
      aria-label={label}
      checked={checked}
      indeterminate={indeterminate}
      // Not onCheckedChange: that doesn't say whether shift was held.
      onClick={(event) => onToggle(event.shiftKey)}
      className={cn(
        "relative z-10",
        revealOnHover &&
          "opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100 data-checked:opacity-100 group-data-[selecting=true]/card:opacity-100 [@media(hover:none)]:opacity-100",
        className,
      )}
    />
  );
}

// While selecting, a click anywhere on a card/row toggles it rather than
// following whatever link/button is under the pointer. Capture phase, so it
// beats those handlers without every one of them knowing about selection.
export function selectionClickCapture(selectionMode: boolean, onToggle: (range: boolean) => void) {
  return (event: MouseEvent) => {
    if (!selectionMode) return;
    event.preventDefault();
    event.stopPropagation();
    onToggle(event.shiftKey);
  };
}
