import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LoadingState } from "./LoadingState";

const BODY_LINES = ["w-11/12", "w-4/5", "w-full", "w-2/3", "w-5/6"];

function Lines({ widths, className }: { widths: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {widths.map((width, i) => (
        <Skeleton key={i} className={cn("h-3", width)} />
      ))}
    </div>
  );
}

function Pill({ className }: { className?: string }) {
  return <Skeleton className={cn("h-5 rounded-full", className)} />;
}

function NoteCardSkeleton({ index }: { index: number }) {
  const shift = index % BODY_LINES.length;
  const widths = [...BODY_LINES.slice(shift), ...BODY_LINES.slice(0, shift)];
  return (
    <Card className="h-72">
      <CardHeader className="flex items-center justify-between gap-2">
        <Skeleton className={cn("h-4", index % 2 ? "w-1/2" : "w-2/3")} />
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <Lines widths={widths} />
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-1.5">
        <Pill className="w-24" />
        <div className="flex gap-1.5">
          <Pill className="w-14" />
          <Pill className="w-24" />
          <Pill className="w-20" />
        </div>
      </CardFooter>
    </Card>
  );
}

export function NoteGridSkeleton({ label = "Loading notes", count = 6 }) {
  return (
    <LoadingState
      label={label}
      className="grid grid-cols-[repeat(auto-fill,minmax(260px,320px))] gap-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <NoteCardSkeleton key={i} index={i} />
      ))}
    </LoadingState>
  );
}

const TABLE_NAME_WIDTHS = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5", "w-1/2", "w-2/3", "w-2/5"];

export function NoteTableSkeleton() {
  return (
    <LoadingState
      label="Loading notes"
      className="overflow-hidden rounded-lg ring-1 ring-foreground/10"
    >
      <div className="flex h-9 items-center gap-4 border-b bg-muted/50 px-3">
        <Skeleton className="size-4 rounded-sm" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="ml-auto h-3 w-14" />
        <Skeleton className="h-3 w-12" />
      </div>
      {TABLE_NAME_WIDTHS.map((width, i) => (
        <div key={i} className="flex h-11 items-center gap-4 border-b px-3 last:border-b-0">
          <Skeleton className="size-4 rounded-sm" />
          <div className="min-w-0 flex-1">
            <Skeleton className={cn("h-3.5", width)} />
          </div>
          <Pill className="hidden w-20 sm:block" />
          <Pill className="w-14" />
        </div>
      ))}
    </LoadingState>
  );
}

export function NoteDetailSkeleton() {
  return (
    <LoadingState label="Loading note" className="flex h-full max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="px-2 py-1.5">
        <Skeleton className="h-6 w-1/2" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="size-7" />
        </div>
        <Separator />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Pill className="w-16" />
          <Pill className="w-28" />
          <Pill className="w-24" />
          <Pill className="w-20" />
        </div>
      </div>
      <div className="min-h-64 flex-1 rounded-md border border-input px-5 py-4">
        <Lines
          widths={["w-1/4", "w-11/12", "w-4/5", "w-full", "w-2/3", "w-3/5"]}
          className="gap-3"
        />
      </div>
    </LoadingState>
  );
}

export function ReviewSkeleton() {
  return (
    <LoadingState label="Loading review" className="flex w-full max-w-2xl flex-col gap-4">
      <Skeleton className="h-4 w-14" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2" />
        </CardHeader>
        <CardContent>
          <Lines widths={["w-11/12", "w-4/5", "w-full", "w-3/5"]} />
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2">
          <Skeleton className="h-4 w-56" />
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
          <Skeleton className="h-3 w-2/3" />
        </CardFooter>
      </Card>
    </LoadingState>
  );
}

function OrganizeSectionSkeleton({ rows }: { rows: number }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <div className="divide-y rounded-lg border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-11 items-center gap-3 px-3">
            <Skeleton className="size-4" />
            <Skeleton className={cn("h-3.5", i % 2 ? "w-28" : "w-40")} />
            <Skeleton className="ml-auto h-3 w-12" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function OrganizeSkeleton() {
  return (
    <LoadingState label="Loading projects and tags" className="flex flex-col gap-8">
      <OrganizeSectionSkeleton rows={2} />
      <OrganizeSectionSkeleton rows={4} />
    </LoadingState>
  );
}

export function SettingsSkeleton() {
  return (
    <LoadingState label="Loading settings" className="flex flex-col gap-8">
      <div className="flex max-w-md items-center justify-between gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-3 w-full" />
        </div>
        <Skeleton className="h-7 w-16" />
      </div>
      <div className="flex max-w-xl flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-12 w-full" />
      </div>
    </LoadingState>
  );
}
