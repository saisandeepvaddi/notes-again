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
import {
  ArrowSquareOutIcon,
  CheckIcon,
  CopyIcon,
  LinkBreakIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { fetchLinkTargets } from "@/links/api";
import { noteLinkUid } from "@/links/uri";

export function LinkPopover() {
  const [state, editor] = useCellValues(linkDialogState$, activeEditor$);
  const switchToEdit = usePublisher(switchFromPreviewToLinkEdit$);
  const cancelEdit = usePublisher(cancelLinkEdit$);
  const removeLink = usePublisher(removeLink$);
  const navigate = useNavigate();

  if (state.type === "inactive") {
    return <></>;
  }

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
        initialFocus={false}
        finalFocus={false}
        className={isEdit ? "w-80" : "w-auto max-w-96 flex-row items-center gap-1 p-1"}
        onMouseDown={isEdit ? undefined : (e) => e.preventDefault()}
      >
        {isEdit ? (
          <LinkEditForm key={state.linkNodeKey} state={state} onDone={() => editor?.focus()} />
        ) : (
          <>
            {noteLinkUid(state.url) ? (
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5 px-2 text-primary underline-offset-4 hover:underline"
                onClick={() =>
                  void fetchLinkTargets([noteLinkUid(state.url) ?? ""]).then(([target]) => {
                    if (target && !target.trashed)
                      void navigate({
                        to: "/notes/$noteId",
                        params: { noteId: String(target.id) },
                      });
                  })
                }
              >
                <span className="truncate">Open linked note</span>
                <ArrowSquareOutIcon className="size-3.5 shrink-0" />
              </button>
            ) : (
              <a
                href={state.href ?? "about:blank"}
                target="_blank"
                rel="noreferrer"
                title={state.url}
                className="flex min-w-0 items-center gap-1.5 px-2 text-primary underline-offset-4 hover:underline"
              >
                <span className="truncate">{state.url}</span>
                <ArrowSquareOutIcon className="size-3.5 shrink-0" />
              </a>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Edit link"
              title="Edit link"
              onClick={() => switchToEdit()}
            >
              <PencilSimpleIcon />
            </Button>
            <CopyUrlButton url={state.url} />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Remove link"
              title="Remove link"
              onClick={() => removeLink()}
            >
              <LinkBreakIcon />
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
