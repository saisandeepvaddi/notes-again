import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { WarningOctagonIcon } from "@phosphor-icons/react";
import { Link, useRouter } from "@tanstack/react-router";

interface RouteErrorProps {
  error: unknown;
}

export function RouteError({ error }: RouteErrorProps) {
  const router = useRouter();
  useDocumentTitle("Something went wrong");
  const message =
    error instanceof Error ? error.message : "Something went wrong while loading this page.";
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <WarningOctagonIcon className="size-6" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <h1 className="font-reading text-xl font-semibold tracking-tight">This page broke</h1>
        <p className="max-w-[52ch] text-sm text-muted-foreground">
          The note data could not be loaded. Try again, and if it keeps failing the backend may be
          down or the database may need a look.
        </p>
        <p className="mt-1 max-w-[52ch] truncate font-mono text-[11px] text-muted-foreground/70">
          {message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => router.invalidate()}>Try again</Button>
        <Link to="/notes" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to notes
        </Link>
      </div>
    </div>
  );
}
