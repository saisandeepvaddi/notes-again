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
        <SidebarTrigger className="hidden md:inline-flex" />
        <div className="min-w-0">
          <h1 className="truncate font-heading text-lg font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
