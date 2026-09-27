import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface LoadingStateProps {
  label: string;
  className?: string;
  children: ReactNode;
}

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
