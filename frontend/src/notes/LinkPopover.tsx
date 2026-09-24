import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent } from "@/components/ui/popover";
import {
  activeEditor$,
  cancelLinkEdit$,
  type EditLinkDialog,
  linkDialogState$,
  removeLink$,
  switchFromPreviewToLinkEdit$,
  updateLink$,
  useCellValues,
  usePublisher,
} from "@mdxeditor/editor";
import { CheckIcon, CopyIcon, ExternalLinkIcon, PencilIcon, UnlinkIcon } from "lucide-react";
import { useState, type FormEvent } from "react";

// Replaces MDXEditor's built-in link dialog. Theirs portals into the editor
// root with its own stylesheet, so it clips under the sidebar and ignores
// our typography/theme; this one uses our Popover (portaled to <body>) and
// just drives MDXEditor's link-dialog state machine through its signals.
export function LinkPopover() {
  const [state, editor] = useCellValues(linkDialogState$, activeEditor$);
  const switchToEdit = usePublisher(switchFromPreviewToLinkEdit$);
  const cancelEdit = usePublisher(cancelLinkEdit$);
  const removeLink = usePublisher(removeLink$);

  if (state.type === "inactive") {
    return <></>;
  }

  // Prefer the link's own DOM node so the popover follows it on scroll. A new
  // link (Cmd+K on plain text) has no node yet, so fall back to the selection
  // rectangle MDXEditor computed.
  const { rectangle } = state;
  const anchor = (state.linkNodeKey && editor?.getElementByKey(state.linkNodeKey)) || {
    getBoundingClientRect: () =>
      DOMRect.fromRect({
        x: rectangle.left,
        y: rectangle.top,
        width: rectangle.width,
        height: rectangle.height,
      }),
  };
  const isEdit = state.type === "edit";

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open && isEdit) {
          cancelEdit();
        }
      }}
    >
      <PopoverContent
        anchor={anchor}
        align="start"
        // Preview must not steal focus: it shows up while you're typing
        // inside the link. Edit focuses its own URL field (see LinkEditForm).
        initialFocus={false}
        finalFocus={false}
        className={isEdit ? "w-80" : "w-auto max-w-96 flex-row items-center gap-1 p-1"}
        // Preview actions (copy, remove, edit) act on the link under the
        // caret, so keep the caret -- and focus -- in the editor when clicking them.
        onMouseDown={isEdit ? undefined : (e) => e.preventDefault()}
      >
        {isEdit ? (
          <LinkEditForm key={state.linkNodeKey} state={state} onDone={() => editor?.focus()} />
        ) : (
          <>
            <a
              href={state.href ?? "about:blank"}
              target="_blank"
              rel="noreferrer"
              title={state.url}
              className="flex min-w-0 items-center gap-1.5 px-2 text-primary underline-offset-4 hover:underline"
            >
              <span className="truncate">{state.url}</span>
              <ExternalLinkIcon className="size-3.5 shrink-0" />
            </a>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Edit link"
              title="Edit link"
              onClick={() => switchToEdit()}
            >
              <PencilIcon />
            </Button>
            <CopyUrlButton url={state.url} />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Remove link"
              title="Remove link"
              onClick={() => removeLink()}
            >
              <UnlinkIcon />
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function LinkEditForm({ state, onDone }: { state: EditLinkDialog; onDone: () => void }) {
  const updateLink = usePublisher(updateLink$);
  const cancelEdit = usePublisher(cancelLinkEdit$);
  const [url, setUrl] = useState(state.url);
  const [text, setText] = useState(state.text);

  function submit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    updateLink({ url, text: state.withAnchorText ? text : undefined, title: state.title });
    onDone();
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">URL</span>
        <Input
          // Moving focus out of the editor is also what keeps MDXEditor from
          // recomputing the dialog back to preview on the next selectionchange.
          autoFocus
          value={url}
          placeholder="https://"
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      {state.withAnchorText && (
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground">Text</span>
          <Input value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      <div className="flex justify-end gap-1">
        <Button type="button" size="sm" variant="ghost" onClick={() => cancelEdit()}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  );
}

function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label="Copy URL"
      title="Copy URL"
      onClick={() => {
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1000);
        });
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
