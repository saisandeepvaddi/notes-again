import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { getHeaders, getURL } from "@/utils/fetchers";
import { useCreateNewNote } from "@/notes/new-note-form/useCreateNewNote";
import { answerAsNote, ACTIONS, type Turn, type DiscussionBody } from "./core";
import { answerHtml } from "./answerHtml";
import { DiscussionSettings } from "./DiscussionSettings";
import { useDiscussion } from "./useDiscussion";
import { useCredentials } from "./webCredentials";

interface Props {
  noteId: number;
  title: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  beforeSend(): Promise<unknown>;
}

export function DiscussionPanel({ noteId, title, open, onOpenChange, beforeSend }: Props) {
  const credentials = useCredentials();
  const transport = useCallback(
    async (body: DiscussionBody, signal: AbortSignal) =>
      fetch(`${getURL()}/notes/${noteId}/discuss`, {
        method: "POST",
        headers: await getHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(95_000)]),
        credentials: "same-origin",
      }),
    [noteId],
  );
  const chat = useDiscussion(transport, beforeSend);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState<Turn | null>(null);
  const createNote = useCreateNewNote();
  useEffect(() => {
    if (!open) chat.stop();
  }, [open, chat.stop]);

  const saveAnswer = async () => {
    if (!saving || createNote.isPending) return;
    try {
      await createNote.mutateAsync(answerAsNote(saving, saving.context?.title || title));
      setSaving(null);
      toast.add({ type: "success", description: "Answer saved as a Note only" });
    } catch {
      toast.add({
        type: "error",
        description: "Could not save the answer. It is still in this discussion.",
      });
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          <SheetHeader className="shrink-0 pr-12">
            <SheetTitle>Discuss this note</SheetTitle>
            <SheetDescription>{title || "Untitled note"}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6">
            <p className="text-xs text-muted-foreground">
              Only the saved version of this note (up to 12,000 characters), your question and up to
              three recent completed exchanges go to{" "}
              {credentials.config.provider === "anthropic" ? "Anthropic" : "OpenAI"} via your Notes
              Again backend. Provider charges and data policies apply. No library access or
              automatic note changes.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSettingsOpen((value) => !value)}
                disabled={chat.running}
              >
                {settingsOpen ? "Hide settings" : "Discuss settings"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={chat.clear}
                disabled={chat.running || !chat.turns.length}
              >
                New discussion
              </Button>
            </div>
            {(settingsOpen || !credentials.config.apiKey) && <DiscussionSettings />}
            <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
              {ACTIONS.map((action) => (
                <Button
                  key={action.label}
                  size="sm"
                  variant="outline"
                  disabled={chat.running}
                  onClick={() => chat.setQuestion(action.question)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
            {chat.turns.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ask a question or choose a suggestion, then Send. Answers may be wrong; check them
                against your note.
              </p>
            )}
            <div className="flex flex-col gap-6" aria-label="Discussion transcript">
              {chat.turns.map((turn) => (
                <article key={turn.id} className="flex min-w-0 flex-col gap-3 border-b pb-5">
                  <h3 className="text-sm font-medium whitespace-pre-wrap wrap-break-word">
                    {turn.question}
                  </h3>
                  {turn.answer ? (
                    <div
                      className="markdown-content min-w-0 text-sm wrap-break-word"
                      dangerouslySetInnerHTML={{ __html: answerHtml(turn.answer) }}
                    />
                  ) : (
                    <p role="status" className="text-xs text-muted-foreground">
                      {turn.status === "streaming"
                        ? "Waiting for the provider…"
                        : "No answer text received."}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {turn.provider} · {turn.model}
                    </span>
                    {turn.status === "streaming" && <span role="status">Responding…</span>}
                    {turn.status === "stopped" && <span>Stopped · partial answer</span>}
                    {turn.status === "error" && <span>Interrupted · partial answer</span>}
                    {turn.usage && (
                      <span>
                        {turn.usage.input ?? "—"} input · {turn.usage.output ?? "—"} output tokens
                      </span>
                    )}
                  </div>
                  {turn.notice && <p className="text-xs text-muted-foreground">{turn.notice}</p>}
                  {turn.context && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Context sent · {turn.context.content.length.toLocaleString()} characters
                        {turn.context.truncated ? " · note truncated" : ""}
                      </summary>
                      <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap wrap-break-word font-sans">
                        {turn.context.content}
                      </pre>
                    </details>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      to="/notes/$noteId"
                      params={{ noteId: String(noteId) }}
                      className="text-xs underline underline-offset-4"
                      onClick={() => onOpenChange(false)}
                    >
                      Source [1]: {turn.context?.title || title}
                    </Link>
                    {turn.answer && turn.status !== "streaming" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={chat.running}
                        onClick={() => setSaving(turn)}
                      >
                        Save answer as note
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {chat.error && (
              <Alert variant="destructive">
                <AlertDescription>{chat.error}</AlertDescription>
              </Alert>
            )}
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void chat.send();
              }}
            >
              <Field>
                <FieldLabel htmlFor="discussion-question">Your question</FieldLabel>
                <Textarea
                  id="discussion-question"
                  value={chat.question}
                  maxLength={2_000}
                  rows={3}
                  disabled={chat.running}
                  onChange={(event) => chat.setQuestion(event.target.value)}
                  placeholder="What would you like to understand?"
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  1,200 output tokens max. No automatic retries.
                </p>
                {chat.running ? (
                  <Button type="button" variant="outline" onClick={chat.stop}>
                    Stop response
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      !credentials.ready || !credentials.config.apiKey || !chat.question.trim()
                    }
                  >
                    Send to provider
                  </Button>
                )}
              </div>
            </form>
            <p className="text-xs text-muted-foreground">
              Conversation stays in memory while this note is open. Save an answer explicitly if you
              want to keep it.
            </p>
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!saving}
        onOpenChange={(value) => {
          if (!value && !createNote.isPending) setSaving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save this answer as a new note?</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a separate Note only with the question, answer and source identifier. Your
              original note and review schedule are unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createNote.isPending} onClick={() => setSaving(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={createNote.isPending}
              onClick={(event) => {
                event.preventDefault();
                void saveAnswer();
              }}
            >
              {createNote.isPending ? "Saving…" : "Create note"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
