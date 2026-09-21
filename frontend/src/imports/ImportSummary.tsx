import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, isToday } from "date-fns";
import type { ImportResult } from "./types";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded-lg border px-3 py-2">
      <span className="text-lg font-semibold">{value.toLocaleString()}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function dayLabel(date: Date) {
  return isToday(date) ? "today" : format(date, "MMM d");
}

// Used for both the preview (dry run) and the final result -- same numbers
// either way, since the server runs the same logic for both.
export function ImportSummary({ result }: { result: ImportResult }) {
  const verb = result.dry_run ? "to import" : "imported";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={`notes ${verb}`} value={result.notes_created} />
        <Stat label={result.new_decks === 1 ? "new deck" : "new decks"} value={result.new_decks} />
        <Stat label={result.new_tags === 1 ? "new tag" : "new tags"} value={result.new_tags} />
        <Stat label="skipped" value={result.duplicates_skipped + result.invalid_skipped} />
      </div>

      {result.first_due && result.last_due && (
        <p className="text-sm text-muted-foreground">
          {result.due_today === result.notes_created ? (
            <>Every imported note is due for review right away.</>
          ) : (
            <>
              {result.due_today.toLocaleString()} due today; the rest are spread over up to{" "}
              {result.days_span} days (the last batch is due {dayLabel(result.last_due)}).
            </>
          )}
        </p>
      )}

      {result.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-400">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {result.decks.length > 0 && (
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Deck</TableHead>
                <TableHead className="text-right">Per day</TableHead>
                <TableHead className="text-right">{result.dry_run ? "To import" : "Imported"}</TableHead>
                <TableHead className="text-right">Skipped</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.decks.map((deck) => (
                <TableRow key={deck.name ?? "__none__"}>
                  <TableCell>
                    {deck.name ?? <span className="text-muted-foreground">No deck</span>}
                    {deck.is_new && (
                      <Badge variant="secondary" className="ml-2">
                        new
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {deck.per_day === 0 ? "all now" : deck.per_day}
                  </TableCell>
                  <TableCell className="text-right">{deck.to_create.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{deck.skipped.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {result.issues.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            Skipped rows ({(result.duplicates_skipped + result.invalid_skipped).toLocaleString()})
          </p>
          <div className="max-h-64 overflow-auto rounded-lg ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-14">Row</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Why</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.issues.map((issue) => (
                  <TableRow key={`${issue.row}-${issue.reason}`}>
                    <TableCell>{issue.row}</TableCell>
                    <TableCell className="max-w-40 truncate">{issue.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {issue.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {result.issues_truncated && (
            <p className="text-xs text-muted-foreground">
              Showing the first {result.issues.length}; there are more.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
