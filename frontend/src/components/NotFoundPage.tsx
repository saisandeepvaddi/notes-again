import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { MapTrifoldIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

interface NotFoundPageProps {
  detail?: string;
}

export function NotFoundPage({ detail }: NotFoundPageProps) {
  useDocumentTitle("Page not found");
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MapTrifoldIcon className="size-6" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <h1 className="font-reading text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="max-w-[46ch] text-sm text-muted-foreground">
          {detail ?? "That page doesn't exist. It may have moved, or the link is out of date."}
        </p>
      </div>
      <Link to="/notes" className={cn(buttonVariants())}>
        Back to notes
      </Link>
    </div>
  );
}
