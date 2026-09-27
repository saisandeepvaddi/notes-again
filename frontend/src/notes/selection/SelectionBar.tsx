import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

interface SelectionBarProps {
  count: number;
  total: number;
  onSelectAll: () => Promise<void>;
  onClear: () => void;
  children: ReactNode;
}

export function SelectionBar({ count, total, onSelectAll, onClear, children }: SelectionBarProps) {
  const [selectingAll, setSelectingAll] = useState(false);

  const selectAll = async () => {
    setSelectingAll(true);
    try {
      await onSelectAll();
    } finally {
      setSelectingAll(false);
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      className="sticky bottom-4 z-30 flex w-fit max-w-full flex-wrap items-center gap-2 self-center rounded-xl bg-popover p-2 text-popover-foreground shadow-lg ring-1 ring-foreground/15"
    >
      <div className="flex items-center gap-2 pl-1 pr-2 text-sm">
        <span className="font-medium tabular-nums">{count.toLocaleString()} selected</span>
        {count < total && (
          <Button size="xs" variant="link" disabled={selectingAll} onClick={selectAll}>
            {selectingAll && <Spinner />} Select all {total.toLocaleString()}
          </Button>
        )}
      </div>
      {children}
      <Button size="icon-sm" variant="ghost" aria-label="Clear selection" onClick={onClear}>
        <XIcon />
      </Button>
    </div>
  );
}
