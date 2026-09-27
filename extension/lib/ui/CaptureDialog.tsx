import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { CaptureError } from "../api/types";
import { buildDraft } from "../capture/draft";
import type { CaptureContext } from "../capture/types";
import { callBackground, type LookupsResult, type SaveResult } from "../messaging";
import { Combobox } from "./Combobox";

export interface CaptureDialogProps {
  ctx: CaptureContext;
  variant: "overlay" | "window";
  onClose: () => void;
}

type LookupState =
  | { state: "loading" }
  | { state: "ready"; projects: string[]; tags: string[] }
  | { state: "error"; error: CaptureError };

type SaveState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; saved: SaveResult }
  | { state: "error"; message: string };

const asCaptureError = (err: unknown) =>
  err instanceof CaptureError ? err : new CaptureError("http", err instanceof Error ? err.message : String(err));

export function CaptureDialog({ ctx, variant, onClose }: CaptureDialogProps) {
  const initial = useMemo(() => buildDraft(ctx), [ctx]);
  const [name, setName] = useState(initial.name);
  const [content, setContent] = useState(initial.content);
  const [project, setProject] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [lookups, setLookups] = useState<LookupState>({ state: "loading" });
  const [save, setSave] = useState<SaveState>({ state: "idle" });
  const projectTouched = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const dirty = name !== initial.name || content !== initial.content || project.length > 0 || tags.length > 0;

  const loadLookups = useCallback(async () => {
    setLookups({ state: "loading" });
    try {
      const result = await callBackground<LookupsResult>({ type: "lookups" });
      setLookups({ state: "ready", projects: result.projects, tags: result.tags });
      if (!projectTouched.current && result.lastProject) {
        setProject([result.lastProject]);
      }
    } catch (err) {
      setLookups({ state: "error", error: asCaptureError(err) });
    }
  }, []);

  useEffect(() => {
    void loadLookups();
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [loadLookups]);

  const submit = async () => {
    if (save.state === "saving") {
      return;
    }
    if (!name.trim()) {
      setSave({ state: "error", message: "Give the note a name." });
      return;
    }
    setSave({ state: "saving" });
    try {
      const saved = await callBackground<SaveResult>({
        type: "save",
        draft: { name: name.trim(), content, project: project[0] ?? null, tags, sourceUrl: ctx.url },
      });
      setSave({ state: "saved", saved });
    } catch (err) {
      setSave({ state: "error", message: asCaptureError(err).message });
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const options = lookups.state === "ready" ? lookups : { projects: [], tags: [] };
  const saving = save.state === "saving";
  const rootClass = variant === "overlay" ? "nl-root nl-backdrop" : "nl-root nl-window";

  return (
    <div
      className={rootClass}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        if (variant === "overlay" && e.target === e.currentTarget && !dirty && save.state !== "saving") {
          onClose();
        }
      }}
    >
      <div className="nl-card" role="dialog" aria-modal="true" aria-label="Save to Note and Learn">
        <header className="nl-header">
          <div>
            <h2 className="nl-title">{ctx.mode === "selection" ? "Save selection" : "Save page"}</h2>
            <p className="nl-sub" title={ctx.url}>
              {ctx.url || "No URL available for this page"}
            </p>
          </div>
          <button type="button" className="nl-icon-button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        {save.state === "saved" ? (
          <div className="nl-saved">
            <p className="nl-saved-title">Saved “{save.saved.name}”</p>
            <div className="nl-actions">
              <a className="nl-button nl-primary" href={save.saved.openUrl} target="_blank" rel="noopener noreferrer">
                Open in Note and Learn
              </a>
              <button type="button" className="nl-button" onClick={onClose} autoFocus>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            {lookups.state === "error" && (
              <div className="nl-banner" role="alert">
                <p>{lookups.error.message}</p>
                <div className="nl-actions">
                  {lookups.error.kind !== "http" && (
                    <button type="button" className="nl-button" onClick={() => void callBackground({ type: "open-options" })}>
                      Open settings
                    </button>
                  )}
                  <button type="button" className="nl-button" onClick={() => void loadLookups()}>
                    Retry
                  </button>
                </div>
              </div>
            )}

            <div className="nl-field">
              <label className="nl-label" htmlFor="nl-name">
                Name
              </label>
              <input
                id="nl-name"
                ref={nameRef}
                className="nl-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="nl-field">
              <label className="nl-label" htmlFor="nl-content">
                Content
              </label>
              <textarea
                id="nl-content"
                className="nl-input nl-textarea"
                rows={ctx.mode === "selection" ? 9 : 6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={saving}
              />
            </div>

            <Combobox
              label="Project"
              options={options.projects}
              value={project}
              onChange={(next) => {
                projectTouched.current = true;
                setProject(next);
              }}
              placeholder="Choose or create a project"
            />
            <Combobox label="Tags" options={options.tags} value={tags} onChange={setTags} multiple placeholder="Add tags" />

            {save.state === "error" && (
              <p className="nl-error" role="alert">
                {save.message}
              </p>
            )}

            <div className="nl-actions nl-footer">
              <span className="nl-hint">{navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter to save</span>
              <button type="button" className="nl-button" onClick={onClose} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="nl-button nl-primary" disabled={saving}>
                {saving ? "Saving…" : "Save note"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
