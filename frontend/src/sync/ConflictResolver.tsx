import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { codeMirrorTheme } from "@/notes/codeMirrorTheme";
import { MergeView } from "@codemirror/merge";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { WarningIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { useNoteConflict, useResolveConflict, type SyncConflict } from "./syncApi";

interface NoteText {
  name: string;
  content: string;
}

const mergeTheme = EditorView.theme({
  "&": { fontSize: "13px" },
  ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, monospace)" },
  ".cm-merge-revert button": { color: "var(--primary)", cursor: "pointer" },
});

function MergeEditor({
  mine,
  theirs,
  onChange,
}: {
  mine: string;
  theirs: string;
  onChange: (content: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const initial = useRef({ mine, theirs });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const shared = [EditorView.lineWrapping, codeMirrorTheme, mergeTheme];
    const view = new MergeView({
      a: {
        doc: initial.current.mine,
        extensions: [
          ...shared,
          EditorView.contentAttributes.of({ "aria-label": "This computer's version" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      },
      b: {
        doc: initial.current.theirs,
        extensions: [
          ...shared,
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({ "aria-label": "The other version" }),
        ],
      },
      parent: host.current,
      revertControls: "b-to-a",
      collapseUnchanged: { margin: 3, minSize: 6 },
    });
    return () => view.destroy();
  }, []);

  return (
    <div
      ref={host}
      className="max-h-[55dvh] overflow-auto rounded-md border bg-background text-foreground"
    />
  );
}

function ResolveDialog({
  noteId,
  conflict,
  mine,
  open,
  onOpenChange,
  onResolved,
}: {
  noteId: number;
  conflict: SyncConflict;
  mine: NoteText;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: (text: NoteText) => void;
}) {
  const id = useId();
  const [name, setName] = useState(mine.name);
  const [content, setContent] = useState(mine.content);
  const { mutateAsync, isPending } = useResolveConflict(noteId);
  const titlesDiffer = mine.name !== conflict.their_name;

  const save = async (text: NoteText) => {
    try {
      await mutateAsync(text);
      onResolved(text);
      onOpenChange(false);
      toast.add({ type: "success", description: "Saved. The other devices get this version." });
    } catch (error) {
      toast.add({
        type: "error",
        priority: "high",
        description: error instanceof Error ? error.message : "Couldn't save your choice",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Choose what to keep</DialogTitle>
          <DialogDescription>
            This computer's version is on the left and you can edit it. Use the arrows to bring in
            changes from the other version on the right, then save.
          </DialogDescription>
        </DialogHeader>
        {titlesDiffer ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-title`} className="text-xs font-medium">
              Title
            </label>
            <div className="flex gap-2">
              <Input id={`${id}-title`} value={name} onChange={(e) => setName(e.target.value)} />
              <Button
                variant="outline"
                onClick={() => setName(conflict.their_name)}
                disabled={name === conflict.their_name}
              >
                Use other title
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Other version: <span className="text-foreground">{conflict.their_name}</span>
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-4 text-xs font-medium text-muted-foreground">
          <span>This computer</span>
          <span>Other version</span>
        </div>
        <MergeEditor mine={mine.content} theirs={conflict.their_content} onChange={setContent} />
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => save({ name: conflict.their_name, content: conflict.their_content })}
          >
            Use the other version
          </Button>
          <Button disabled={isPending} onClick={() => save({ name, content })}>
            {isPending ? "Saving…" : "Keep this version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SyncConflictBanner({
  noteId,
  mine,
  onResolved,
}: {
  noteId: number;
  mine: NoteText;
  onResolved: (text: NoteText) => void;
}) {
  const conflict = useNoteConflict(noteId);
  const [open, setOpen] = useState(false);
  if (!conflict) return null;
  return (
    <>
      <Alert variant="destructive">
        <WarningIcon />
        <AlertTitle>Changed in two places</AlertTitle>
        <AlertDescription>
          This note was edited here and on another device before they synced. Both versions are kept
          until you choose.
        </AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Compare versions
          </Button>
        </AlertAction>
      </Alert>
      {open ? (
        <ResolveDialog
          noteId={noteId}
          conflict={conflict}
          mine={mine}
          open={open}
          onOpenChange={setOpen}
          onResolved={onResolved}
        />
      ) : null}
    </>
  );
}
