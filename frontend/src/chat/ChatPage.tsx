import { Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { answerHtml } from "@/discussion/answerHtml";
import { chatAnswerAsNote, checkCitations } from "@/discussion/citations";
import type { ChatScope, DiscussionBody, Turn } from "@/discussion/core";
import { DiscussionSettings } from "@/discussion/DiscussionSettings";
import { useDiscussion } from "@/discussion/useDiscussion";
import { useCredentials } from "@/discussion/webCredentials";
import { useProjects } from "@/notes/hooks/useProjects";
import { useTags } from "@/notes/hooks/useTags";
import { useCreateNewNote } from "@/notes/new-note-form/useCreateNewNote";
import { getHeaders, getURL } from "@/utils/fetchers";

type ScopeChoice = "library" | "project" | "tag";

function Answer({ turn }: { turn: Turn }) {
  const check = useMemo(
    () => checkCitations(turn.answer, turn.sources ?? []),
    [turn.answer, turn.sources],
  );
  return (
    <>
      <div
        className="markdown-content min-w-0 text-sm wrap-break-word"
        dangerouslySetInnerHTML={{ __html: answerHtml(check.text) }}
      />
      {turn.status !== "streaming" && check.unverified.length > 0 && (
        <p role="status" className="text-xs text-destructive">
          {check.unverified.map((n) => `[${n}]`).join(", ")} did not match any passage that was
          sent, so treat {check.unverified.length === 1 ? "that citation" : "those citations"} as
          unverified.
        </p>
      )}
    </>
  );
}

export function ChatPage() {
  const credentials = useCredentials();
  const projects = useProjects();
  const tags = useTags();
  const [choice, setChoice] = useState<ScopeChoice>("library");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const createNote = useCreateNewNote();
  const scope: ChatScope | undefined =
    choice === "library"
      ? { kind: "library" }
      : groupId === null
        ? undefined
        : { kind: choice, id: groupId };
  const scopeLabel =
    choice === "library"
      ? "Whole library"
      : choice === "project"
        ? `Project: ${projects.data?.find((item) => item.id === groupId)?.name ?? ""}`
        : `Tag: ${tags.data?.find((item) => item.id === groupId)?.name ?? ""}`;
  const transport = useCallback(
    async (body: DiscussionBody, signal: AbortSignal) =>
      fetch(`${getURL()}/chat`, {
        method: "POST",
        headers: await getHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(95_000)]),
        credentials: "same-origin",
      }),
    [],
  );
  const chat = useDiscussion(transport, undefined, scope);
  const groups =
    choice === "project"
      ? (projects.data ?? [])
      : choice === "tag"
        ? (tags.data ?? []).filter((tag) => !tag.is_difficulty)
        : [];

  const save = async (turn: Turn) => {
    try {
      await createNote.mutateAsync(chatAnswerAsNote(turn, scopeLabel));
      toast.add({ type: "success", description: "Answer saved as a Note only" });
    } catch {
      toast.add({
        type: "error",
        description: "Could not save the answer. It is still on this page.",
      });
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
      <p className="text-xs text-muted-foreground">
        Your question and a few relevant passages (up to about 9,000 characters, never the whole
        library) go to {credentials.config.provider === "anthropic" ? "Anthropic" : "OpenAI"} via
        your Notes Again backend, using your own key. Trashed notes are excluded. Charges and data
        policies apply. Nothing is changed or saved unless you save an answer.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          Ask about
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={choice}
            disabled={chat.running}
            onChange={(event) => {
              setChoice(event.target.value as ScopeChoice);
              setGroupId(null);
            }}
          >
            <option value="library">Whole library</option>
            <option value="project">A project</option>
            <option value="tag">A tag</option>
          </select>
        </label>
        {choice !== "library" && (
          <select
            aria-label={choice === "project" ? "Project" : "Tag"}
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={groupId ?? ""}
            disabled={chat.running}
            onChange={(event) => setGroupId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Choose…</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        )}
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
          New chat
        </Button>
      </div>
      {(settingsOpen || !credentials.config.apiKey) && <DiscussionSettings />}
      {chat.turns.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ask about what you have written. Answers cite the passages they used; check them against
          the notes.
        </p>
      )}
      <div className="flex flex-col gap-6" aria-label="Chat transcript">
        {chat.turns.map((turn) => (
          <article key={turn.id} className="flex min-w-0 flex-col gap-3 border-b pb-5">
            <h3 className="text-sm font-medium whitespace-pre-wrap wrap-break-word">
              {turn.question}
            </h3>
            {turn.answer ? (
              <Answer turn={turn} />
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
            {turn.sources && (
              <details className="text-xs" open>
                <summary className="cursor-pointer text-muted-foreground">
                  Passages sent · {turn.sources.length}
                </summary>
                <ol className="mt-2 flex flex-col gap-2">
                  {turn.sources.map((source) => (
                    <li key={source.n}>
                      <Link
                        to="/notes/$noteId"
                        params={{ noteId: String(source.note_id) }}
                        className="underline underline-offset-4"
                      >
                        [{source.n}] {source.title || "Untitled"}
                      </Link>
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-muted-foreground">
                        {source.text}
                      </p>
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {turn.answer && turn.status !== "streaming" && (
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={chat.running || createNote.isPending}
                  onClick={() => void save(turn)}
                >
                  Save answer as note
                </Button>
              </div>
            )}
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
          <FieldLabel htmlFor="chat-question">Your question</FieldLabel>
          <Textarea
            id="chat-question"
            value={chat.question}
            maxLength={2_000}
            rows={3}
            disabled={chat.running}
            onChange={(event) => chat.setQuestion(event.target.value)}
            placeholder="What do my notes say about…?"
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
                !credentials.ready || !credentials.config.apiKey || !chat.question.trim() || !scope
              }
            >
              Send to provider
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
