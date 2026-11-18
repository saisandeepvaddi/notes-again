import { addComposerChild$, realmPlugin, searchPlugin, useEditorSearch } from "@mdxeditor/editor";
import { useEffect, useRef } from "react";

function FindBar() {
  const { search, setSearch, next, prev, total, cursor, isSearchOpen, openSearch, closeSearch } =
    useEditorSearch();
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openSearch();
        requestAnimationFrame(() => field.current?.select());
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  useEffect(() => {
    if (isSearchOpen) field.current?.focus();
  }, [isSearchOpen]);

  if (!isSearchOpen) return null;
  return (
    <div
      role="search"
      className="fixed top-16 right-6 z-30 flex items-center gap-1.5 rounded-md border border-border bg-popover px-2 py-1.5 text-xs shadow-md"
    >
      <input
        ref={field}
        aria-label="Find in note"
        placeholder="Find in note"
        value={search ?? ""}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) prev();
            else next();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeSearch();
          }
        }}
        className="w-40 bg-transparent outline-none"
      />
      <span className="min-w-12 text-center text-muted-foreground" aria-live="polite">
        {search ? (total > 0 ? `${cursor} of ${total}` : "No matches") : ""}
      </span>
      <button type="button" aria-label="Previous match" onClick={prev} className="px-1">
        ↑
      </button>
      <button type="button" aria-label="Next match" onClick={next} className="px-1">
        ↓
      </button>
      <button type="button" aria-label="Close find" onClick={closeSearch} className="px-1">
        ✕
      </button>
    </div>
  );
}

const findBarPlugin = realmPlugin({
  init(realm) {
    realm.pub(addComposerChild$, FindBar);
  },
});

export const findPlugins = () => [searchPlugin(), findBarPlugin()];
