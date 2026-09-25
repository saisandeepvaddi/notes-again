import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface LoadingStateProps {
  // What's loading, for screen readers ("Loading notes"); the visual is a
  // skeleton, so this is the only place the words exist.
  label: string;
  className?: string;
  children: ReactNode;
}

// Wraps a page-shaped skeleton. It stays invisible for the first ~300ms
// (`.loading-reveal` in styles.css) so a fast load goes straight from blank
// paper to content with no flash; only a load slow enough to notice shows the
// skeleton, which then sits exactly where the content will land.
export function LoadingState({ label, className, children }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className={cn("loading-reveal", className)}>
      <span className="sr-only">{label}</span>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}
