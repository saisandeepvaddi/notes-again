import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Link } from "@tanstack/react-router";
import { CheckCircle2Icon, CopyIcon } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { ReviewStatusPicker } from "@/notes/ReviewStatusPicker";
import type { ReviewStatus } from "@/notes/reviewStatus";
import { ImportSummary } from "./ImportSummary";
import { EXAMPLE_IMPORT, type ImportResult } from "./types";
import { useImportNotes } from "./useImportNotes";

const DEFAULT_PER_DAY = "10";

const IMPORT_STATUS_HINTS: Record<ReviewStatus, string> = {
  active: "Notes go into review, spread out by the per-day pace below.",
  paused:
    "Kept as notes, out of review for now (a deck for later). New decks start paused too. Resume them from Organize when you're ready.",
  "note-only":
    "Plain notes with no reviews or due dates, like reference material. Add them to review later from Organize or a selection in Notes.",
};

function FormatHelp() {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE_IMPORT);
      toast.add({ type: "success", description: "Example copied" });
    } catch {
      toast.add({ type: "error", priority: "high", description: "Couldn't copy" });
    }
  };
  return (
    <details className="rounded-lg border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">File format</summary>
      <div className="mt-3 flex flex-col gap-3 text-muted-foreground">
        <p>
          A JSON file with <code>decks</code> (each with a name and its notes), loose{" "}
          <code>notes</code>, or just a list of notes. Per note: <code>name</code> (required),{" "}
          <code>content</code> (markdown), and optionally <code>deck</code>, <code>tags</code> (a
          list) and <code>difficulty</code> (<code>easy</code>, <code>medium</code> or{" "}
          <code>hard</code>).
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Decks and tags are created if they don't exist, matched ignoring case.</li>
          <li>A note with the same name in the same deck is skipped, so re-importing is safe.</li>
          <li>Tags named Easy / Medium / Hard are ignored; use difficulty instead.</li>
          <li>
            Files from <strong>Export</strong> (on All Notes) include each note's{" "}
            <code>review</code> state, so notes come back with their schedule, rating history and
            paused or note-only state instead of starting over.
          </li>
          <li>
            <code>per_day</code> sets how many notes become due each day: at the top of the file,
            and/or on a deck (a deck's own value wins). <code>0</code> makes them all due now. Each
            deck is spread out on its own. Without it, the default below (10) is used.
          </li>
        </ul>
        <div className="relative">
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
            {EXAMPLE_IMPORT}
          </pre>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="absolute top-2 right-2"
            onClick={copy}
          >
            <CopyIcon /> Copy
          </Button>
        </div>
      </div>
    </details>
  );
}

export function ImportForm() {
  const [tab, setTab] = useState<string>("file");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [perDay, setPerDay] = useState(DEFAULT_PER_DAY);
  const [defaultDeck, setDefaultDeck] = useState("");
  const [status, setStatus] = useState<ReviewStatus>("active");
  const paced = status === "active";
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const { mutateAsync, isPending } = useImportNotes();

  const perDayNumber = Number.parseInt(perDay, 10);
  const perDayValid = Number.isInteger(perDayNumber) && perDayNumber >= 0 && perDayNumber <= 1000;

  const edit = () => {
    setPreview(null);
    setError(null);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    edit();
    setFileName(file.name);
    setText(await file.text());
  };

  const run = async (dryRun: boolean) => {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch (parseError) {
      setError(
        `That isn't valid JSON: ${parseError instanceof Error ? parseError.message : "parse error"}`,
      );
      return;
    }
    setError(null);
    try {
      const result = await mutateAsync({
        payload,
        perDay: perDayNumber,
        defaultDeck,
        dryRun,
        status,
      });
      if (dryRun) {
        setPreview(result);
      } else {
        setDone(result);
        setPreview(null);
        toast.add({
          type: "success",
          description: `Imported ${result.notes_created.toLocaleString()} notes`,
        });
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Import failed");
    }
  };

  const reset = () => {
    setText("");
    setFileName(null);
    setPreview(null);
    setDone(null);
    setError(null);
  };

  if (done) {
    return (
      <div className="flex max-w-3xl flex-col gap-4">
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>Import complete</AlertTitle>
          <AlertDescription>
            {done.notes_created.toLocaleString()} note{done.notes_created === 1 ? "" : "s"}{" "}
            {done.note_only ? "added as note only" : done.paused ? "added, paused" : "added"}.
          </AlertDescription>
        </Alert>
        <ImportSummary result={done} />
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link to="/notes">View notes</Link>} />
          <Button variant="outline" onClick={reset}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <FormatHelp />

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList>
          <TabsTrigger value="file">Upload file</TabsTrigger>
          <TabsTrigger value="paste">Paste JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="file" className="flex flex-col gap-2">
          <Input type="file" accept=".json,application/json" onChange={onFile} />
          {fileName && (
            <p className="text-xs text-muted-foreground">
              {fileName},{" "}
              {(text.length / 1024).toLocaleString(undefined, { maximumFractionDigits: 0 })} KB
              loaded
            </p>
          )}
        </TabsContent>
        <TabsContent value="paste">
          <Textarea
            value={text}
            onChange={(event) => {
              edit();
              setFileName(null);
              setText(event.target.value);
            }}
            placeholder='{"decks": [...]} or [{"name": "...", "content": "..."}]'
            spellCheck={false}
            className="h-56 max-h-56 overflow-auto font-mono text-xs [field-sizing:fixed]"
          />
        </TabsContent>
      </Tabs>

      <div className="flex flex-col gap-1.5 rounded-md border p-3 text-sm">
        <span className="font-medium">Import as</span>
        <ReviewStatusPicker
          label="Import as"
          value={status}
          onChange={(next) => {
            edit();
            setStatus(next);
          }}
        />
        <span className="text-xs text-muted-foreground">{IMPORT_STATUS_HINTS[status]}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Default new notes per day</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={1000}
            value={perDay}
            onChange={(event) => {
              edit();
              setPerDay(event.target.value);
            }}
            aria-invalid={!perDayValid}
            disabled={!paced}
          />
          <span className="text-xs text-muted-foreground">
            {status === "paused" ? (
              <>Not used for a paused import: you choose the pace when you resume.</>
            ) : status === "note-only" ? (
              <>Not used for note-only notes: you choose the pace if you add them to review.</>
            ) : (
              <>
                Used wherever the file doesn't set <code>per_day</code>. First reviews are spread
                out this many per day so you don't get a huge backlog; 0 makes everything due now.
              </>
            )}
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Deck for notes without one (optional)</span>
          <Input
            value={defaultDeck}
            onChange={(event) => {
              edit();
              setDefaultDeck(event.target.value);
            }}
            placeholder="e.g. Imported"
          />
        </label>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Can't import that</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {preview && (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Preview: nothing has been imported yet</p>
          <ImportSummary result={preview} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={preview ? "outline" : "default"}
          disabled={isPending || !text.trim() || (paced && !perDayValid)}
          onClick={() => run(true)}
        >
          {isPending && !preview ? <Spinner /> : null} Preview
        </Button>
        {preview && (
          <Button disabled={isPending || preview.notes_created === 0} onClick={() => run(false)}>
            {isPending ? <Spinner /> : null} Import {preview.notes_created.toLocaleString()} note
            {preview.notes_created === 1 ? "" : "s"}
          </Button>
        )}
      </div>
    </div>
  );
}
