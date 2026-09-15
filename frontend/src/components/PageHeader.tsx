import { SidebarTrigger } from "@/components/ui/sidebar";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div className="flex min-w-0 items-center gap-2">
        {/* The Layout mobile header already has its own trigger; this one is
            for desktop, where that bar is hidden. */}
        <SidebarTrigger className="hidden md:inline-flex" />
        <div className="min-w-0">
          <h1 className="truncate font-serif text-lg font-semibold">{title}</h1>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
