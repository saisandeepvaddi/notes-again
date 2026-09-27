import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { MouseEvent } from "react";

interface SelectCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onToggle: (range: boolean) => void;
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

export function selectionClickCapture(selectionMode: boolean, onToggle: (range: boolean) => void) {
  return (event: MouseEvent) => {
    if (!selectionMode) return;
    event.preventDefault();
    event.stopPropagation();
    onToggle(event.shiftKey);
  };
}
